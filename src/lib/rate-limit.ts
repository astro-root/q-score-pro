/**
 * 固定ウィンドウ方式のメモリ内レート制限 (R-05)。
 *
 * 位置づけ: ベストエフォート。プロセスごとのメモリに保持するため、サーバーレス
 * 環境で複数インスタンスに分かれると、インスタンスごとに数えることになる。
 * DB を直接叩く経路は止められないので、本当の防御線は DB トリガー
 * (0011 の guard_entry_insert) であり、これは「普通のスクリプトの連打」を
 * 早めに弾いて DB と無料枠を守るための前段。
 */
export interface RateLimitResult {
  allowed: boolean;
  /** 次に許可されるまでの秒数 (allowed=false のときのみ > 0) */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  /** テスト用に時刻を差し替える */
  now?: () => number;
  /** 保持するキー数の上限。超えたら期限切れを掃除する */
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  const buckets = new Map<string, { windowStart: number; count: number }>();

  function sweep(t: number) {
    for (const [key, b] of buckets) {
      if (t - b.windowStart >= windowMs) buckets.delete(key);
    }
  }

  return {
    check(key) {
      const t = now();
      if (buckets.size >= maxKeys) sweep(t);

      const b = buckets.get(key);
      if (!b || t - b.windowStart >= windowMs) {
        buckets.set(key, { windowStart: t, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (b.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((b.windowStart + windowMs - t) / 1000)),
        };
      }
      b.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/**
 * リクエスト元のIP。リバースプロキシ(Vercel等)の背後でのみ信頼できる値。
 * 取れないときは "unknown" としてまとめて数える。
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
