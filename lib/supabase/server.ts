import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A client built from an ALREADY-READ snapshot of the request's cookies.
 *
 * Exists for `after()` callbacks. Next.js forbids calling `cookies()` inside
 * `after()` from a Server Component — it throws "used `cookies()` inside
 * `after()`. This is not supported" — so the normal createClient() above
 * cannot be used there. Callers read the cookies during render (where it is
 * allowed) and hand the snapshot in.
 *
 * setAll is a no-op by design: the response has already been sent by the time
 * an after() callback runs, so there is nowhere to write a refreshed session
 * to. Middleware refreshes it on the next request, exactly as the comment in
 * createClient() describes.
 */
export function createClientFromCookieSnapshot(
  snapshot: { name: string; value: string }[]
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => snapshot,
        setAll: () => {},
      },
    }
  );
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — safe to ignore
            // because middleware refreshes the session on every request.
          }
        },
      },
    }
  );
}
