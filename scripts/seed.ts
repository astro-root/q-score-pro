/**
 * scripts/seed.ts
 *
 * Creates a sample account + sample tournament so a fresh checkout has
 * something to look at immediately (master spec section 46: 初期アカウント
 * 作成 / サンプル大会の確認).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS on purpose - this is a
 * trusted, local/dev-only script, never run this against a shared
 * production project without knowing exactly what it does).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "エラー: NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。"
  );
  process.exit(1);
}

const SEED_EMAIL = "owner@example.com";
const SEED_PASSWORD = "password1234";

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`-> サンプルオーナーアカウントを作成/確認中: ${SEED_EMAIL}`);

  let userId: string;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "サンプル主催者" },
  });

  if (createError) {
    if (!createError.message.includes("already been registered")) {
      throw createError;
    }
    console.log("   既に存在するため既存ユーザーを使用します。");
    const { data: list, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = list.users.find((u) => u.email === SEED_EMAIL);
    if (!existing) throw new Error("既存ユーザーが見つかりませんでした");
    userId = existing.id;
  } else {
    userId = created.user.id;
  }

  console.log("-> サンプル大会を作成/確認中: sample-open-1");
  const { data: existingTournament } = await supabase
    .from("tournaments")
    .select("id")
    .eq("slug", "sample-open-1")
    .maybeSingle();

  let tournamentId: string;
  if (existingTournament) {
    tournamentId = existingTournament.id;
    console.log("   既に存在するのでスキップします。");
  } else {
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({
        slug: "sample-open-1",
        name: "第1回 サンプルオープン",
        summary: "Q-Score Pro の動作確認用サンプル大会です。",
        owner_id: userId,
        status: "DRAFT",
      })
      .select()
      .single();

    if (tournamentError) throw tournamentError;
    tournamentId = tournament.id;

    const { error: memberError } = await supabase.from("tournament_members").insert({
      tournament_id: tournamentId,
      user_id: userId,
      role: "OWNER",
    });
    if (memberError) throw memberError;
  }

  console.log("\n完了しました。");
  console.log(`  ログイン用メールアドレス: ${SEED_EMAIL}`);
  console.log(`  パスワード              : ${SEED_PASSWORD}`);
  console.log(`  サンプル大会ID          : ${tournamentId}`);
}

main().catch((err) => {
  console.error("seedに失敗しました:", err);
  process.exit(1);
});
