import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, name, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!tournament) notFound();

  const { data: fields } = await supabase
    .from("entry_form_fields")
    .select("*")
    .eq("tournament_id", tournament.id)
    .order("sort_order", { ascending: true });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">{tournament.name}</h1>
        <p className="mb-6 text-sm text-slate-500">エントリーフォーム</p>

        {tournament.status === "REGISTRATION_OPEN" ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <EntryForm tournamentId={tournament.id} fields={fields ?? []} />
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            現在この大会はエントリーを受け付けていません。
          </div>
        )}
      </div>
    </div>
  );
}
