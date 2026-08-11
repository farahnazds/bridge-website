import { useEffect, useRef } from "react";

// Fires `onSaved` once per successful save reported by a server action.
//
// Every data-entry action in this app returns `ActionState` — `{ error }` on
// failure, `{ error: null, savedAt }` on success. `{ error: null }` is ALSO
// the initial state, which is why the timestamp exists: without it a caller
// cannot tell "the form has not been submitted yet" from "the save worked",
// and would fire on mount.
//
// The callback is held in a ref and the effect depends only on `savedAt`, so
// a caller passing an inline arrow function does not re-fire the callback on
// every render — only a genuinely new save does.
//
// The dedicated data pages pass nothing and are unaffected; this exists for
// the athlete-profile modal, which needs to close itself and refresh the page
// underneath once the real edit form has saved.
export function useOnSaved(savedAt: number | undefined, onSaved?: () => void) {
  const ref = useRef(onSaved);

  // Written in an effect rather than during render — a ref assignment in the
  // render body is impure and the react-hooks/refs rule rejects it. Effects
  // run top-down, so by the time the second one fires on a save the ref is
  // already the current callback.
  useEffect(() => {
    ref.current = onSaved;
  });

  useEffect(() => {
    if (savedAt === undefined) return;
    ref.current?.();
  }, [savedAt]);
}
