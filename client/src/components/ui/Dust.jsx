import { useEffect, useRef } from 'react';

/* ============================================================
   Motes of light.

   A few large and slow near the front, more small and quick behind: the
   difference in speed is what gives the room its depth, and it costs nothing —
   they are pure CSS animation on their own layers.

   Built imperatively for the same reason the bubbles are: every mote carries
   random values that must not be re-rolled by a re-render of the page above.
   ============================================================ */
export default function Dust({ className = 'dust', tier, reduce, warm = false }) {
  const host = useRef(null);

  useEffect(() => {
    const el = host.current;
    if (!el || reduce || tier === 0) return undefined;

    /* Embers rather than dust: inside a voice memory the room is warm, so the
       motes are fewer, larger and slower, and they rise like sparks off a fire
       rather than drifting like plankton. */
    const count = warm ? (tier === 2 ? 18 : 10) : (tier === 2 ? 22 : 11);

    for (let i = 0; i < count; i++) {
      const d = document.createElement('i');
      const near = i % 3 === 0;                      // one in three drifts close by
      const size = near ? (warm ? 3 + Math.random() * 2.8 : 3.4 + Math.random() * 2.6)
        : (warm ? 1.5 + Math.random() * 1.6 : 1.4 + Math.random() * 1.8);
      d.style.width = d.style.height = `${size.toFixed(1)}px`;
      d.style.left = `${Math.random() * 100}%`;
      d.style.opacity = near ? '1' : (warm ? '.6' : '.62');
      d.style.setProperty('--dx', `${Math.random() * (warm ? 80 : 90) - (warm ? 40 : 45)}px`);
      d.style.animationDuration = near
        ? `${(warm ? 26 : 30) + Math.random() * (warm ? 18 : 22)}s`
        : `${(warm ? 38 : 44) + Math.random() * (warm ? 24 : 30)}s`;
      d.style.animationDelay = `${-Math.random() * (warm ? 50 : 60)}s`;
      el.appendChild(d);
    }
    return () => el.replaceChildren();
  }, [tier, reduce, warm]);

  return <div className={className} ref={host} aria-hidden="true" />;
}
