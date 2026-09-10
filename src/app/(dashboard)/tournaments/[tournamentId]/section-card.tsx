import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface SectionLink {
  href: string;
  label: string;
  external?: boolean;
}

export function SectionCard({
  icon,
  title,
  links,
  children,
}: {
  icon: ReactNode;
  title: string;
  links?: SectionLink[];
  children?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      {links && (
        <ul className="flex flex-col gap-1.5">
          {links.map((l) =>
            l.external ? (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-body hover:text-primary hover:underline"
                >
                  {l.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            ) : (
              <li key={l.href}>
                <Link href={l.href} className="text-sm font-medium text-primary hover:underline">
                  {l.label}
                </Link>
              </li>
            )
          )}
        </ul>
      )}
      {children}
    </Card>
  );
}
