import { forwardRef } from 'react';
import MemoryCard from './MemoryCard';

/* ============================================================
   The pile itself.

   It is a button in every way that matters: it has an accessible name, it is
   in the tab order, it answers Enter and Space, and it takes a focus ring.

   It is not a <button> ELEMENT because a button may only contain phrasing
   content, and a print is an <article> holding a heading, a paragraph and an
   image. `role="button"` with real keyboard handling is the pattern for
   exactly this case — a control whose content a native button cannot legally
   hold — and it reaches assistive technology as a button either way. Every
   ordinary control in this application is a real <button>.
   ============================================================ */
const MemoryStack = forwardRef(function MemoryStack(
  { items, albumDate, registerCard, handlers, label, onKeyDown, playingVoice, onToggleVoice },
  ref
) {
  return (
    <div
      className="stack"
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={onKeyDown}
      {...handlers}
      onDragStart={e => e.preventDefault()}
    >
      {items.map((item, i) => (
        <MemoryCard
          key={item.key}
          item={item}
          index={i}
          visibleAhead={5}
          albumDate={albumDate}
          registerCard={registerCard}
          /* a boolean, not the voice API: only the card whose note started or
             stopped re-renders, and the other eleven are left alone */
          playing={item.kind === 'voice' && playingVoice === item.voiceIndex}
          onToggleVoice={onToggleVoice}
        />
      ))}
    </div>
  );
});

export default MemoryStack;
