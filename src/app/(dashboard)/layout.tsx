import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { signOut } from "@/lib/auth/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-gradient-brand">Q-Score Pro</span>
          </Link>
          <div className="flex items-center gap-3 text-sm text-body">
            <span className="hidden sm:inline">{user.displayName}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 font-medium text-body transition hover:border-border-strong hover:bg-surface-muted"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
