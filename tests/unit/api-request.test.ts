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
