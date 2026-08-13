import { createClient } from "@/lib/supabase/server";
import type { TournamentMemberRole } from "@/types/database";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Returns the authenticated user, or null. Always re-validates against
 * Supabase Auth (getUser), never trusts a locally cached session, since
 * this is what stands between a staff member and someone else's tournament.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    displayName: profile?.display_name ?? user.email ?? "unknown",
  };
}

/**
 * Returns the caller's role on a specific tournament, or null if they are
 * not staff of it. Relies on RLS (tournament_members_select_self /
 * tournament_members_select_staff) as the source of truth - this function
 * is a convenience wrapper, not an independent authorization mechanism.
 */
export async function getTournamentRole(
  tournamentId: string
): Promise<TournamentMemberRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("tournament_members")
    .select("role")
    .eq("tournament_id", tournamentId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.role ?? null;
}
