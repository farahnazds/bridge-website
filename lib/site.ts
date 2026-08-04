import "server-only";
import { headers } from "next/headers";

// Absolute origin for building links that go into outbound emails
// (invites, password resets). Falls back to the request's own host so
// this works in every environment without per-env configuration, but an
// explicit NEXT_PUBLIC_SITE_URL always wins once one is set.
export async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host")}`;
}
