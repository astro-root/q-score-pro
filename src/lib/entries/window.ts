/**
 * エントリー受付の状態判定(純粋関数)。
 * 本当の門は DB の RLS (0015: entries_insert_public_when_open)。ここは、
 * 受付できない理由を応募者にわかりやすく伝えるための判定で、RLS と同じ条件にしてある。
 */
export type EntryWindowState =
  | "open"
  | "not_open_yet"
  | "deadline_passed"
  | "registration_closed"
  | "cancelled";

export interface EntryWindowInput {
  status: string;
  opensAt: string | null;
  closesAt: string | null;
}

function parse(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function entryWindowState(input: EntryWindowInput, now: Date): EntryWindowState {
  if (input.status === "CANCELLED") return "cancelled";
  if (input.status !== "REGISTRATION_OPEN") return "registration_closed";
  const opens = parse(input.opensAt);
  const closes = parse(input.closesAt);
  const t = now.getTime();
  if (opens !== null && t < opens) return "not_open_yet";
  if (closes !== null && t >= closes) return "deadline_passed";
  return "open";
}

/** 日本時間 (JST) で "2026/11/20 10:00" の形式にする。サーバーのタイムゾーンに依存しない。 */
export function formatJst(value: string | null): string {
  const t = parse(value);
  if (t === null) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(t));
}

export function formatEntryWindow(opensAt: string | null, closesAt: string | null): string | null {
  if (!opensAt && !closesAt) return null;
  return `${opensAt ? formatJst(opensAt) : "開始日時の指定なし"} 〜 ${closesAt ? formatJst(closesAt) : "締切の指定なし"}`;
}

export function entryClosedMessage(state: EntryWindowState, input: EntryWindowInput): string {
  switch (state) {
    case "cancelled":
      return "この大会は中止されました。";
    case "not_open_yet":
      return `エントリーの受付は ${formatJst(input.opensAt)} (日本時間)に開始します。`;
    case "deadline_passed":
      return `エントリーの受付は ${formatJst(input.closesAt)} (日本時間)に締め切りました。`;
    case "registration_closed":
      return "現在この大会はエントリーを受け付けていません。";
    case "open":
      return "";
  }
}

/** <input type="datetime-local"> の値("2026-11-20T10:00")を日本時間として解釈した ISO(UTC) にする。空は null。 */
export function fromJstInputValue(value: string): string | null {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}:00+09:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** ISO を <input type="datetime-local"> の値(日本時間)にする。空・不正は空文字。 */
export function toJstInputValue(value: string | null): string {
  const t = parse(value);
  if (t === null) return "";
  // JST は夏時間がなく UTC+9 固定なので、+9時間してUTC表記を切り出す
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
