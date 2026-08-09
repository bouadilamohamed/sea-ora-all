/* The glyphs, drawn once. Each is decorative — the accessible name always
   lives on the control that holds it, never on the shape. */

export const PlayIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M8 5v14l11-7z" /></svg>
);

export const PauseIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
);

export const MicIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z" />
  </svg>
);

/* the workshop's line-drawn set — stroked, not filled */
const stroke = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round', strokeLinejoin: 'round'
};

export const PlusIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}><path d="M12 5v14M5 12h14" /></svg>
);

export const PhotoIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m4 17 5-5 4 4 3-3 4 4" />
  </svg>
);

export const FilmIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M8 5v14M16 5v14M3 12h18" />
  </svg>
);

export const PenIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4z" />
  </svg>
);

export const MicLineIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export const SwapIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    <path d="M4 9h13l-3-3M20 15H7l3 3" />
  </svg>
);

export const TrashIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);

export const TagIcon = PenIcon;

export const EyeIcon = props => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);
