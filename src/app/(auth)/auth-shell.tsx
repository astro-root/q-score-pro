import type { ReactNode } from "react";
import { GlowBackdrop } from "@/components/ui/GlowBackdrop";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-panel px-10 py-12 text-white lg:flex">
        <GlowBackdrop />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
            <span className="text-gradient-brand">Q-Score Pro</span>
          </span>
        </div>
        <div className="relative">
          <p className="text-4xl font-extrabold leading-tight tracking-tight">
            クイズ大会運営を、
            <br />
            ひとつの基盤に。
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/50">
            大会ページ・エントリー・参加者管理・得点操作・表示画面・OBS配信までを
            無料で。数十〜数百人規模の本番運用を想定した、クイズ大会のためのプラットフォームです。
          </p>
        </div>
        <p className="relative text-xs text-white/30">Root&apos;s Laboratory</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in-up">
          <div className="mb-8 lg:hidden">
            <span className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
              <span className="text-gradient-brand">Q-Score Pro</span>
            </span>
          </div>
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          <p className="mb-6 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
