/* The loader. It is never a blank screen: something is on it from the first
   paint, and it fades rather than cutting when the scene's first frame lands. */
export default function LoadingScreen({ hidden, label = 'Chargement' }) {
  return (
    <div className={`loader${hidden ? ' hide' : ''}`} role="status" aria-live="polite">
      <div className="ring" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
