"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/api/request";
import { fromJstInputValue, toJstInputValue } from "@/lib/entries/window";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FormMessage } from "@/components/ui/Field";

const inputClass =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function EntrySettings({
  tournamentId,
  initialOpensAt,
  initialClosesAt,
  initialAutoRegister,
  statusLabel,
  isOpenStatus,
}: {
  tournamentId: string;
  initialOpensAt: string | null;
  initialClosesAt: string | null;
  initialAutoRegister: boolean;
  statusLabel: string;
  isOpenStatus: boolean;
}) {
  const router = useRouter();
  const [opens, setOpens] = useState(toJstInputValue(initialOpensAt));
  const [closes, setCloses] = useState(toJstInputValue(initialClosesAt));
  const [auto, setAuto] = useState(initialAutoRegister);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function save() {
    const opensAt = opens ? fromJstInputValue(opens) : null;
    const closesAt = closes ? fromJstInputValue(closes) : null;
    if ((opens && !opensAt) || (closes && !closesAt)) {
      setMessage({ tone: "error", text: "日時の形式が正しくありません" });
      return;
    }
    if (opensAt && closesAt && Date.parse(opensAt) >= Date.parse(closesAt)) {
      setMessage({ tone: "error", text: "締切は開始より後の日時にしてください" });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await requestJson(`/api/tournaments/${tournamentId}/entry-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opensAt, closesAt, autoRegister: auto }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: `保存できませんでした: ${res.message}` });
      return;
    }
    setMessage({ tone: "success", text: "受付設定を保存しました" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-ink">受付設定</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-body">
          現在の大会ステータス: <strong className="text-ink">{statusLabel}</strong>
          {isOpenStatus ? (
            <span className="ml-2 text-success">公開フォームは受付中です(期間の指定がある場合はその範囲内のみ)。</span>
          ) : (
            <span className="ml-2 text-warning">
              ステータスが「エントリー受付中」になるまで、期間を設定しても公開フォームは受け付けません。
            </span>
          )}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-body">
            受付開始(日本時間・空欄で制限なし)
            <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-body">
            受付締切(日本時間・空欄で制限なし)
            <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={inputClass} />
          </label>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm text-body">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            <strong className="text-ink">応募があったら参加者に自動で追加する</strong>
            <span className="mt-0.5 block text-xs text-muted">
              オフのときは、エントリー一覧から主催者が選んで参加者へ取り込みます(スクリーニングする大会向け)。
              オンにしても、応募(エントリー)と参加者は別のデータのまま残り、設定後に届いた応募から対象になります。
              すでに届いている応募は自動では追加されません。
            </span>
          </span>
        </label>

        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <div>
          <Button onClick={save} disabled={busy}>
            {busy ? "保存中..." : "受付設定を保存"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
