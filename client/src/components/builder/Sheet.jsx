import { useEffect, useRef } from 'react';

/* ============================================================
   A sheet.

   It rises from the bottom edge on a phone and settles in the middle of a
   desk. It is the only place in the workshop where anything is typed, and it
   is deliberately short-lived: it opens, it takes what it came for, and it
   goes away again.

   `dismissible={false}` pins it open — used while a gift is being sealed,
   where a stray tap outside must not abandon the operation half-done.
   ============================================================ */
export default function Sheet({
  open, title, note, error, actions = [], dismissible = true, busy, onDismiss, children
}) {
  const cardRef = useRef(null);

  /* Focus the first field, once the sheet has finished rising: moving focus
     mid-transition makes some browsers scroll the page underneath. */
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      cardRef.current?.querySelector('input, textarea')?.focus();
    }, 340);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !dismissible) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onDismiss?.(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismissible, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="sheet show"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      /* a tap on the water outside the sheet puts it away */
      onPointerDown={e => { if (e.target === e.currentTarget && dismissible) onDismiss?.(); }}
    >
      <div className="sheet-card" ref={cardRef}>
        <div className="sheet-grip" aria-hidden="true" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {note && <p className="sheet-note">{note}</p>}

        {children}

        {/* says why the sheet cannot do what was asked, without closing it */}
        <p className="sheet-err" role="alert">{error || ''}</p>

        {!!actions.length && (
          <div className="sheet-actions">
            {actions.map(action => (
              <button
                key={action.value}
                type="button"
                className={`btn${action.kind === 'ghost' ? ' ghost' : action.kind === 'danger' ? ' danger' : ''}`}
                disabled={busy && action.kind !== 'ghost'}
                onClick={() => action.onClick()}
              >
                {busy && action.kind !== 'ghost' ? 'Un instant…' : action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* A question that must be answered before something is thrown away. */
export function ConfirmSheet({ open, title, note, confirmLabel = 'Supprimer', onConfirm, onCancel }) {
  return (
    <Sheet
      open={open}
      title={title}
      note={note}
      onDismiss={onCancel}
      actions={[
        { label: confirmLabel, kind: 'danger', value: 'yes', onClick: onConfirm },
        { label: 'Annuler', kind: 'ghost', value: 'no', onClick: onCancel }
      ]}
    />
  );
}
