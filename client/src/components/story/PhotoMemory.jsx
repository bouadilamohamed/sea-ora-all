import { useEffect, useState } from 'react';

/* ============================================================
   A photograph, full screen.

   The THUMBNAIL is shown first — it is already decoded, so the memory is on
   screen at once — and the full photograph replaces it the moment it arrives.
   If the reader has already moved on by then, the swap is abandoned: the
   loaded image belongs to a memory that is no longer open.
   ============================================================ */
export default function PhotoMemory({ item, index }) {
  const [src, setSrc] = useState(item.thumb || item.src || '');
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setSrc(item.thumb || item.src || '');
    setBroken(false);

    if (!item.thumb || !item.src || item.src === item.thumb) return undefined;

    let alive = true;
    const full = new Image();
    full.onload = () => { if (alive) setSrc(item.src); };
    full.src = item.src;
    return () => { alive = false; };
  }, [item, index]);

  if (broken || !src) {
    return <div className="story-broken">Cette image n’a pas pu être chargée.</div>;
  }

  return (
    <img
      className="story-img"
      src={src}
      alt={item.caption || `souvenir ${index + 1}`}
      onError={() => setBroken(true)}
    />
  );
}
