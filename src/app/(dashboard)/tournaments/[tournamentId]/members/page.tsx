import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { InviteForm } from "./invite-form";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:manage_staff")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("tournament_members")
    .select("id, role, created_at, profiles ( display_name, email )")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">スタッフ管理</h1>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          スタッフを追加(登録済みユーザーのみ)
        </h2>
        <InviteForm tournamentId={tournamentId} />
      </section>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {members?.map((m) => {
          const profile = m.profiles as unknown as { display_name: string; email: string } | null;
          return (
            <li key={m.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {profile?.display_name ?? "不明なユーザー"}
                </p>
                <p className="text-xs text-slate-500">{profile?.email}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {m.role}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
