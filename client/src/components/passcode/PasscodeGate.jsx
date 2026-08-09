import { useEffect, useRef, useState } from 'react';

/* ============================================================
   The gate.

   The passcode is not in this bundle and never has been: the value typed here
   is posted to /api/auth/passcode and compared server-side against a scrypt
   hash. What comes back on success is the album; what comes back on failure
   is one sentence that says the same thing whether the code, the reference or
   both were wrong.
   ============================================================ */
export default function PasscodeGate({
  open, gate, checking, error, shake, onSubmit, onDismiss
}) {
  const [code, setCode] = useState('');
  const [reference, setReference] = useState('');
  const codeRef = useRef(null);
  const refRef = useRef(null);

  const needsRef = !!gate?.needsRef;
  /* A pearl that cannot be opened at all — missing, or still being made —
     keeps its wording and loses its field: a box that cannot work is worse
     than no box. */
  const missing = !!gate?.missing;

  /* The reference comes first when it is required — it is what identifies the
     pearl, and it is the thing the visitor is holding. */
  useEffect(() => {
    if (!open || missing) return undefined;
    const t = setTimeout(() => {
      (needsRef ? refRef : codeRef).current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [open, needsRef, missing]);

  /* A wrong code selects itself, so the next attempt is one keystroke away. */
  useEffect(() => {
    if (error && !checking) codeRef.current?.select();
  }, [error, checking]);

  const submit = e => {
    e?.preventDefault();
    if (checking) return;
    onSubmit({ passcode: code.trim(), reference: reference.trim() }, () => {
      setCode('');
      setReference('');
    });
  };

  return (
    <div
      className={`gate${open ? ' show' : ''}${shake ? ' shake' : ''}`}
      aria-hidden={open ? 'false' : 'true'}
      onPointerDown={e => { if (e.target === e.currentTarget) onDismiss?.(); }}
    >
      <form
        className={`gate-card${missing ? ' missing' : ''}`}
        autoComplete="off"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
      >
        <div className="gate-pearl" aria-hidden="true" />

        <h2 id="gate-title">{gate?.gateTitle || 'Coquillage scellé'}</h2>
        <p>{gate?.gateNote || 'Entrez le code secret pour révéler la perle'}</p>

        {/* shown only when the pearl was sealed with a reference — the server
            says so, and it never says what the reference is */}
        {needsRef && (
          <input
            ref={refRef}
            className="gate-ref"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            placeholder="Référence"
            aria-label="Référence"
            value={reference}
            onChange={e => setReference(e.target.value)}
            onKeyDown={e => {
              // Enter here moves to the code rather than submitting a half-filled gate
              if (e.key === 'Enter') { e.preventDefault(); codeRef.current?.focus(); }
            }}
          />
        )}

        <input
          ref={codeRef}
          type="password"
          inputMode="text"
          autoComplete="off"
          spellCheck="false"
          placeholder="• • • • •"
          aria-label="Code secret"
          value={code}
          onChange={e => setCode(e.target.value)}
        />

        <button type="submit" disabled={checking}>
          {checking ? 'Ouverture…' : 'Révéler'}
        </button>

        {gate?.hint && <div className="gate-hint show">{`“${gate.hint}”`}</div>}

        <div className={`gate-err${error ? ' show' : ''}`} role="alert" aria-live="assertive">
          {error}
        </div>
      </form>
    </div>
  );
}
