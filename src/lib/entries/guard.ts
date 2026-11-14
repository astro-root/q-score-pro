/**
 * 公開エントリーの INSERT 失敗を HTTP レスポンスに対応づける (R-05)。
 *
 * supabase/migrations/0011_entry_guard_and_member_protection.sql のトリガーは
 * 次の形で失敗を表す:
 *   23505 / entry_duplicate     : 同じ大会に同じメールで SUBMITTED のエントリーが既にある
 *   QS429 / entry_rate_limited  : 大会単位の受付上限(1分間)を超えた
 * RLS 違反(エントリー受付中ではない)は従来どおり 409 にする。
 */
export interface EntryInsertErrorLike {
  message: string;
  code?: string | null;
}

export interface MappedEntryError {
  status: number;
  headers?: Record<string, string>;
  body: { error: string; message?: string };
}

export function mapEntryInsertError(error: EntryInsertErrorLike): MappedEntryError {
  if (error.code === "23505" || error.message.includes("entry_duplicate")) {
    return {
      status: 409,
      body: {
        error: "entry_duplicate",
        message: "このメールアドレスは既にエントリー済みです。変更や取り下げは主催者にご連絡ください",
      },
    };
  }
  if (error.code === "QS429" || error.message.includes("entry_rate_limited")) {
    return {
      status: 429,
      headers: { "Retry-After": "60" },
      body: {
        error: "entry_rate_limited",
        message: "短時間にエントリーが集中しています。1分ほど待ってからもう一度お試しください",
      },
    };
  }
  if (error.message.toLowerCase().includes("row-level security")) {
    return {
      status: 409,
      body: { error: "entries_closed", message: "現在この大会はエントリーを受け付けていません" },
    };
  }
  return { status: 500, body: { error: error.message } };
}
