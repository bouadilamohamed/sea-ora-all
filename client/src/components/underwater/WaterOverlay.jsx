import { useEffect, useMemo, useRef } from 'react';

/* ============================================================
   The water above the scene: caustics, light rays, bubbles, vignette.

   Pure CSS on its own compositor layers — no canvas, no JavaScript per frame.
   How much of it runs is decided by the performance tier, and the tier is
   already mirrored onto <body>, so the stylesheet turns things off without
   this component knowing which device it is on. The one thing decided here is
   the NUMBER of bubbles, because each one is its own layer with a running
   transform: they are the cheapest of the atmosphere effects, but they are
   not free, and on a struggling device the shell matters more than the water.
   ============================================================ */
export default function WaterOverlay({ tier, reduce }) {
  const bubbleHost = useRef(null);

  const bubbleCount = useMemo(() => {
    if (reduce) return 0;
    return tier === 2 ? 14 : tier === 1 ? 7 : 0;
  }, [tier, reduce]);

  /* Built imperatively rather than as JSX: each bubble carries four random
     inline values that must stay STABLE for the life of the layer. Generating
     them in render would re-roll every size, delay and drift on any re-render
     of the page above, and the whole field would visibly restart. */
  useEffect(() => {
    const host = bubbleHost.current;
    if (!host || !bubbleCount) return undefined;

    for (let i = 0; i < bubbleCount; i++) {
      const b = document.createElement('i');
      const size = 4 + Math.random() * 10;
      b.style.width = b.style.height = `${size}px`;
      b.style.left = `${Math.random() * 100}vw`;
      b.style.setProperty('--dx', `${Math.random() * 60 - 30}px`);
      b.style.animationDuration = `${9 + Math.random() * 12}s`;
      // a negative delay starts each one part-way up, so the field is never empty
      b.style.animationDelay = `${-Math.random() * 16}s`;
      host.appendChild(b);
    }
    return () => host.replaceChildren();
  }, [bubbleCount]);

  return (
    <>
      <div className="fx caustics" aria-hidden="true" />
      <div className="fx rays" aria-hidden="true" />
      <div className="bubbles" ref={bubbleHost} aria-hidden="true" />
    </>
  );
}

/** Drawn ABOVE the canvas, unlike the three layers above it. */
export function Vignette() {
  return <div className="fx vignette" aria-hidden="true" />;
}
