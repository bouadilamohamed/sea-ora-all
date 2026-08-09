import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MOVE, flush, freeze, glide, isMoving, paint, place, seed, stopMove
} from '../utils/motion';
import { hashAt } from '../utils/format';

/* ============================================================
   The pile.

   A stack of prints in the middle of the screen. The top one is whole; five
   underneath rise above it, each turned its own way and pushed out to one
   side, so the memories still waiting are plain at a glance. You take the top
   one and move it aside, and the next is there.

   Every movement is a CSS transition, written once and then run by the
   compositor — see utils/motion. React renders the cards once and stays out of
   the way; `position` is mirrored into state only so the counter and the
   journal can follow it.

   Two things keep this cheap on a phone:

   · nothing runs per frame. A shuffle used to be six spring loops writing
     transforms from JavaScript sixty times a second, on the same thread as
     the scroll.
   · a print deeper than the visible pile is not merely transparent, it is
     `visibility: hidden`. An element at opacity 0 is still painted, and a
     twenty-photo pearl was painting fourteen prints — each with its own
     gradient and shadow — that nobody could see.
   ============================================================ */

const VISIBLE = 5;            // prints showing behind the top one
const SHRINK = 0.032;         // how much smaller each one deeper is
const WIN_RATIO = 1.3;        // photo window, height / width
const FOOT = 0.148;           // caption strip, in card widths
const PAD = 0.068;            // paper margin, in card widths

export function useCardStack({
  items, stageRef, stackRef, isMobile, reduce, onOpen, onChange, locked, originOf
}) {
  const [position, setPosition] = useState(0);
  const posRef = useRef(0);
  const cardsRef = useRef([]);
  const sizeRef = useRef({ w: 280, h: 420 });
  const dragRef = useRef(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  /* How far the pile fans, sideways and upward.

     Both are paid for in card size: every pixel the deepest print rises above
     the top one is a pixel the top one cannot use, and the same for the fan's
     width — fit() reserves both, below. The trade is made in the fan's
     favour: a pile whose depth can only be sensed is a pile nobody knows
     holds anything, and the memories still waiting are the whole promise of
     the screen. */
  const LIFT = isMobile ? 8.5 : 12;        // px each card rises per level of depth
  const FAN_X = isMobile ? 0.095 : 0.135;  // sideways spread, capped, in card widths

  /* ---------- registration ---------- */

  /* Each card hands its node up on mount. The per-card scatter is attached
     here, once, from a hash of its place in the album: irregular enough that
     the pile looks laid by hand, and identical every time the gift is opened.

     Seeding happens ONLY for a node this hook has not seen before. An inline
     ref callback is re-invoked whenever its component re-renders, and seeding
     again would reset a card to opacity 0 mid-flight — the pile would blink
     out on any unrelated state change. */
  const registerCard = useCallback((index, el) => {
    if (!el) { cardsRef.current[index] = null; return; }
    if (el._s) { cardsRef.current[index] = el; return; }
    const j1 = hashAt(index, 12.9898);
    const j2 = hashAt(index, 78.233);
    const j3 = hashAt(index, 37.719);
    el._tilt = (index % 2 ? 1 : -1) * (2 + j1 * 3);       // 2°–5°
    /* Alternating sides, and never the same distance twice: prints laid down
       by hand land left, right, left, each a little short of or past the one
       before it. A constant offset would read as a printed graphic. */
    el._dxu = (index % 2 ? 1 : -1) * (0.052 + j2 * 0.030);
    el._dyu = j3 * 4.4 - 1.5;                             // a touch more lift, or less
    seed(el, { x: 0, y: 0, rot: 0, sc: 1, op: 0 });
    cardsRef.current[index] = el;
  }, []);

  /* ---------- geometry ---------- */

  const depthOf = useCallback(index => {
    const n = cardsRef.current.length;
    if (!n) return 0;
    return ((index - posRef.current) % n + n) % n;
  }, []);

  /* Where a print lies when it is `d` cards deep.

     Each one is a little smaller, turned its own way, pushed out to one side
     and lifted so its top edge clears the print in front — that lift has to
     beat what the scaling already took off the top edge, which is why the
     shrink term is in the sum. The tilt belongs to the PHOTOGRAPH rather than
     to the slot, so the pile looks the same every time, and the print
     straightens as it reaches the top. */
  const stateFor = useCallback((card, d) => {
    if (d === 0) return { x: 0, y: 0, rot: card._tilt * 0.07, sc: 1, op: 1 };
    const { w, h } = sizeRef.current;
    const k = Math.min(d, VISIBLE);
    const sc = 1 - SHRINK * k;
    /* The fan saturates instead of growing forever: prints pushed into a pile
       spread at first and then stop, and it keeps the deepest card on screen
       however many memories the pearl holds. */
    const cap = w * FAN_X;
    return {
      x: Math.max(-cap, Math.min(cap, card._dxu * w * k)),
      // each one lifts a little differently, so no two edges line up
      y: -((1 - sc) * h / 2 + (LIFT + card._dyu) * k),
      rot: card._tilt * (0.62 + 0.15 * k),
      sc,
      /* The memories still waiting are meant to be READ, not merely sensed.
         The deepest print is at three-quarters opacity — enough to fall back
         behind the one in hand, nowhere near enough to disappear. */
      op: d <= VISIBLE ? 1 - 0.05 * k : 0
    };
  }, [LIFT, FAN_X]);

  /* `is-deep` is what stops the browser painting a print nobody can see. */
  const mark = useCallback((card, d) => {
    card.style.zIndex = String(200 - d);
    card.classList.toggle('is-top', d === 0);
    card.classList.toggle('is-deep', d > VISIBLE);
  }, []);

  /* The print is as large as the stage allows and never taller than it. The
     stage's own height does not depend on the cards, so this cannot loop. */
  const fit = useCallback(() => {
    const stage = stageRef.current;
    const stack = stackRef.current;
    if (!stage || !stack) return;

    const box = stage.getBoundingClientRect();
    const availW = Math.max(140, box.width - 6);
    const availH = Math.max(170, box.height - 6);
    const total = WIN_RATIO + FOOT + PAD;

    /* The prints behind the top one are lifted above it and pushed out to
       either side, and both of those are painted OUTSIDE the card's own box.
       Reserving them here is what keeps the deepest print from climbing over
       whatever sits above the stage, or off the glass at the sides.

       The lift has two parts and they scale differently: a fixed number of
       pixels per level (LIFT), and the half of the shrink that shows above the
       card — which is a fraction of the card's own height, and therefore of
       the width we are solving for. So it goes into the divisor rather than
       the subtrahend, and the equation stays linear. */
    const fanY = Math.ceil((LIFT + 3) * VISIBLE);
    const shrinkY = SHRINK * VISIBLE * total / 2;

    /* Sideways, only a little over one side's worth is reserved: the stage
       already carries a margin the fan is welcome to spill into, and buying
       the full spread twice over would cost the photograph more than the
       depth is worth. */
    const spread = 1 + 1.15 * FAN_X;

    let w = Math.min(availW / spread * (isMobile ? 0.99 : 0.94), isMobile ? 520 : 420);
    if (w * (total + shrinkY) > availH - fanY) w = (availH - fanY) / (total + shrinkY);
    w = Math.max(146, Math.floor(w));

    const fan = Math.ceil(fanY + w * shrinkY);
    sizeRef.current = { w, h: Math.floor(w * total) };
    stack.style.setProperty('--cw', `${w}px`);
    stack.style.setProperty('--ch', `${sizeRef.current.h}px`);
    stack.style.setProperty('--fan', `${fan}px`);
  }, [stageRef, stackRef, isMobile, LIFT, FAN_X]);

  /* ---------- layout ---------- */

  const announce = useCallback(() => {
    setPosition(posRef.current);
    onChange?.(posRef.current);
  }, [onChange]);

  /* The pile is marked as rearranging for as long as its transitions run, and
     the stylesheet promotes the moving cards for exactly that window. One
     timer for the whole pile rather than one per card — they all start
     together, so they all finish together. */
  const shuffleRef = useRef(0);
  const shuffling = useCallback(ms => {
    const stack = stackRef.current;
    if (!stack) return;
    stack.classList.add('shuffling');
    clearTimeout(shuffleRef.current);
    shuffleRef.current = setTimeout(() => {
      shuffleRef.current = 0;
      stackRef.current?.classList.remove('shuffling');
    }, ms);
  }, [stackRef]);

  useEffect(() => () => clearTimeout(shuffleRef.current), []);

  const layout = useCallback((skip, instant) => {
    const cards = cardsRef.current;
    const n = cards.length;
    if (!n) return;
    if (!instant && !reduce) shuffling(MOVE.STACK.ms + 80);
    for (let i = 0; i < n; i++) {
      const card = cards[i];
      if (!card) continue;
      const d = depthOf(i);
      mark(card, d);
      if (card === skip) continue;

      const st = stateFor(card, d);

      /* Below the visible depth every print shares one position and none of
         them can be seen, so they are placed rather than moved: no transition
         is started, no compositor layer is asked for, and a print rising into
         view starts from exactly where it would have been. */
      if (d > VISIBLE || instant || reduce) { place(card, st); continue; }

      /* The print arriving on top comes forward on a quicker, surer curve than
         the ones shuffling behind it — the memory you are being handed should
         settle before the pile does. */
      glide(card, st, d === 0 ? MOVE.SETTLE : MOVE.STACK);
    }
    announce();
  }, [depthOf, stateFor, mark, reduce, announce, shuffling]);

  /* The prints are drawn out of the pearl and fall into a pile, deepest
     first, so the one you are meant to look at lands last and on top. */
  const dealIn = useCallback(() => {
    const cards = cardsRef.current;
    if (!cards.length) return undefined;
    const stack = stackRef.current;
    const origin = originOf?.();
    const box = stack?.getBoundingClientRect();
    const cx = box ? box.left + box.width / 2 : innerWidth / 2;
    const cy = box ? box.top + box.height / 2 : innerHeight / 2;

    const timers = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card) continue;
      const d = depthOf(i);
      const st = stateFor(card, d);
      mark(card, d);
      if (reduce || d > VISIBLE || !origin) { place(card, st); continue; }
      place(card, { x: origin.x - cx, y: origin.y - cy, rot: -15, sc: 0.14, op: 0 });
      /* The timeout puts the move in a later task than the placement above,
         which is what lets the browser see the starting position. */
      timers.push(setTimeout(() => glide(card, st, MOVE.DEAL), 70 + (VISIBLE - d) * 70));
    }
    // the last print starts at 420ms and takes MOVE.DEAL to land
    if (!reduce && origin) shuffling(70 + VISIBLE * 70 + MOVE.DEAL.ms + 140);
    announce();
    return () => timers.forEach(clearTimeout);
  }, [stackRef, originOf, depthOf, stateFor, mark, reduce, announce, shuffling]);

  const settle = useCallback(() => {
    const card = cardsRef.current[posRef.current];
    if (card) glide(card, stateFor(card, 0), MOVE.SETTLE, { reduce });
  }, [stateFor, reduce]);

  /* ---------- moving through the album ---------- */

  /* The top print is thrown aside and slips back under the pile, unseen,
     fading in again only once it is properly buried. */
  const advance = useCallback(dir => {
    const cards = cardsRef.current;
    const n = cards.length;
    if (n < 2) { settle(); return; }

    const card = cards[posRef.current];
    const from = posRef.current;
    posRef.current = (posRef.current + 1) % n;

    /* The pile steps forward the moment the top print commits to leaving, so
       the one underneath is already rising as the other clears it. */
    layout(card);
    // …and the print on its way out passes OVER the pile, never under it
    if (!card) return;
    card.style.zIndex = '300';
    card.classList.remove('is-deep');
    /* the thrown print outlives the shuffle behind it, so the promotion window
       is widened to cover the lift and the throw together */
    shuffling(MOVE.LIFT.ms + MOVE.THROW.ms + 140);

    const home = () => {
      const d = depthOf(from);
      const st = stateFor(card, d);
      place(card, { ...st, op: 0 });
      mark(card, d);
      if (st.op > 0 && d <= VISIBLE) {
        flush(card);
        glide(card, { op: st.op }, MOVE.FADE);
      }
    };

    const launch = () => glide(card, {
      x: dir * (sizeRef.current.w * 0.92 + Math.min(innerWidth * 0.52, 440)),
      y: card._s.y + 54,                     // it falls a little as it goes
      rot: dir * 21 + card._tilt * 0.5,      // and keeps turning the way it was tilted
      sc: 0.9,
      op: 0
    }, MOVE.THROW, { reduce, onDone: home });

    if (reduce) { launch(); return; }

    /* Picked up first: a short lift, a breath, and only then away — which is
       what makes the gesture read as physical rather than as a slide. A print
       already moving under the hand skips it and simply goes. */
    if (dragRef.current) { launch(); return; }
    glide(card, {
      y: card._s.y - 15, sc: 1.032, rot: card._tilt * 0.07 + dir * 2.4
    }, MOVE.LIFT, { onDone: launch });
  }, [layout, depthOf, stateFor, mark, settle, reduce, shuffling]);

  /* Going back: the previous print is drawn from off the right edge and laid
     on top of the pile again. */
  const retreat = useCallback(() => {
    const cards = cardsRef.current;
    const n = cards.length;
    if (n < 2) { settle(); return; }

    posRef.current = (posRef.current - 1 + n) % n;
    const card = cards[posRef.current];
    if (!card) return;

    /* It comes back from where it went: off to the side, above the pile, and a
       little larger than it will end up — so it reads as coming forward into
       the hand rather than sliding in from the edge. */
    card.style.zIndex = '300';
    card.classList.remove('is-deep');
    place(card, {
      x: sizeRef.current.w * 0.58 + Math.min(innerWidth * 0.45, 400),
      y: -34, rot: 16, sc: 1.06, op: 1
    });
    // the placement and the move are in one task, so the start must be flushed
    flush(card);
    layout();
  }, [layout, settle]);

  const goTo = useCallback(index => {
    const n = cardsRef.current.length;
    if (!n) return;
    posRef.current = ((index % n) + n) % n;
    layout();
  }, [layout]);

  /* ---------- the hand on the print ---------- */

  const throwDistance = () => Math.max(54, sizeRef.current.w * 0.3);

  const onPointerDown = useCallback(e => {
    if (!cardsRef.current.length || lockedRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = cardsRef.current[posRef.current];
    if (!card) return;

    /* A card caught mid-flight has to be read back out of the DOM before the
       finger takes over, or it snaps to wherever its transition was headed.
       A card AT REST does not: `_s` already holds the pixel it is drawn at.

       That distinction is worth making, because the read costs two forced
       reflows — `getComputedStyle` for the matrix, then `offsetWidth` so the
       press has a starting point to move from — and the pile is at rest for
       almost every touch. Paying them on every finger-down put a stall at the
       front of every swipe, which is precisely where it is felt. */
    if (isMoving(card)) { freeze(card); flush(card); } else { stopMove(card); }

    dragRef.current = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY,
      sx: card._s.x, sy: card._s.y,
      moved: false, vx: 0, lx: e.clientX, lt: performance.now()
    };
    stackRef.current?.classList.add('dragging');
    try { stackRef.current?.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    // a soft give under the finger, abandoned the instant it becomes a drag
    glide(card, { sc: 0.982 }, MOVE.LIFT, { reduce });
  }, [stackRef, reduce]);

  const onPointerMove = useCallback(e => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.id) return;
    const card = cardsRef.current[posRef.current];
    if (!card) return;

    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      onOpen?.markTouched?.();
      // the hand takes over from the press curve
      stopMove(card);
      card.style.transition = 'none';
    }

    card._s.x = drag.sx + dx;
    card._s.y = drag.sy + dy * 0.34;                            // it is a sideways gesture
    card._s.rot = Math.max(-16, Math.min(16, dx * 0.045));      // the print turns as it is pulled
    card._s.sc = 1 - Math.min(0.03, Math.abs(dx) / 6000);
    paint(card);

    const now = performance.now();
    const dt = now - drag.lt;
    if (dt > 8) { drag.vx = (e.clientX - drag.lx) / dt * 1000; drag.lx = e.clientX; drag.lt = now; }
  }, [onOpen]);

  const endDrag = useCallback(e => {
    const drag = dragRef.current;
    if (!drag || (e && e.pointerId !== drag.id)) return;
    stackRef.current?.classList.remove('dragging');
    if (e) { try { stackRef.current?.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ } }

    const card = cardsRef.current[posRef.current];
    if (!card) { dragRef.current = null; return; }

    if (!drag.moved) {
      dragRef.current = null;
      // release: the card comes back out of the press, then opens
      glide(card, stateFor(card, 0), MOVE.SETTLE, { reduce });
      onOpen?.open?.(posRef.current, card);
      return;
    }

    const x = card._s.x;
    const thrown = Math.abs(x) >= throwDistance() || Math.abs(drag.vx) >= 560;
    /* advance() reads dragRef to know the print is already off the paper and
       should simply go, so it is cleared only afterwards. */
    if (!thrown) { dragRef.current = null; settle(); return; }
    if (x < 0) advance(-1); else retreat();
    dragRef.current = null;
  }, [stackRef, stateFor, reduce, onOpen, settle, advance, retreat]);

  /* The print answers the hand before it is touched: it lifts a little, turns
     a degree further into its own tilt, and grows a hair. Hover only — a
     phone never runs this. */
  const onPointerEnter = useCallback(e => {
    if (e.pointerType === 'touch') return;
    const card = cardsRef.current[posRef.current];
    if (dragRef.current || !card || card._t || lockedRef.current) return;
    glide(card, {
      y: -9, sc: 1.022, rot: card._tilt * 0.07 + (card._tilt > 0 ? 0.9 : -0.9)
    }, MOVE.LIFT, { reduce });
  }, [reduce]);

  const onPointerLeave = useCallback(e => {
    if (e.pointerType === 'touch') return;
    const card = cardsRef.current[posRef.current];
    if (dragRef.current || !card) return;
    glide(card, stateFor(card, 0), MOVE.SETTLE, { reduce });
  }, [stateFor, reduce]);

  /* ---------- lifecycle ---------- */

  /* A new set of memories: measure, then deal them out of the pearl. */
  useEffect(() => {
    cardsRef.current.length = items.length;
    posRef.current = 0;
    if (!items.length) { setPosition(0); return undefined; }
    fit();
    const cancel = dealIn();
    return () => cancel?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  /* The print is sized from the stage, so every measurement is stale after a
     resize, an orientation flip, or a phone's address bar sliding away. */
  const refit = useCallback(() => {
    if (!cardsRef.current.length) return;
    fit();
    layout(null, true);
  }, [fit, layout]);

  useEffect(() => {
    let t = 0;
    const onResize = () => { clearTimeout(t); t = setTimeout(refit, 120); };
    addEventListener('resize', onResize);
    addEventListener('orientationchange', onResize);
    return () => {
      clearTimeout(t);
      removeEventListener('resize', onResize);
      removeEventListener('orientationchange', onResize);
    };
  }, [refit]);

  /* Timers fire into nodes React may have already unmounted. Cancel them. */
  useEffect(() => () => cardsRef.current.forEach(card => card && stopMove(card)), []);

  return {
    position, positionRef: posRef, cardsRef, sizeRef,
    registerCard, advance, retreat, goTo, refit, layout, settle,
    handlers: {
      onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag,
      onPointerEnter, onPointerLeave
    }
  };
}
