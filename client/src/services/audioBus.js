/* ============================================================
   The audio bus.

   Exactly one voice note may be heard at a time. Starting a second one:

       stop previous audio
              ↓
       reset previous state
              ↓
       start new audio
              ↓
       update active audio
              ↓
       update progress

   Enforced here rather than in a component, so it holds whether a note was
   started from its card, from the story viewer, from the keyboard, or by the
   album handing over to the next one on its own.

   The other half of this file is priming. Mobile browsers only allow playback
   that descends from a user gesture, and the gesture this experience owns —
   the tap on « Révéler » — happens seconds before the first note is supposed
   to begin. So each element is played silently and paused again INSIDE that
   tap, which marks it as user-approved; the deferred play() then succeeds.
   ============================================================ */

let active = null;

/** Pause whatever is playing. Optionally spare one element. */
export function stopAll(except) {
  for (const el of tracked) {
    if (el === except) continue;
    if (!el.paused) { try { el.pause(); } catch (_) { /* detached */ } }
  }
  if (active && active !== except) active = null;
}

const tracked = new Set();

export function register(el) {
  tracked.add(el);
  return () => {
    release(el);
    tracked.delete(el);
  };
}

/** Start one element, stopping every other. Returns the play() promise. */
export function play(el) {
  if (!el) return Promise.resolve();
  stopAll(el);
  active = el;
  const p = el.play();
  // blocked by the browser → the card still offers a tap; never throw here
  return (p && p.catch) ? p.catch(() => {}) : Promise.resolve();
}

export function pause(el) {
  if (!el) return;
  try { el.pause(); } catch (_) { /* detached */ }
  if (active === el) active = null;
}

export const current = () => active;

/**
 * Prime an element inside a user gesture: play muted, pause immediately,
 * rewind. The browser then treats a later, deferred play() as approved.
 */
export function arm(el) {
  if (!el) return;
  el.muted = true;
  const p = el.play();
  if (p && p.then) {
    p.then(() => {
      el.pause();
      try { el.currentTime = 0; } catch (_) { /* not seekable yet */ }
      el.muted = false;
    }).catch(() => { el.muted = false; });
  } else {
    el.muted = false;
  }
}

/** Free an element for good: stop it, drop its source, let the decoder go. */
export function release(el) {
  if (!el) return;
  pause(el);
  try {
    el.removeAttribute('src');
    el.load();
  } catch (_) { /* already gone */ }
}
