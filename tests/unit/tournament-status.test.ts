import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  NEXT_STATUS,
  TOURNAMENT_STATUS_LABEL,
  canTransition,
  mapStatusChangeError,
  transitionRequiresReason,
} from "@/lib/tournament/status";
import type { TournamentStatus } from "@/types/database";

const ALL_STATUSES = Object.keys(ALLOWED_TRANSITIONS) as TournamentStatus[];

describe("tournament status transitions", () => {
  it("allows the normal forward flow", () => {
    expect(canTransition("DRAFT", "REGISTRATION_OPEN")).toBe(true);
    expect(canTransition("REGISTRATION_OPEN", "REGISTRATION_CLOSED")).toBe(true);
    expect(canTransition("REGISTRATION_CLOSED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "FINISHED")).toBe(true);
    expect(canTransition("FINISHED", "PUBLISHED")).toBe(true);
  });

  it("allows reopening entries before the tournament starts", () => {
    expect(canTransition("REGISTRATION_OPEN", "DRAFT")).toBe(true);
    expect(canTransition("REGISTRATION_CLOSED", "REGISTRATION_OPEN")).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(canTransition("DRAFT", "RUNNING")).toBe(false);
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransition("REGISTRATION_OPEN", "FINISHED")).toBe(false);
  });

  it("rejects moving backwards once running", () => {
    expect(canTransition("RUNNING", "REGISTRATION_OPEN")).toBe(false);
    expect(canTransition("FINISHED", "RUNNING")).toBe(false);
  });
});

describe("公開後の訂正 (R-08)", () => {
  it("PUBLISHED からは RUNNING にだけ戻せる", () => {
    expect(ALLOWED_TRANSITIONS.PUBLISHED).toEqual(["RUNNING"]);
    expect(canTransition("PUBLISHED", "DRAFT")).toBe(false);
    expect(canTransition("PUBLISHED", "FINISHED")).toBe(false);
  });

  it("訂正は理由が必須、通常の遷移は不要", () => {
    expect(transitionRequiresReason("PUBLISHED", "RUNNING")).toBe(true);
    expect(transitionRequiresReason("DRAFT", "REGISTRATION_OPEN")).toBe(false);
    expect(transitionRequiresReason("RUNNING", "FINISHED")).toBe(false);
    expect(transitionRequiresReason("FINISHED", "PUBLISHED")).toBe(false);
  });
});

describe("中止 CANCELLED (R-08)", () => {
  it("受付中・受付締切・開催中から中止できる", () => {
    expect(canTransition("REGISTRATION_OPEN", "CANCELLED")).toBe(true);
    expect(canTransition("REGISTRATION_CLOSED", "CANCELLED")).toBe(true);
    expect(canTransition("RUNNING", "CANCELLED")).toBe(true);
  });

  it("下書き・終了・結果公開からは中止できない", () => {
    expect(canTransition("DRAFT", "CANCELLED")).toBe(false);
    expect(canTransition("FINISHED", "CANCELLED")).toBe(false);
    expect(canTransition("PUBLISHED", "CANCELLED")).toBe(false);
  });

  it("中止は理由が必須で、終端状態(どこへも戻せない)", () => {
    expect(transitionRequiresReason("RUNNING", "CANCELLED")).toBe(true);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe("画面用の定義", () => {
  it("全てのステータスにラベルと NEXT_STATUS の定義がある", () => {
    for (const s of ALL_STATUSES) {
      expect(TOURNAMENT_STATUS_LABEL[s]).toBeTruthy();
      expect(s in NEXT_STATUS).toBe(true);
    }
  });

  it("NEXT_STATUS は常に許可された遷移で、理由を要しない", () => {
    for (const s of ALL_STATUSES) {
      const next = NEXT_STATUS[s];
      if (next === null) continue;
      expect(canTransition(s, next)).toBe(true);
      expect(transitionRequiresReason(s, next)).toBe(false);
    }
  });
});

describe("mapStatusChangeError", () => {
  it("遷移エラーは 409", () => {
    expect(mapStatusChangeError({ code: "22023", message: "invalid_status_transition" }).status).toBe(409);
  });
  it("理由なしは 400", () => {
    expect(mapStatusChangeError({ code: "22023", message: "status_reason_required" }).status).toBe(400);
  });
  it("大会が無い・権限が無い(P0002)は 404", () => {
    expect(mapStatusChangeError({ code: "P0002", message: "tournament_not_found" }).status).toBe(404);
  });
  it("想定外は 500", () => {
    expect(mapStatusChangeError({ message: "boom" }).status).toBe(500);
  });
});

// TS の遷移表と、DB(マイグレーション 0013)の遷移表が一致していること。
// DB側は PostgREST 直叩きでも効く「本当の防御線」なので、ずれると画面は許すのに
// DBが拒否する(またはその逆)という不具合になる。
describe("遷移表が DB(0013)と一致する", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/0013_tournament_status_workflow.sql"),
    "utf8"
  );

  function sqlTransitions(): Set<string> {
    const fn = sql.slice(sql.indexOf("function public.tournament_status_transition_allowed"));
    const body = fn.slice(fn.indexOf("in ("), fn.indexOf(");"));
    const pairs = new Set<string>();
    for (const m of body.matchAll(/\('([A-Z_]+)',\s*'([A-Z_]+)'\)/g)) {
      pairs.add(`${m[1]}->${m[2]}`);
    }
    return pairs;
  }

  it("全ての遷移が一致する(過不足なし)", () => {
    const fromTs = new Set<string>();
    for (const from of ALL_STATUSES) {
      for (const to of ALLOWED_TRANSITIONS[from]) fromTs.add(`${from}->${to}`);
    }
    expect(sqlTransitions()).toEqual(fromTs);
  });

  it("理由が必要な遷移の条件が一致する", () => {
    const fn = sql.slice(sql.indexOf("function public.tournament_status_requires_reason"));
    expect(fn).toContain("p_from = 'PUBLISHED' or p_to = 'CANCELLED'");
    // TS側の判定が、この条件(PUBLISHED からの遷移 or CANCELLED への遷移)と同じ
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(transitionRequiresReason(from, to)).toBe(from === "PUBLISHED" || to === "CANCELLED");
      }
    }
  });

  it("マイグレーション 0012 が CANCELLED を enum に追加している", () => {
    const m12 = readFileSync(
      join(process.cwd(), "supabase/migrations/0012_tournament_status_cancelled.sql"),
      "utf8"
    );
    expect(m12).toMatch(/add value if not exists 'CANCELLED'/);
  });
});
