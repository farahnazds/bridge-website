import { createClient } from "@/lib/supabase/server";

// Read side of in-app notifications — shared by the staff layout (initial
// render of the header bell) and /api/notifications (the bell's 60s poll), so
// the two can never disagree about what "unread" means.
//
// RLS ("own notifications") already scopes rows to the caller; the explicit
// profile_id filter is kept anyway so the query states its own intent and an
// accidental service-role caller wouldn't sweep the whole table.

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  related_id: string | null;
  created_at: string;
}

export interface NotificationSummary {
  unread: number;
  items: NotificationItem[];
}

export async function getNotificationSummary(profileId: string): Promise<NotificationSummary> {
  const supabase = await createClient();
  const [{ data: items }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, is_read, related_id, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("is_read", false),
  ]);
  return { unread: count ?? 0, items: (items ?? []) as NotificationItem[] };
}
