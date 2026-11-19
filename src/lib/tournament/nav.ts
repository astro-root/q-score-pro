import { can, type TournamentAction } from "@/lib/permissions";
import type { TournamentMemberRole } from "@/types/database";

/**
 * Tournament-level navigation. The single source of truth for "which admin
 * screens exist and who may see them". Visibility is derived from the same
 * ROLE_ACTIONS table as the API/RLS (via can()), so the menu never offers a
 * screen the role cannot use. Pages still enforce access themselves.
 *
 * IMPORTANT: each `action` must equal the gate the page and its API actually use
 * (see the can() call in that page.tsx). If they diverge the menu shows a link
 * that just redirects. Known gap: /layouts is gated by manage_cms in the page,
 * API and RLS, so STREAM_OPERATOR (manage_stream only) cannot reach it yet -
 * to be fixed with the staff-role redesign (Phase 5), not here.
 */
export type NavIcon =
  | "overview"
  | "cms"
  | "announcements"
  | "schedule"
  | "entry-fields"
  | "entries"
  | "participants"
  | "stages"
  | "rounds"
  | "layouts"
  | "members"
  | "audit-log";

export interface NavItem {
  /** path suffix after /tournaments/[id]; "" is the overview */
  path: string;
  label: string;
  icon: NavIcon;
  action: TournamentAction;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const TOURNAMENT_NAV: readonly NavGroup[] = [
  {
    label: "",
    items: [{ path: "", label: "概要", icon: "overview", action: "tournament:view" }],
  },
  {
    label: "募集・公開",
    items: [
      { path: "/cms", label: "大会ページ", icon: "cms", action: "tournament:manage_cms" },
      { path: "/announcements", label: "お知らせ", icon: "announcements", action: "tournament:manage_cms" },
      { path: "/schedule", label: "スケジュール", icon: "schedule", action: "tournament:manage_cms" },
      { path: "/entry-fields", label: "エントリーフォーム", icon: "entry-fields", action: "tournament:manage_cms" },
      { path: "/entries", label: "エントリー一覧", icon: "entries", action: "tournament:manage_entries" },
    ],
  },
  {
    label: "大会運営",
    items: [
      { path: "/participants", label: "参加者", icon: "participants", action: "tournament:manage_participants" },
      { path: "/stages", label: "ステージ", icon: "stages", action: "tournament:manage_rounds" },
      { path: "/rounds", label: "ラウンド・得点操作", icon: "rounds", action: "tournament:view" },
      { path: "/layouts", label: "得点表示・OBS", icon: "layouts", action: "tournament:manage_cms" },
    ],
  },
  {
    label: "管理",
    items: [
      { path: "/members", label: "スタッフ", icon: "members", action: "tournament:manage_staff" },
      { path: "/audit-log", label: "監査ログ", icon: "audit-log", action: "tournament:view_audit_log" },
    ],
  },
];

/** Groups/items the given role may see; empty groups are dropped. */
export function visibleNav(role: TournamentMemberRole | null): NavGroup[] {
  return TOURNAMENT_NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => can(role, i.action)),
  })).filter((g) => g.items.length > 0);
}
