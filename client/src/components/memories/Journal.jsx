import { useEffect, useRef, useState } from 'react';

/* ============================================================
   The journal: the words that belong to the memory in hand.

   The title follows whichever print is on top of the pile, and it is never
   SEEN to change: the block fades out, waits a beat while the photograph is
   still moving, and the new words come back in on a small upward drift. The
   two halves never cross.
   ============================================================ */
const SWAP_MS = 300;

export default function Journal({ title, date, message, reduce }) {
  const bodyRef = useRef(null);
  const scrollRef = useRef(null);
  const timerRef = useRef(0);
  const shownRef = useRef({ title, date });
  const [shown, setShown] = useState({ title, date });

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    if (shownRef.current.title === title && shownRef.current.date === date) return undefined;

    const write = () => {
      shownRef.current = { title, date };
      setShown({ title, date });
    };

    clearTimeout(timerRef.current);

    if (reduce) {
      write();
      body.classList.remove('leaving', 'entering');
      return undefined;
    }

    body.classList.add('leaving');
    timerRef.current = setTimeout(() => {
      write();
      body.classList.remove('leaving');
      body.classList.add('entering');   // placed low and clear, untransitioned
      requestAnimationFrame(() => requestAnimationFrame(() => {
        body.classList.remove('entering');  // …and allowed to rise into place
      }));
    }, SWAP_MS);

    return () => clearTimeout(timerRef.current);
  }, [title, date, reduce]);

  /* The letter earns a fade at its edge only when it holds more than it can
     show at once. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.classList.toggle('is-scrollable', el.scrollHeight - el.clientHeight > 4);
  }, [message, shown]);

  const letter = (message || '').trim();

  return (
    <div className="journal">
      <div className="orn" aria-hidden="true"><i /><b /><i /></div>

      <div className="mem-card">
        <div className="mem-body" ref={bodyRef}>
          <h2 className="mem-title">{shown.title}</h2>
          {shown.date && <p className="mem-date">{shown.date}</p>}

          {/* no letter, no hairline: the card closes up around what it holds */}
          {letter && <hr className="mem-rule" aria-hidden="true" />}
          {letter && (
            <div className="mem-scroll" ref={scrollRef}>
              <p className="mem-text">{letter}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
