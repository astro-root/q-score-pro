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
