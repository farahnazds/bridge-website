"use client";

import { useSyncExternalStore } from "react";

// Reading sessionStorage during a React render is three problems at once:
// it does not exist on the server, a lazy useState initialiser therefore
// produces a hydration mismatch, and doing it in an effect means calling
// setState from an effect — a cascading render, which the react-hooks rules
// reject on sight.
//
// useSyncExternalStore is the API built for exactly this shape. The server
// snapshot is null, the client snapshot is the stored string, and React
// reconciles the difference itself instead of us papering over it with an
// effect. No double render, no mismatch, no suppressed lint rule.
//
// The store never notifies: these values are read once when the component
// mounts and are thereafter owned by React state. Nothing else in the tab
// writes them behind our back, so there is nothing to subscribe to.
const subscribeNever = () => () => {};

/** The raw string at `key`, or null on the server and when absent. */
export function useSessionValue(key: string): string | null {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        // Storage disabled or blocked by policy. Callers degrade to their
        // defaults; nothing here is load-bearing enough to fail a flow over.
        return null;
      }
    },
    () => null
  );
}

/** Best-effort write. Never throws — a full or disabled store costs the
 *  recovery affordance and nothing else. */
export function writeSessionValue(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignored by design */
  }
}

export function clearSessionValues(...keys: string[]): void {
  for (const key of keys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignored by design */
    }
  }
}
