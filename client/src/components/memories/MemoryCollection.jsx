import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MemoryStack from './MemoryStack';
import Journal from './Journal';
import StoryViewer from '../story/StoryViewer';
import Dust from '../ui/Dust';
import { useCardStack } from '../../hooks/useCardStack';
import { albumDate as formatAlbumDate } from '../../utils/format';

/* ============================================================
   The album.

   ONE pile, holding everything the pearl was given: photographs, films,
   voices and written pages, in one order, on one paper, at the same size.

   They used to be two piles — the prints in the middle of the screen and the
   voices in a smaller stack of their own underneath. That said the voices
   were a different kind of thing, a feature beside the album rather than a
   memory inside it. They are not. A recording of someone's voice is the most
   personal thing in most of these gifts, and it was the smallest card on the
   screen.

   So a voice is a print now: the same frame, the same paper, the same tilt in
   the pile, the same tap to open. What is mounted in the window differs, and
   nothing else does.

   Under the pile, the words that belong to whichever memory is in hand.
   ============================================================ */
export default function MemoryCollection({
  content, visible, tier, reduce, voiceApi, pearlOrigin, onClose
}) {
  const stageRef = useRef(null);
  const stackRef = useRef(null);
  const originRef = useRef(null);

  const [story, setStory] = useState({ open: false, index: 0 });
  const [touched, setTouched] = useState(false);

  const when = useMemo(() => formatAlbumDate(content.createdAt), [content.createdAt]);

  const isMobile = useMemo(
    () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches,
    []
  );

  /* The album, in the order its AUTHOR built it — a photograph, then a voice,
     then another photograph, then a written page, if that is how they added
     them. The server sends it as one ordered list; nothing is regrouped here,
     because regrouping is exactly what used to destroy the order.

     A voice carries `voiceIndex`: its place among the audio elements, which
     is not its place in the album. Everything that plays a sound wants that
     number, and the server works it out so the browser cannot get it wrong.

     The grouped arrays are the fallback for a payload from an older server —
     a tab left open across a deploy — and reproduce the old ordering exactly. */
  const items = useMemo(() => {
    if (Array.isArray(content.memories) && content.memories.length) {
      return content.memories.map((m, k) => ({ ...m, key: `${m.kind}-${m.id ?? k}` }));
    }
    return [
      ...content.images.map((i, k) => ({ ...i, kind: 'photo', key: `photo-${i.id ?? k}` })),
      ...content.videos.map((v, k) => ({ ...v, kind: 'video', key: `video-${v.id ?? k}` })),
      ...content.audios.map((a, k) => ({
        ...a, kind: 'voice', voiceIndex: k, caption: a.label || '', key: `voice-${a.id ?? k}`
      })),
      ...content.notes.map((n, k) => ({
        ...n, kind: 'note', caption: n.title || '', key: `note-${n.id ?? k}`
      }))
    ];
  }, [content]);

  const audios = content.audios;

  /* ---------- opening a memory ---------- */

  const markTouched = useCallback(() => setTouched(true), []);

  /* The element a memory is opened FROM is where it flies back to, so it is
     captured before the state change rather than looked up afterwards — by
     then the pile may already have moved. */
  const openRef = useRef(false);

  const openPrint = useCallback((index, element) => {
    if (openRef.current) return;
    openRef.current = true;
    originRef.current = element || null;
    setStory({ open: true, index });
  }, []);

  const onOpen = useMemo(() => ({ markTouched, open: openPrint }), [markTouched, openPrint]);
  const originOf = useCallback(() => pearlOrigin?.() || null, [pearlOrigin]);

  const stack = useCardStack({
    items,
    stageRef,
    stackRef,
    isMobile,
    reduce,
    onOpen,
    locked: story.open,
    originOf
  });

  const {
    position, advance, retreat, goTo, cardsRef, positionRef, handlers, registerCard
  } = stack;

  /* The pile walks with the story.

     A story that ran on by itself for four memories and then closed back onto
     the print it started from would undo the reading: the memory in hand must
     be the memory just seen. So each time the story steps, the pile steps
     under it — which also means the flight home always has the TOP card to
     land on, whichever memory the reader stopped at. */
  useEffect(() => {
    if (!story.open) return undefined;
    goTo(story.index);
    const landed = cardsRef.current[story.index];
    if (landed) originRef.current = landed;
    return undefined;
  }, [story.open, story.index, goTo, cardsRef]);

  const closeStory = useCallback(() => {
    openRef.current = false;
    setStory(s => (s.open ? { ...s, open: false } : s));
    voiceApi.stopAll();
    /* the pile takes the focus back, so a keyboard reader is returned to the
       memory it was holding rather than to the top of the page */
    const target = stackRef.current;
    if (target) requestAnimationFrame(() => target.focus?.({ preventScroll: true }));
  }, [voiceApi]);

  /* the origin is only cleared once the flight home has been computed */
  useEffect(() => {
    if (story.open) return undefined;
    const t = setTimeout(() => { originRef.current = null; }, 700);
    return () => clearTimeout(t);
  }, [story.open]);

  /* ---------- the voices ---------- */

  /* Nothing plays that was not asked for.

     Outside the story a recording used to run on into the next one when it
     ended, so that a voice carried across the album on its own. It is dropped:
     a visitor who pressed play on ONE message did not agree to hear all eight,
     and a sound starting by itself in a quiet room is the fastest way to make
     someone close a gift.

     A note ends and the album is quiet again. The next one is one press away —
     every voice card carries its own play button — and inside the story the
     memories still hand over to each other, because that is what a story is
     and the reader opened it on purpose.

     The pile is also never moved to follow what is playing: it is the thing
     the reader is holding. The card of the note being heard says so on its
     own, with the ring breathing out of its microphone. */

  void audios;

  /* ---------- keyboard ---------- */

  useEffect(() => {
    if (!visible) return undefined;

    const onKeyDown = e => {
      if (e.key === 'Escape') {
        if (story.open) closeStory();          // innermost layer closes first
        else onClose();
        return;
      }

      if (!story.open) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        markTouched();
        if (e.key === 'ArrowLeft') retreat(); else advance(-1);
        return;
      }

      if (e.key === ' ' && items[story.index]?.kind === 'voice') {
        e.preventDefault();                     // space holds the voice
        voiceApi.toggle(items[story.index].voiceIndex);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = story.index + (e.key === 'ArrowLeft' ? -1 : 1);
      if (next < 0 || next >= items.length) closeStory();
      else setStory(s => ({ ...s, index: next }));
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible, story, items, closeStory, onClose, voiceApi, advance, retreat, markTouched]);

  const onStackKeyDown = e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openPrint(positionRef.current, cardsRef.current[positionRef.current]);
  };

  /* ---------- the words that belong to the memory in hand ---------- */

  const current = items[position] || null;
  const journalTitle = current
    ? (current.kind === 'note'
      ? (current.title || 'Sans titre')
      : current.caption
        || (current.kind === 'video' ? 'Film'
          : current.kind === 'voice' ? 'Message vocal' : 'Souvenir'))
    : (content.title || 'Pour toi');
  const journalDate = current?.kind === 'note' && current.day ? current.day : when;

  return (
    <div
      className={[
        'gallery',
        visible ? 'show' : '',
        touched ? 'touched' : '',
        story.open ? 'behind' : ''
      ].filter(Boolean).join(' ')}
      aria-hidden={visible ? 'false' : 'true'}
    >
      {/* Motes of light, and only where they are free. Each one is its own
          running animation; on a phone the pile wants those frames, and the
          album is not poorer for the room. */}
      {visible && tier === 2 && <Dust tier={tier} reduce={reduce} />}

      <button
        className="gallery-close" type="button"
        aria-label="Fermer l’album" onClick={onClose}
      >×</button>

      <header className="deck-head">
        <h1 className="deck-brand">SEAORA</h1>
        <span className="deck-flourish" aria-hidden="true" />
        <p className="deck-kicker">nos souvenirs</p>
      </header>

      {items.length ? (
        <>
          <div className="stage" ref={stageRef}>
            <MemoryStack
              ref={stackRef}
              items={items}
              albumDate={when}
              registerCard={registerCard}
              handlers={handlers}
              label={`${journalTitle} — ${position + 1} sur ${items.length}. Appuyez pour ouvrir, les flèches pour parcourir.`}
              onKeyDown={onStackKeyDown}
              /* a number, not the voice API: only the card whose note started
                 or stopped re-renders, and the rest are left alone */
              playingVoice={voiceApi.playingIndex}
              onToggleVoice={voiceApi.toggle}
            />
          </div>

          <div className="stack-meta">
            <button
              className="stack-btn" type="button" aria-label="Souvenir précédent"
              disabled={items.length < 2}
              onClick={() => { markTouched(); retreat(); }}
            >‹</button>
            <span className="stack-count" aria-live="polite">
              <b>{position + 1}</b><i>/</i><span>{items.length}</span>
            </span>
            <button
              className="stack-btn" type="button" aria-label="Souvenir suivant"
              disabled={items.length < 2}
              onClick={() => { markTouched(); advance(-1); }}
            >›</button>
          </div>
        </>
      ) : (
        <p className="gallery-empty">
          Cette perle ne contient encore aucun souvenir.
        </p>
      )}

      {(items.length > 0 || (content.message || '').trim()) && (
        <Journal
          title={journalTitle}
          date={journalDate}
          message={content.message}
          reduce={reduce}
        />
      )}

      {items.length > 1 && (
        <p className="stack-hint">Touchez pour ouvrir · glissez pour la suivante</p>
      )}

      <StoryViewer
        open={story.open}
        index={story.index}
        items={items}
        albumDate={when}
        tier={tier}
        reduce={reduce}
        originRef={originRef}
        returnRef={originRef}
        voiceApi={voiceApi}
        onIndexChange={index => setStory(s => ({ ...s, index }))}
        onClose={closeStory}
      />
    </div>
  );
}
