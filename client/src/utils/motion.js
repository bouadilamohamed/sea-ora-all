/* ============================================================
   How a card moves.

   The pile used to run a spring integrator: one requestAnimationFrame loop
   per moving card, writing transform and opacity sixty times a second from
   JavaScript. On a desk that is invisible. On a phone it is the whole problem
   — six loops during a single shuffle, each one forcing a style recalculation
   on the main thread, in competition with the scroll the visitor is actually
   performing.

   The movements this interface makes are all the same shape: from here, to
   there, on an ease-out curve. A CSS transition expresses exactly that, and
   the browser runs it on the compositor — off the main thread entirely, at
   the display's refresh rate, whatever else JavaScript is doing. The cost per
   frame is zero.

   What is given up is velocity hand-off: a throw can no longer inherit the
   exact speed of the finger. What is bought is a pile that does not stutter
   on the device most of these gifts are opened on. That trade is not close.

   Two rules make this reliable:

   · state lives on the element (`el._s`), exactly as before, so nothing above
     has to read the DOM to know where a card is;
   · a card interrupted mid-flight is FROZEN first — its live matrix is read
     back into `el._s` — so taking hold of a moving card never snaps it.
   ============================================================ */

/* Durations are carried alongside the declaration because "when has it
   arrived" is answered by a timer, not by transitionend: transitionend fires
   once per property, does not fire at all when a value happens not to change,
   and is swallowed entirely when the element is display:none. A timer is
   correct in every one of those cases. */
export const MOVE = {
  SETTLE: { css: 'transform .40s cubic-bezier(.22,.9,.3,1), opacity .26s linear', ms: 400 },
  STACK: { css: 'transform .52s cubic-bezier(.22,.9,.3,1), opacity .40s linear', ms: 520 },
  THROW: { css: 'transform .44s cubic-bezier(.36,.02,.62,1), opacity .3s linear .08s', ms: 450 },
  DEAL: { css: 'transform .78s cubic-bezier(.16,.86,.28,1), opacity .5s linear', ms: 780 },
  FADE: { css: 'opacity .4s linear', ms: 400 },
  LIFT: { css: 'transform .2s cubic-bezier(.22,.9,.3,1)', ms: 200 },
  OPEN: { css: 'transform .46s cubic-bezier(.18,.86,.28,1), opacity .3s linear', ms: 470 },
  STEP: { css: 'transform .34s cubic-bezier(.22,.9,.3,1), opacity .26s linear', ms: 350 }
};

/* Write a card's state to the DOM. Transform and opacity only, never layout.

   `translate()` and not `translate3d()`: the 3D form forces the browser to
   give every card its own compositor layer and keep it forever. Twenty prints
   of three hundred by five hundred pixels is more GPU memory than a phone
   should be asked for to show six of them. The 2D form lets the browser
   promote only what is actually moving, and hand the layer back afterwards. */
export function paint(el) {
  const s = el._s;
  if (!s) return;
  el.style.transform =
    `translate(${s.x.toFixed(2)}px,${s.y.toFixed(2)}px) ` +
    `rotate(${s.rot.toFixed(2)}deg) scale(${s.sc.toFixed(4)})`;
  el.style.opacity = s.op.toFixed(3);
}

/** Give an element the state object the rest of this module expects. */
export function seed(el, state) {
  if (!el) return el;
  el._s = { x: 0, y: 0, rot: 0, sc: 1, op: 1, ...(state || {}) };
  el.style.transition = 'none';
  paint(el);
  return el;
}

/** Forget a pending arrival. The CSS transition itself is left alone. */
export function stopMove(el) {
  if (el && el._t) { clearTimeout(el._t); el._t = 0; }
}

/**
 * Is a transition possibly still running on this element?
 *
 * `_moving` is set the moment a glide starts and cleared the moment the card
 * is placed or frozen. It is deliberately pessimistic — it stays true after a
 * transition has visually finished, until something parks the card — because
 * the only thing it gates is whether a caller must pay for a style read.
 * Answering "yes" too often costs a reflow that was not needed; answering
 * "no" wrongly would let a card jump. It never does the second.
 */
export const isMoving = el => !!(el && el._moving);

/**
 * Put a card somewhere with no movement at all.
 * Any transition in flight is dropped, so this is also how a card is parked.
 */
export function place(el, to) {
  if (!el) return;
  stopMove(el);
  if (!el._s) seed(el);
  if (to) Object.assign(el._s, to);
  el.style.transition = 'none';
  el._moving = false;
  paint(el);
}

/**
 * Read a moving card's LIVE position back into its state, and stop it there.
 *
 * Without this, taking hold of a card mid-transition would snap it to wherever
 * the transition was headed, because `_s` holds the destination and not the
 * pixel the card is currently drawn at. One forced style read per gesture is
 * a price worth paying for a card that never jumps under the finger.
 */
export function freeze(el) {
  if (!el || !el._s) return;
  stopMove(el);
  const cs = getComputedStyle(el);
  const m = cs.transform;

  if (m && m !== 'none') {
    const n = m.slice(m.indexOf('(') + 1, -1).split(',').map(Number);
    /* matrix(a,b,c,d,e,f) or matrix3d(...16), where the translation sits at
       (4,5) and (12,13) respectively. `a` and `b` carry rotation and scale
       together in both forms. */
    const a = n[0];
    const b = n[1];
    const x = n.length === 16 ? n[12] : n[4];
    const y = n.length === 16 ? n[13] : n[5];
    if (Number.isFinite(x) && Number.isFinite(y)) { el._s.x = x; el._s.y = y; }
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const sc = Math.hypot(a, b);
      if (sc > 0.001) el._s.sc = sc;
      el._s.rot = Math.atan2(b, a) * 180 / Math.PI;
    }
  }

  const op = parseFloat(cs.opacity);
  if (Number.isFinite(op)) el._s.op = op;

  el.style.transition = 'none';
  el._moving = false;
  paint(el);
}

/**
 * Move a card from where it is to `to`, on a curve.
 *
 * @param {HTMLElement} el
 * @param {object} to     any subset of {x, y, rot, sc, op}
 * @param {object} move   one of MOVE
 * @param {object} [opt]  {reduce, onDone}
 */
export function glide(el, to, move, opt = {}) {
  if (!el) return;
  stopMove(el);
  if (!el._s) seed(el);

  /* Reduced motion is not "a faster animation": it is no animation. The card
     is simply where it was going to end up. */
  if (opt.reduce) {
    place(el, to);
    opt.onDone?.();
    return;
  }

  el.style.transition = (move || MOVE.STACK).css;
  el._moving = true;
  Object.assign(el._s, to);
  paint(el);

  if (opt.onDone) {
    el._t = setTimeout(() => { el._t = 0; opt.onDone(); }, (move || MOVE.STACK).ms);
  }
}

/**
 * Flush pending style so the NEXT write transitions instead of being folded
 * into the same frame.
 *
 * Only needed when a card is placed and then immediately told to move within
 * the same task. Across two tasks — a timeout, a later event — the browser has
 * already recalculated and this is unnecessary.
 */
export function flush(el) {
  if (el) void el.offsetWidth;
}
