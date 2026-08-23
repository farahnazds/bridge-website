import "server-only";
import { googleOAuthConfig } from "@/lib/googleOAuth";

// ============================================================================
// Google Calendar — the two API calls the booking flow actually makes
// ============================================================================
// freeBusy.query  -> when is the owner already busy
// events.insert   -> commit the visitor's chosen time
//
// Dependency-free on purpose: `googleapis` is an enormous surface for two
// endpoints, and this project keeps its dependency list deliberately short
// (see lib/anthropic.ts for the same call). Everything here is plain fetch.
//
// The credential chain is: GOOGLE_OAUTH_REFRESH_TOKEN (long-lived, minted once
// through /api/google/oauth/start) -> access token (1 hour) -> API call.
// ============================================================================

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/**
 * Process-memory access-token cache.
 *
 * Google issues access tokens with a 3600s life. Refreshing on every request
 * would add a round trip to Google to every page render of /book/schedule for
 * no benefit. Cached in a module variable rather than anywhere shared because
 * a serverless instance is the correct scope: a cold start simply refreshes.
 *
 * The 60s safety margin matters — a token that expires mid-flight between the
 * freebusy re-check and events.insert would fail the booking after the visitor
 * pressed confirm, which is the worst possible moment.
 */
let cachedToken: { value: string; expiresAtMs: number } | null = null;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/** True when all four variables are present. Callers use this to choose the
 *  real path or the honest placeholder — never to decide whether to throw. */
export function isCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() &&
      process.env.GOOGLE_CALENDAR_ID?.trim()
  );
}

/** The target calendar. `.trim()` is not decorative: the Vercel dashboard does
 *  not trim pasted values, and every one of these variables arrived with a
 *  leading space at least once. */
export function calendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!id) throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  return id;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_EXPIRY_MARGIN_MS > now) {
    return cachedToken.value;
  }

  const { clientId, clientSecret } = googleOAuthConfig();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    throw new Error(
      "GOOGLE_OAUTH_REFRESH_TOKEN is not configured. Mint one at /api/google/oauth/start."
    );
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    // `invalid_grant` here means the refresh token is dead — revoked from the
    // owner's Google account, unused for six months, or (the one that bites)
    // silently expired because the OAuth consent screen slipped back to
    // "Testing", where Google revokes refresh tokens after 7 days.
    throw new Error(
      `Google token refresh failed (HTTP ${res.status}): ${text}. If this is invalid_grant, re-authorise at /api/google/oauth/start and check the consent screen is still "In production".`
    );
  }

  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAtMs: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

/** Only used by tests/diagnostics that need a cold token path. */
export function resetAccessTokenCache(): void {
  cachedToken = null;
}

export interface BusyRange {
  /** RFC3339 instant. */
  start: string;
  end: string;
}

/**
 * Busy ranges on the target calendar between two instants.
 *
 * Uses the `calendar.freebusy` scope, which returns ONLY opaque time ranges —
 * no title, no attendees, no notes. That narrowness is deliberate and is what
 * app/privacy/page.tsx §6 describes; do not "upgrade" this to events.list to
 * get richer data without revisiting that disclosure.
 */
export async function freeBusy(params: {
  timeMinIso: string;
  timeMaxIso: string;
  timeZone: string;
}): Promise<BusyRange[]> {
  const token = await getAccessToken();
  const id = calendarId();

  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: params.timeMinIso,
      timeMax: params.timeMaxIso,
      timeZone: params.timeZone,
      items: [{ id }],
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Google freeBusy failed (HTTP ${res.status}): ${text}`);

  const json = JSON.parse(text) as {
    calendars?: Record<string, { busy?: BusyRange[]; errors?: { reason: string }[] }>;
  };
  const cal = json.calendars?.[id];

  // A per-calendar error (notFound, or the token lacking access to THIS
  // calendar) comes back inside a 200. Treating that as "no busy ranges" would
  // silently present the entire grid as free and double-book the owner, so it
  // is an error here, not an empty result.
  if (cal?.errors?.length) {
    throw new Error(
      `Google freeBusy returned errors for calendar ${id}: ${cal.errors.map((e) => e.reason).join(", ")}`
    );
  }
  return cal?.busy ?? [];
}

export interface InsertedEvent {
  id: string;
  htmlLink?: string;
  /** The Google Meet URL, when a conference was requested and created. */
  meetLink?: string;
}

/**
 * Creates the booking event.
 *
 * `sendUpdates` is passed explicitly by the caller rather than defaulted here,
 * because it decides whether a real human receives an email. A silent default
 * is exactly the wrong shape for that.
 */
export async function insertEvent(params: {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  attendeeEmail?: string | null;
  /** "all" emails the attendee an invitation. "none" creates the event silently. */
  sendUpdates: "all" | "none";
  /** Ask Google to mint a Meet link for this event. */
  withMeetLink?: boolean;
}): Promise<InsertedEvent> {
  const token = await getAccessToken();
  const id = calendarId();

  const body: Record<string, unknown> = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: params.startIso, timeZone: params.timeZone },
    end: { dateTime: params.endIso, timeZone: params.timeZone },
  };
  if (params.attendeeEmail) {
    body.attendees = [{ email: params.attendeeEmail }];
  }
  if (params.withMeetLink) {
    // requestId only needs to be unique per create attempt — Google uses it to
    // deduplicate retries of the SAME request, so a fresh random one per call
    // is correct here (we never retry an insert in place).
    body.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(id)}/events`);
  url.searchParams.set("sendUpdates", params.sendUpdates);
  if (params.withMeetLink) {
    // Without this the conferenceData above is SILENTLY IGNORED — the event is
    // created successfully with no Meet link and no error. Verified 2026-08-23.
    url.searchParams.set("conferenceDataVersion", "1");
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Google events.insert failed (HTTP ${res.status}): ${text}`);

  const json = JSON.parse(text) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };

  // hangoutLink is the documented field, but read the video entry point as a
  // fallback: conferenceData is the authoritative structure and hangoutLink is
  // effectively a convenience mirror of it.
  const videoEntry = json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return {
    id: json.id,
    htmlLink: json.htmlLink,
    meetLink: json.hangoutLink ?? videoEntry?.uri,
  };
}

/** Deletes an event. Not used by the booking flow — it exists so a failed
 *  half-finished booking, or a diagnostic run, can clean up after itself
 *  rather than leaving debris on the owner's real calendar. */
export async function deleteEvent(eventId: string): Promise<void> {
  const token = await getAccessToken();
  const id = calendarId();
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  // 410 Gone = already deleted, which is the desired end state either way.
  if (!res.ok && res.status !== 410) {
    throw new Error(`Google events.delete failed (HTTP ${res.status}): ${await res.text()}`);
  }
}
