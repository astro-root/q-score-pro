import type { ReactNode } from "react";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "live";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted border border-border",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  live: "bg-accent-soft text-accent-ink",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {tone === "live" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
