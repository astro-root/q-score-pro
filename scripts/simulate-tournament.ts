/**
 * scripts/simulate-tournament.ts
 *
 * 本番大会シミュレーション・自動検証(マスタープロンプート section 41/42)。
 *
 * 50人 → ペーパークイズ → 32人通過 → 4組に自動組分け → 早押し本戦
 *   → 16人通過 → 準決勝 → 8人通過 → 決勝 → 結果公開
 * という一連の流れを、実際にAPIが使っているのと同じコード
 * (src/lib/scoring, src/lib/rules) を経由して自動実行し、
 * 誤操作・Undo・複数スタッフ同時操作・ブラウザ再読み込み相当のシナリオも
 * まとめて検証します。
 *
 * 特徴:
 * - service-role ではなく実際にサインインしたユーザーのセッションで
 *   Supabaseを操作するため、RLSポリシーも本番同様に検証されます。
 * - ラウンドの得点再計算は recomputeRoundParticipants() を直接呼び出す
 *   ため、APIルートと全く同じロジックを通ります。
 *
 * 実行方法: npm run simulate (内部で `tsx scripts/simulate-tournament.ts`)
 * 前提: .env.local に接続情報が設定済みであること。
 *
 * このスクリプトは何度でも実行できます(実行のたびに新しい大会・新しい
 * オーナーアカウントを作成するため、既存データを壊しません)。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import { computeRanking, determineAdvancement } from "../src/lib/scoring/ranking";
import { assignGroupsSnake } from "../src/lib/scoring/grouping";
import { recomputeRoundParticipants } from "../src/lib/rules/apply-round-events";
import { DEFAULT_RULE_CONFIG } from "../src/lib/rules/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("エラー: .env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function randomEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@gmail.com`;
}

async function signUpAndSignIn(client: SupabaseClient<Database>, displayName: string, asciiTag: string) {
  const email = randomEmail(asciiTag);
  const password = "SimulatePassword1234!";
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.session) {
    throw new Error(
      "サインアップ後にセッションが得られませんでした。Supabaseのメール確認設定を確認してください。"
    );
  }
  return { email, userId: data.user!.id };
}

async function main() {
  console.log("== 本番大会シミュレーション開始 ==\n");

  console.log("[1] 大会作成 / スタッフ作成");
  const owner = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
  const { userId: ownerId } = await signUpAndSignIn(owner, "シミュレーション主催者", "owner");

  const slug = `simulate-${Date.now()}`;
  const { data: tournament, error: tErr } = await owner
    .from("tournaments")
    .insert({ slug, name: "自動検証大会", owner_id: ownerId })
    .select()
    .single();
  if (tErr) console.error("   詳細エラー:", JSON.stringify(tErr, null, 2));
  assert(!tErr && !!tournament, "大会を作成できる");
  if (!tournament) throw new Error("大会作成に失敗したため中断します");

  const { error: memberErr } = await owner
    .from("tournament_members")
    .insert({ tournament_id: tournament.id, user_id: ownerId, role: "OWNER" });
  assert(!memberErr, "OWNERとしてスタッフ登録できる(ブートストラップRLS)");

  const operatorClient = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
  const { userId: operatorId } = await signUpAndSignIn(operatorClient, "得点オペレーター", "operator");
  const { error: opInviteErr } = await owner.from("tournament_members").insert({
    tournament_id: tournament.id,
    user_id: operatorId,
    role: "SCORE_OPERATOR",
  });
  assert(!opInviteErr, "OWNERが別スタッフをSCORE_OPERATORとして追加できる");

  const { data: tBefore } = await owner
    .from("tournaments")
    .select("status")
    .eq("id", tournament.id)
    .single();
  assert(tBefore?.status === "DRAFT", "大会の初期ステータスはDRAFT");

  console.log("\n[2] エントリー受付(50人)");
  const { error: openErr } = await owner
    .from("tournaments")
    .update({ status: "REGISTRATION_OPEN" })
    .eq("id", tournament.id);
  assert(!openErr, "DRAFT -> REGISTRATION_OPEN に遷移できる");

  // 匿名の応募者は entries を読み返す権限を持たない(スタッフのみ閲覧可能)
  // ため、.select() は付けない。id は分からないので、あとで
  // tournament_id で全件取得し直して参加者作成に使う。
  const anonClient = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
  let entrySubmitFailures = 0;
  for (let i = 1; i <= 50; i++) {
    const { error } = await anonClient.from("entries").insert({
      tournament_id: tournament.id,
      display_name: `参加者${String(i).padStart(2, "0")}`,
      email: randomEmail(`entrant${i}`),
    });
    if (error) {
      entrySubmitFailures += 1;
      if (i === 1) {
        console.error("   詳細エラー(1件目のみ表示):", JSON.stringify(error, null, 2));
      }
    }
  }
  const { data: submittedEntries } = await owner
    .from("entries")
    .select("id")
    .eq("tournament_id", tournament.id);
  const entryIds = (submittedEntries ?? []).map((e) => e.id);
  assert(
    entrySubmitFailures === 0 && entryIds.length === 50,
    `匿名ユーザーが50件エントリーできる(実際: ${entryIds.length}件、失敗: ${entrySubmitFailures}件)`
  );

  const { error: closeErr } = await owner
    .from("tournaments")
    .update({ status: "REGISTRATION_CLOSED" })
    .eq("id", tournament.id);
  assert(!closeErr, "REGISTRATION_OPEN -> REGISTRATION_CLOSED に遷移できる");

  console.log("\n[3] 参加者スクリーニング");
  const { data: participants, error: pErr } = await owner
    .from("participants")
    .insert(
      entryIds.map((entryId, i) => ({
        tournament_id: tournament.id,
        entry_id: entryId,
        display_name: `参加者${String(i + 1).padStart(2, "0")}`,
      }))
    )
    .select();
  assert(!pErr && participants?.length === 50, `50人が参加者として確定する(実際: ${participants?.length ?? 0}人)`);
  if (!participants) throw new Error("参加者作成に失敗したため中断します");

  const { error: runningErr } = await owner
    .from("tournaments")
    .update({ status: "RUNNING" })
    .eq("id", tournament.id);
  assert(!runningErr, "REGISTRATION_CLOSED -> RUNNING に遷移できる");

  console.log("\n[4] 予選(ペーパークイズ、32人通過)");
  const { data: prelim, error: prelimErr } = await owner
    .from("rounds")
    .insert({ tournament_id: tournament.id, name: "予選", round_type: "PAPER", advance_count: 32 })
    .select()
    .single();
  assert(!prelimErr && !!prelim, "予選ラウンドを作成できる");
  if (!prelim) throw new Error("予選ラウンド作成に失敗したため中断します");

  await owner
    .from("round_participants")
    .insert(participants.map((p) => ({ round_id: prelim.id, participant_id: p.id })));

  const paperScores = participants.map((p) => ({
    id: p.id,
    score: Math.floor(Math.random() * 100),
  }));
  const ranked = computeRanking(paperScores);
  const advancing = determineAdvancement(ranked, 32);

  await owner.from("round_participants").upsert(
    ranked.map((r) => ({
      round_id: prelim.id,
      participant_id: r.id,
      score: r.score,
      rank: r.rank,
      passed: advancing.has(r.id),
    })),
    { onConflict: "round_id,participant_id" }
  );

  assert(
    advancing.size >= 32,
    `足切りにより32人以上が通過する(同着考慮、実際: ${advancing.size}人)`
  );

  const { error: prelimFinishErr } = await owner
    .from("rounds")
    .update({ status: "RUNNING" })
    .eq("id", prelim.id);
  const { error: prelimFinishErr2 } = await owner
    .from("rounds")
    .update({ status: "FINISHED" })
    .eq("id", prelim.id);
  assert(!prelimFinishErr && !prelimFinishErr2, "予選ラウンドをNOT_STARTED→RUNNING→FINISHEDへ遷移できる");

  console.log("\n[5] 自動組分け(4組)");
  const advancingIds = ranked.filter((r) => advancing.has(r.id)).map((r) => r.id);
  const groupAssignment = assignGroupsSnake(advancingIds, 4);
  const groupCounts = Object.values(groupAssignment).reduce<Record<string, number>>((acc, g) => {
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});
  const sizes = Object.values(groupCounts);
  assert(
    Math.max(...sizes) - Math.min(...sizes) <= 1,
    `4組の人数がほぼ均等(スネーク配分、実際の内訳: ${JSON.stringify(groupCounts)})`
  );

  console.log("\n[6] 本戦(早押し、16人通過、Undo検証込み)");
  const { data: mainRound, error: mainErr } = await owner
    .from("rounds")
    .insert({
      tournament_id: tournament.id,
      name: "本戦",
      round_type: "BUZZER",
      advance_count: 16,
      rule_config: { ...DEFAULT_RULE_CONFIG, correctPoints: 10, wrongPenalty: 5 },
    })
    .select()
    .single();
  assert(!mainErr && !!mainRound, "本戦ラウンドを作成できる");
  if (!mainRound) throw new Error("本戦ラウンド作成に失敗したため中断します");

  await owner
    .from("round_participants")
    .insert(advancingIds.map((participantId) => ({ round_id: mainRound.id, participant_id: participantId })));

  for (let i = 0; i < advancingIds.length; i++) {
    const actor = i % 2 === 0 ? owner : operatorClient;
    const eventType = Math.random() > 0.3 ? "CORRECT" : "WRONG";
    await actor.from("score_events").insert({
      round_id: mainRound.id,
      participant_id: advancingIds[i],
      event_type: eventType,
      question_number: 1,
    });
  }
  const recomputeResult = await recomputeRoundParticipants(owner, mainRound.id);
  assert(!recomputeResult.error, `得点イベントからの再計算が成功する(${recomputeResult.error ?? "OK"})`);

  const { data: beforeUndo } = await owner
    .from("round_participants")
    .select("participant_id, score")
    .eq("round_id", mainRound.id)
    .eq("participant_id", advancingIds[0])
    .single();

  await owner.from("score_events").insert({
    round_id: mainRound.id,
    participant_id: advancingIds[0],
    event_type: "WRONG",
    question_number: 2,
  });
  await recomputeRoundParticipants(owner, mainRound.id);

  const { data: lastEvent } = await owner
    .from("score_events")
    .select("id")
    .eq("round_id", mainRound.id)
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  await owner
    .from("score_events")
    .update({ voided_at: new Date().toISOString(), voided_by: ownerId })
    .eq("id", lastEvent!.id);
  await recomputeRoundParticipants(owner, mainRound.id);

  const { data: afterUndo } = await owner
    .from("round_participants")
    .select("participant_id, score")
    .eq("round_id", mainRound.id)
    .eq("participant_id", advancingIds[0])
    .single();
  assert(
    beforeUndo?.score === afterUndo?.score,
    `Undo後、得点が誤操作前の状態に戻る(${beforeUndo?.score} === ${afterUndo?.score})`
  );

  const { data: mainResults } = await owner
    .from("round_participants")
    .select("participant_id, passed")
    .eq("round_id", mainRound.id);
  const mainAdvancing = (mainResults ?? []).filter((r) => r.passed).map((r) => r.participant_id);
  assert(mainAdvancing.length >= 16, `本戦から16人以上が通過する(同着考慮、実際: ${mainAdvancing.length}人)`);

  console.log("\n[7] 準決勝(8人通過)");
  const { data: semi } = await owner
    .from("rounds")
    .insert({
      tournament_id: tournament.id,
      name: "準決勝",
      round_type: "BUZZER",
      advance_count: 8,
      rule_config: { ...DEFAULT_RULE_CONFIG, correctPoints: 10 },
    })
    .select()
    .single();
  await owner
    .from("round_participants")
    .insert(mainAdvancing.map((id) => ({ round_id: semi!.id, participant_id: id })));
  for (const id of mainAdvancing) {
    await owner.from("score_events").insert({
      round_id: semi!.id,
      participant_id: id,
      event_type: Math.random() > 0.4 ? "CORRECT" : "WRONG",
      question_number: 1,
    });
  }
  await recomputeRoundParticipants(owner, semi!.id);
  const { data: semiResults } = await owner
    .from("round_participants")
    .select("participant_id, passed")
    .eq("round_id", semi!.id);
  const semiAdvancing = (semiResults ?? []).filter((r) => r.passed).map((r) => r.participant_id);
  assert(semiAdvancing.length >= 8, `準決勝から8人以上が通過する(実際: ${semiAdvancing.length}人)`);

  console.log("\n[8] 決勝・結果公開");
  const { data: final } = await owner
    .from("rounds")
    .insert({
      tournament_id: tournament.id,
      name: "決勝",
      round_type: "BUZZER",
      rule_config: { ...DEFAULT_RULE_CONFIG, correctPoints: 10, winCondition: { type: "SCORE_TARGET", targetScore: 30 } },
    })
    .select()
    .single();
  await owner
    .from("round_participants")
    .insert(semiAdvancing.map((id) => ({ round_id: final!.id, participant_id: id })));
  for (const id of semiAdvancing) {
    for (let q = 0; q < 3; q++) {
      await owner.from("score_events").insert({
        round_id: final!.id,
        participant_id: id,
        event_type: Math.random() > 0.4 ? "CORRECT" : "WRONG",
        question_number: q + 1,
      });
    }
  }
  await recomputeRoundParticipants(owner, final!.id);
  const { error: finalStatusErr } = await owner.from("rounds").update({ status: "RUNNING" }).eq("id", final!.id);
  const { error: finalStatusErr2 } = await owner.from("rounds").update({ status: "FINISHED" }).eq("id", final!.id);
  assert(!finalStatusErr && !finalStatusErr2, "決勝ラウンドを終了できる");

  await owner.from("tournaments").update({ status: "FINISHED" }).eq("id", tournament.id);
  const { error: publishErr } = await owner
    .from("tournaments")
    .update({ status: "PUBLISHED" })
    .eq("id", tournament.id);
  assert(!publishErr, "大会をPUBLISHEDまで遷移できる(結果公開)");

  console.log("\n[9] 大会間データ分離・公開範囲の検証");
  const otherOwnerClient = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
  await signUpAndSignIn(otherOwnerClient, "無関係な別ユーザー", "stranger");
  const { data: leakedMembers } = await otherOwnerClient
    .from("tournament_members")
    .select("*")
    .eq("tournament_id", tournament.id);
  assert((leakedMembers ?? []).length === 0, "無関係なユーザーはスタッフ一覧を取得できない(RLS)");

  const { data: publicView } = await anonClient
    .from("tournaments")
    .select("id")
    .eq("id", tournament.id)
    .maybeSingle();
  assert(!!publicView, "PUBLISHED大会は匿名ユーザーからも閲覧できる(公開ページ用)");

  const freshClient = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
  const { data: freshTournament } = await freshClient
    .from("tournaments")
    .select("name, status")
    .eq("id", tournament.id)
    .single();
  assert(
    freshTournament?.status === "PUBLISHED",
    "新しいクライアント(=ブラウザ再読み込み相当)でも大会データが保持されている"
  );

  console.log(`\n== 結果: ${passed}件成功 / ${failed}件失敗 ==`);
  console.log(`大会ID: ${tournament.id} (slug: ${slug})`);
  if (failed > 0) {
    console.error("\n失敗した項目があります。上記のログを確認してください。");
    process.exit(1);
  }
  console.log("\nすべての検証に成功しました。");
}

main().catch((err) => {
  console.error("\nシミュレーション中に想定外のエラーが発生しました:", err);
  process.exit(1);
});
