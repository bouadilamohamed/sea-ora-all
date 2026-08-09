import { forwardRef, useEffect, useState } from 'react';

/* ============================================================
   A film, full screen.

   The element is created only while a film is on screen and is torn down when
   the memory closes: a video left loaded keeps decoding behind the pile.
   preload="metadata" and no eager source means opening an album of twelve
   memories does not fetch twelve films.

   Starting one is three steps, because one is not enough on every browser:
   play as it is; if that is refused, play it silently, which is always
   allowed; and if even that fails, hand the memory back to the photograph's
   clock so the story moves on instead of stopping dead. That last case is
   `onStuck`, and it is also what a codec the browser cannot decode produces.
   ============================================================ */
const VideoMemory = forwardRef(function VideoMemory({ item, onEnded, onStuck }, ref) {
  const [broken, setBroken] = useState(false);

  useEffect(() => { setBroken(false); }, [item]);

  useEffect(() => {
    const el = ref?.current;
    if (!el) return undefined;

    let cancelled = false;
    const give = () => { if (!cancelled) onStuck?.(); };

    try { el.currentTime = 0; } catch (_) { /* not seekable yet */ }

    let p;
    try { p = el.play(); } catch (_) { give(); return undefined; }

    if (p && p.catch) {
      p.catch(() => {
        el.muted = true;
        let q;
        try { q = el.play(); } catch (_) { return give(); }
        if (q && q.catch) q.catch(give);
        return undefined;
      });
    }

    return () => {
      cancelled = true;
      /* A film left loaded keeps decoding behind the pile — stop it and let
         the element go the moment the memory is closed. */
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch (_) { /* already gone */ }
    };
  }, [item, ref, onStuck]);

  if (broken) {
    return <div className="story-broken">Ce film n’a pas pu être lu sur cet appareil.</div>;
  }

  return (
    <video
      className="story-video"
      ref={ref}
      src={item.src || ''}
      poster={item.poster || undefined}
      playsInline
      preload="metadata"
      onEnded={onEnded}
      onError={() => { setBroken(true); onStuck?.(); }}
    />
  );
});

export default VideoMemory;
