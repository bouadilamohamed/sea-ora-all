import { useMemo } from 'react';
import { MicIcon, PlayIcon, PauseIcon } from '../ui/icons';
import { waveHeights } from '../../utils/format';

/* Two sets of these are rendered, one clipped over the other, so the element
   count is double. Fifty-four was a desk number; thirty-six reads as the same
   waveform and halves the layout the phone has to do to lay it out. */
const SV_BARS = 36;

/* ============================================================
   A voice memory, full screen.

   The waveform is two identical sets of bars, one laid over the other and
   CLIPPED to how far the note has played. The bars breathe while it plays; the
   played half glows warm, the rest waits in shadow. Its shape is derived from
   the note's index, so the bars are the same every time that memory is opened.

   The clip and the remaining time are written straight to the DOM by the
   story's rAF loop — the `refs` below are how it reaches them. They are a
   plain prop rather than a forwarded ref because there are three of them.
   ============================================================ */
export default function AudioPlayer({
  index, playing, remaining, when, refs, onToggle, onSeek
}) {
  const heights = useMemo(() => waveHeights(index, SV_BARS), [index]);

  const bars = heights.map((h, i) => (
    <i key={i} style={{ '--h': h.toFixed(2), '--i': i }} />
  ));

  const seek = e => {
    const el = refs?.waveRef?.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    onSeek((e.clientX - box.left) / (box.width || 1));
  };

  return (
    <div className="story-voice">
      <div className="sv-mic" aria-hidden="true">
        <MicIcon />
        <span className="sv-ring" />
        <span className="sv-ring sv-ring-2" />
      </div>

      {when && <p className="sv-when">Enregistré le {when}</p>}

      <button
        type="button"
        className="sv-wave"
        ref={refs?.waveRef}
        aria-label="Aller à un moment du message"
        onClick={seek}
      >
        <span className="sv-lay" aria-hidden="true">{bars}</span>
        <span className="sv-lay on" ref={refs?.fillRef} aria-hidden="true">{bars}</span>
      </button>

      <button
        type="button"
        className="sv-play"
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Lecture'}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="sv-dur" ref={refs?.durRef} aria-live="off">{remaining}</div>
    </div>
  );
}
