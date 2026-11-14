/**
 * ブラウザから内部APIを呼ぶための薄いラッパー。
 *
 * 目的: 「fetch の応答を確認せず、失敗しても成功したふりをする」ことを防ぐ。
 * 得点操作画面のように無反応の失敗が致命的な画面では、必ず ok を確認して
 * 失敗理由を画面に出すこと。
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string };

function describe(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; error?: unknown };
    if (typeof b.message === "string" && b.message) return b.message;
    if (typeof b.error === "string" && b.error) return b.error;
  }
  if (status === 401 || status === 403) return "この操作を行う権限がありません";
  return `サーバーエラー (HTTP ${status})`;
}

export async function requestJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, message: "通信に失敗しました。ネットワークを確認してください" };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, status: response.status, message: describe(response.status, body) };
  }
  return { ok: true, status: response.status, data: body as T };
}
