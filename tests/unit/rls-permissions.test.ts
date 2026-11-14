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
