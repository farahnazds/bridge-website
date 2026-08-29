import "server-only";

// Expo push delivery.
//
// Expo runs the push service that fronts APNs and FCM: we POST messages
// addressed to an "ExponentPushToken[...]" and Expo forwards them. That is why
// no APNs key or FCM key appears in this file — those credentials live on the
// EAS project, uploaded once, and are never handled by our server.
//
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
//
// ---------------------------------------------------------------------------
// TWO-STAGE DELIVERY, AND WHAT THIS FILE DOES AND DOES NOT DO
// ---------------------------------------------------------------------------
// Expo reports delivery in two stages:
//
//   1. The SEND response ("tickets"), returned synchronously. A ticket says
//      whether Expo ACCEPTED the message. It catches malformed tokens and
//      tokens Expo already knows are dead — which is the common case for an
//      uninstalled app, so this is worth acting on.
//
//   2. RECEIPTS, fetched later by ticket id. These carry the FINAL verdict
//      from APNs/FCM, including DeviceNotRegistered for a token that only the
//      upstream service knows is dead. Expo asks callers to wait ~15 minutes
//      before fetching, and keeps receipts for 24 hours.
//
// This file implements stage 1 and returns the ticket ids for stage 2. It does
// NOT poll receipts: a cron invocation cannot usefully wait 15 minutes, so
// doing it properly needs the ticket ids persisted and swept by a later run.
// That is a known, deliberate gap — see the note in lib/checkinReminders.ts.
// The practical cost is that some dead tokens stay enabled longer than they
// should; they are harmless (Expo simply drops them) but they inflate the send
// batch over time.
// ---------------------------------------------------------------------------

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";

/** Expo's documented per-request limit. */
const MAX_BATCH = 100;

export interface ExpoPushMessage {
  /** ExponentPushToken[...] */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android only: must match a channel the app has created, or the
   *  notification is dropped silently on Android 8+. */
  channelId?: string;
}

export interface ExpoSendOutcome {
  token: string;
  ok: boolean;
  /** Expo says this token is dead and must never be sent to again. The caller
   *  is expected to stamp disabled_at on it. */
  deviceNotRegistered: boolean;
  /** Ticket id, for a future receipt sweep. Present only when ok. */
  receiptId?: string;
  error?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Sends a batch of push messages. Never throws: a transport or API failure is
 * reported per-token in the returned outcomes.
 *
 * WHY IT DOESN'T THROW. This is called from a cron job that is mid-way through
 * a run when it sends. An exception here would abort the whole invocation and
 * starve every athlete after this batch — the same reasoning
 * lib/complianceAlerts.ts applies to its Resend calls.
 */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoSendOutcome[]> {
  if (messages.length === 0) return [];

  const outcomes: ExpoSendOutcome[] = [];

  // An EXPO_ACCESS_TOKEN is optional but recommended: without it, anyone who
  // obtains one of our push tokens could send notifications that appear to
  // come from the app. With it, Expo rejects sends that don't carry it.
  const accessToken = process.env.EXPO_ACCESS_TOKEN;

  for (const batch of chunk(messages, MAX_BATCH)) {
    let tickets: ExpoTicket[] | null = null;
    let batchError: string | null = null;

    try {
      const res = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((m) => ({
            to: m.to,
            title: m.title,
            body: m.body,
            data: m.data,
            sound: "default",
            ...(m.channelId ? { channelId: m.channelId } : {}),
          }))
        ),
      });

      if (!res.ok) {
        batchError = `Expo returned HTTP ${res.status}`;
      } else {
        const json = (await res.json()) as { data?: ExpoTicket[]; errors?: unknown };
        if (Array.isArray(json.data)) {
          tickets = json.data;
        } else {
          batchError = "Expo response had no data array";
        }
      }
    } catch (err) {
      batchError = err instanceof Error ? err.message : "fetch failed";
    }

    batch.forEach((message, i) => {
      if (batchError !== null || tickets === null) {
        outcomes.push({
          token: message.to,
          ok: false,
          deviceNotRegistered: false,
          error: batchError ?? "no ticket returned",
        });
        return;
      }

      // Tickets are positional: data[i] corresponds to messages[i].
      const ticket = tickets[i];
      if (!ticket) {
        outcomes.push({
          token: message.to,
          ok: false,
          deviceNotRegistered: false,
          error: "Expo returned fewer tickets than messages",
        });
        return;
      }

      if (ticket.status === "ok") {
        outcomes.push({
          token: message.to,
          ok: true,
          deviceNotRegistered: false,
          receiptId: ticket.id,
        });
        return;
      }

      outcomes.push({
        token: message.to,
        ok: false,
        deviceNotRegistered: ticket.details?.error === "DeviceNotRegistered",
        error: ticket.message ?? ticket.details?.error ?? "unknown Expo error",
      });
    });
  }

  return outcomes;
}
