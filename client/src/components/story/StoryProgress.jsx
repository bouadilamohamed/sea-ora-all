import { forwardRef } from 'react';

/* ============================================================
   The memories, counted out along the top.

   The filled width is written straight to the DOM by the story's rAF loop —
   sixty React renders a second to move a bar would be sixty renders of the
   whole viewer. The component only decides how many bars there are.
   ============================================================ */
const StoryProgress = forwardRef(function StoryProgress({ count, index }, ref) {
  return (
    <div className="story-bars" ref={ref} role="progressbar"
      aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1}
      aria-label={`Souvenir ${index + 1} sur ${count}`}>
      {Array.from({ length: count }, (_, k) => (
        <span key={k}><i /></span>
      ))}
    </div>
  );
});

export default StoryProgress;
