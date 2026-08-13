import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads/writes auth cookies via Next.js' cookies() API.
 *
 * In Next.js 16, cookies() is async, and .set()/.delete() can only be
 * called from a Route Handler or Server Action - calling it from a plain
 * Server Component render throws. We swallow that specific case because
 * middleware.ts is responsible for refreshing the session on every request,
 * so a failed write here just means "nothing to do".
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component - middleware handles refresh.
          }
        },
      },
    }
  );
}

/**
 * Service-role client. NEVER expose this to the browser and never derive
 * authorization decisions from it alone - it bypasses Row Level Security.
 * Reserved for trusted server-only operations (e.g. the new-tournament
 * bootstrap transaction, admin tooling, scheduled jobs).
 */
export function createServiceRoleClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Service role client never manages a browser session.
        },
      },
    }
  );
}
