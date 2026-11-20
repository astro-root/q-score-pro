import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { entryClosedMessage, entryWindowState, formatEntryWindow } from "@/lib/entries/window";
import { EntryForm } from "./entry-form";

export default async function PublicEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, entry_opens_at, entry_closes_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!tournament) notFound();

  const { data: fields } = await supabase
    .from("entry_form_fields")
    .select("*")
    .eq("tournament_id", tournament.id)
    .order("sort_order", { ascending: true });

  const windowInput = {
    status: tournament.status,
    opensAt: tournament.entry_opens_at,
    closesAt: tournament.entry_closes_at,
  };
  const state = entryWindowState(windowInput, new Date());
  const windowText = formatEntryWindow(tournament.entry_opens_at, tournament.entry_closes_at);

  return (
    <div className="min-h-screen bg-surface-muted px-4 py-10">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-1 text-2xl font-bold text-ink">{tournament.name}</h1>
        <p className="mb-1 text-sm text-muted">エントリーフォーム</p>
        {windowText && (
          <p className="mb-6 text-xs text-muted">受付期間(日本時間): {windowText}</p>
        )}
        {!windowText && <div className="mb-5" />}

        {state === "open" ? (
          <div className="rounded-lg border border-border bg-surface p-6">
            <EntryForm tournamentId={tournament.id} fields={fields ?? []} />
          </div>
        ) : (
          <div
            role="status"
            className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-body"
          >
            {entryClosedMessage(state, windowInput)}
          </div>
        )}
      </div>
    </div>
  );
}
