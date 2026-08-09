/* Small shared formatting, kept in one place so a duration reads the same on
   a card, in the corner pile and inside the story viewer. */

export const mmss = s => (Number.isFinite(s) && s >= 0)
  ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  : '—:—';

/** The same, but blank rather than an em-dash pair — a card with no length. */
export const mmssOrBlank = s => (Number.isFinite(s) && s >= 0) ? mmss(s) : '';

/* One date for the whole album: the day the pearl was sealed. The
   photographs carry none of their own — EXIF is stripped on upload. */
export function albumDate(timestamp) {
  if (!timestamp) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(timestamp));
  } catch (_) {
    return '';
  }
}

/* A deterministic scatter. Real randomness would re-lay the pile on every
   visit; this gives the same irregular arrangement for the same album, every
   time it is opened. */
export function hashAt(i, seed) {
  const n = Math.sin((i + 1) * seed) * 43758.5453;
  return n - Math.floor(n);
}

/* A still waveform whose shape is fixed per memory, so the bars a voice note
   shows on its card are the bars it shows full screen. */
export function waveHeights(seed, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const v = Math.abs(Math.sin(seed * 2.1 + i * 1.7)) * 0.55 + Math.abs(Math.sin(i * 0.41)) * 0.45;
    out[i] = 0.16 + 0.62 * v;
  }
  return out;
}
