"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Layers,
  LayoutDashboard,
  Megaphone,
  Monitor,
  ScrollText,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { NavGroup, NavIcon } from "@/lib/tournament/nav";

const ICONS: Record<NavIcon, ReactNode> = {
  overview: <LayoutDashboard className="h-4 w-4" />,
  cms: <FileText className="h-4 w-4" />,
  announcements: <Megaphone className="h-4 w-4" />,
  schedule: <CalendarDays className="h-4 w-4" />,
  "entry-fields": <ClipboardList className="h-4 w-4" />,
  entries: <Users className="h-4 w-4" />,
  participants: <Users className="h-4 w-4" />,
  stages: <Layers className="h-4 w-4" />,
  rounds: <Trophy className="h-4 w-4" />,
  layouts: <Monitor className="h-4 w-4" />,
  members: <UserCog className="h-4 w-4" />,
  "audit-log": <ScrollText className="h-4 w-4" />,
};

export function TournamentSidebar({
  tournamentId,
  groups,
}: {
  tournamentId: string;
  groups: NavGroup[];
}) {
  const pathname = usePathname();
  const base = `/tournaments/${tournamentId}`;

  const isActive = (path: string) => {
    const href = base + path;
    return path === "" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav aria-label="大会メニュー" className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label || "top"}>
          {g.label && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {g.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const active = isActive(i.path);
              return (
                <li key={i.path}>
                  <Link
                    href={base + i.path}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-body hover:bg-surface-muted hover:text-ink"
                    }`}
                  >
                    {ICONS[i.icon]}
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
