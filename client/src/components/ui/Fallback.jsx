/* ============================================================
   When the scene cannot start.
   It says what happened, what to try, and — quietly, in monospace — what the
   browser actually reported, so a problem on someone else's phone can be
   diagnosed from a screenshot rather than guessed at.
   ============================================================ */
export default function Fallback({ message, detail, tech, onRetry }) {
  return (
    <div className="fallback" role="alert">
      <div>
        <div className="fb-msg">{message}</div>
        {detail && <div className="fb-detail">{detail}</div>}
        {tech && <div className="fb-tech">{tech}</div>}
        <button className="fb-retry" type="button" onClick={onRetry || (() => location.reload())}>
          Recharger
        </button>
      </div>
    </div>
  );
}
