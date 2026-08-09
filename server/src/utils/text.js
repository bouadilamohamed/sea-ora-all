'use strict';

/** A single line: whitespace collapsed, trimmed, capped. */
const clean = (s, max, fallback = '') => {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return v || fallback;
};

/* Prose the sender wrote, so its line breaks are meaningful: runs of blank
   lines collapse, but the paragraphs survive. */
const multiline = (s, max) => String(s ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, max);

/** mm:ss, or an em-dash pair when the length is not known yet. */
const mmss = s => (Number.isFinite(s) && s >= 0)
  ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  : '—:—';

const toInt = v => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const toSeconds = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

module.exports = { clean, multiline, mmss, toInt, toSeconds };
