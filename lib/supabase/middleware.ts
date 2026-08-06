import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CONTEXT_HEADER, signAuthContext } from "@/lib/authContext";

export async function updateSession(request: NextRequest) {
  // Collected rather than applied immediately: the response is built once at
  // the end, after the forwarded request headers are known.
  const cookiesToApply: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToApply.push(
            ...(cookiesToSet as typeof cookiesToApply)
          );
        },
      },
    }
  );

  // Required: this call refreshes the session and must not be removed.
  // Its result is now also handed to the render pass — see lib/authContext.ts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const headers = new Headers(request.headers);
  const token = user ? await signAuthContext(user.id) : null;

  // SECURITY INVARIANT: this header is written on EVERY request — set when we
  // hold a validated session and a signing secret, deleted in every other
  // case. `headers` starts as a copy of the client's own headers, so skipping
  // the delete on any path would let a client inject its own value. Do not
  // make this assignment conditional.
  if (token) headers.set(AUTH_CONTEXT_HEADER, token);
  else headers.delete(AUTH_CONTEXT_HEADER);

  const response = NextResponse.next({ request: { headers } });
  cookiesToApply.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  return response;
}
