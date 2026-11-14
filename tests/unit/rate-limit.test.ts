import { describe, expect, it } from "vitest";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createRateLimiter", () => {
  it("上限までは許可し、超えたら拒否して待ち時間を返す", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    c.advance(20_000);
    const blocked = rl.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(40);
  });

  it("ウィンドウが過ぎればリセットされる", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
    c.advance(1000);
    expect(rl.check("a").allowed).toBe(true);
  });

  it("キーごとに独立して数える", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: clock().now });
    expect(rl.check("t1:1.1.1.1").allowed).toBe(true);
    expect(rl.check("t1:2.2.2.2").allowed).toBe(true);
    expect(rl.check("t2:1.1.1.1").allowed).toBe(true);
    expect(rl.check("t1:1.1.1.1").allowed).toBe(false);
  });

  it("キー数が上限を超えたら期限切れのキーを掃除する", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, now: c.now });
    rl.check("a");
    rl.check("b");
    c.advance(5000);
    // 掃除されるので、期限切れの a は新しいウィンドウとして許可される
    expect(rl.check("c").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("x-forwarded-for の先頭を使う", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientIpFrom(h)).toBe("203.0.113.5");
  });
  it("無ければ x-real-ip、それも無ければ unknown", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
