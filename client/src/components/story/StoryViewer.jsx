import { useCallback, useEffect, useRef, useState } from 'react';
import StoryProgress from './StoryProgress';
import PhotoMemory from './PhotoMemory';
import VideoMemory from './VideoMemory';
import NoteMemory from './NoteMemory';
import AudioPlayer from './AudioPlayer';
import Dust from '../ui/Dust';
import { MOVE, flush, glide, paint, place, seed, stopMove } from '../../utils/motion';
import { mmss } from '../../utils/format';

/* ============================================================
   One memory, opened full screen.

   Not an enlargement: the memory takes the whole screen the way a story does.
   The print flies up out of the pile into place, bars along the top count the
   memories out, each hands over to the next on its own, a tap on the left or
   right side steps back or on, holding pauses, and pulling it downward puts
   it back on the pile. Photographs, films, written pages and voices share the
   shell — only what sits inside the frame differs.

   Everything that moves per frame — the progress bar, the waveform's clip,
   the remaining time — is written straight to the DOM. React state here only
   changes when the MEMORY changes, which is a few times a minute, not sixty
   times a second.
   ============================================================ */

const PHOTO_MS = 5200;    // how long a photograph holds the screen
const NOTE_MS = 11000;    // a written page is read, so it stays longer
const HOLD_MS = 240;      // press this long and it waits for you

export default function StoryViewer({
  open, index, items, albumDate, tier, reduce,
  originRef, returnRef, voiceApi, onIndexChange, onClose
}) {
  const storyRef = useRef(null);
  const cardRef = useRef(null);
  const barsRef = useRef(null);
  const videoRef = useRef(null);
  const waveRef = useRef(null);
  const fillRef = useRef(null);
  const durRef = useRef(null);
  const closeRef = useRef(null);

  /* The whole clock lives in one ref: a rAF loop that reads React state would
     capture a stale copy on every frame it was created in. */
  const st = useRef({
    elapsed: 0, t0: 0, paused: false, raf: 0, hold: 0, drag: null,
    box: null, filmStuck: false
  });

  const [voicePlaying, setVoicePlaying] = useState(false);

  /* The story is mounted from the moment the pearl is unlocked — it has to be,
     because the flight in is measured against its card and the card must
     already have a box. What it must NOT do is load a memory nobody has opened:
     rendering PhotoMemory while shut pulled the FULL-SIZE photograph of the
     first souvenir down the wire and decoded it in the middle of the push-in,
     for a frame that is not on screen.

     So the inside of the card waits for the first opening. It is deliberately
     latched rather than tied to `open`: on the way out the card flies back to
     the pile, and it has to still have the photograph in it while it does. */
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => { if (open) setEverOpened(true); }, [open]);

  /* One album, walked end to end. A voice is a memory in the same sequence as
     everything else, so the bars count them all and the story steps from a
     photograph to a recording to a written page without changing mode.

     `voiceIndex` is a voice's place among the AUDIO ELEMENTS, which is not its
     place in the album. Everything that plays wants the first number. */
  const count = items.length;
  const item = items[index] || {};
  const kind = item.kind || 'photo';
  const isVoice = kind === 'voice';
  const voiceAt = item.voiceIndex ?? -1;

  /* ---------- the bars ---------- */

  const paintBars = useCallback(() => {
    const kids = barsRef.current?.children;
    if (!kids) return;
    for (let k = 0; k < kids.length; k++) {
      kids[k].firstChild.style.width = k < index ? '100%' : '0%';
    }
  }, [index]);

  const setBar = useCallback(p => {
    const seg = barsRef.current?.children[index];
    if (seg) seg.firstChild.style.width = `${(Math.max(0, Math.min(1, p)) * 100).toFixed(2)}%`;
  }, [index]);

  const setFill = useCallback(p => {
    fillRef.current?.style.setProperty('--p', `${(Math.max(0, Math.min(1, p)) * 100).toFixed(2)}%`);
  }, []);

  /* ---------- the flight in and out ---------- */

  /* the print flies up out of the pile and becomes the screen */
  const flipIn = useCallback(source => {
    const card = cardRef.current;
    if (!card) return;
    const dest = st.current.box;
    const s = source?.getBoundingClientRect();

    if (!s?.width || !dest?.width) {
      seed(card, { x: 0, y: 0, rot: 0, sc: 1, op: 1 });
      return;
    }
    place(card, {
      x: (s.left + s.width / 2) - (dest.left + dest.width / 2),
      y: (s.top + s.height / 2) - (dest.top + dest.height / 2),
      rot: 0,
      sc: Math.max(0.1, s.width / dest.width),
      op: 0.4
    });
    // placed and moved in one task: the start has to be flushed to be seen
    flush(card);
    glide(card, { x: 0, y: 0, rot: 0, sc: 1, op: 1 }, MOVE.OPEN, { reduce });
  }, [reduce]);

  /* …and drops back onto the pile it came from */
  const flipOut = useCallback(() => {
    const card = cardRef.current;
    const dest = st.current.box;
    const target = returnRef?.current;
    if (!card || !dest?.width || !target) return;
    const s = target.getBoundingClientRect();
    if (!s.width) return;
    glide(card, {
      x: (s.left + s.width / 2) - (dest.left + dest.width / 2),
      y: (s.top + s.height / 2) - (dest.top + dest.height / 2),
      sc: Math.max(0.1, s.width / dest.width),
      op: 0
    }, MOVE.STEP, { reduce });
  }, [returnRef, reduce]);

  /* ---------- opening ---------- */

  useEffect(() => {
    if (!open) return undefined;
    const card = cardRef.current;
    if (!card) return undefined;

    /* the frame is measured untransformed, once: both the flight in and the
       flight back are computed against this same rectangle */
    seed(card, { x: 0, y: 0, rot: 0, sc: 1, op: 1 });
    st.current.box = card.getBoundingClientRect();

    flipIn(originRef?.current);
    closeRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------- each memory ---------- */

  const step = useCallback(direction => {
    const next = index + direction;
    if (next < 0 || next >= count) { onClose(); return; }   // past either end: back to the pile
    onIndexChange(next);
  }, [index, count, onIndexChange, onClose]);

  /* Whenever the memory changes: reset the clock, redraw the bars, restart the
     entrance of the words underneath, and — for a voice — start the note. */
  useEffect(() => {
    if (!open) return undefined;
    const s = st.current;
    s.elapsed = 0;
    s.t0 = performance.now();
    s.paused = false;
    s.filmStuck = false;

    paintBars();
    setBar(0);

    /* A voice begins with the memory it belongs to. Anything else silences
       whatever was running: a photograph is looked at, not listened over. */
    if (isVoice) {
      setFill(0);
      voiceApi?.play(voiceAt);
    } else {
      voiceApi?.stopAll();
    }

    /* replay the entrance of the caption — restarting a CSS animation needs
       the class removed, a reflow, and the class back */
    const foot = storyRef.current?.querySelector('.story-foot');
    if (foot) {
      foot.classList.remove('in');
      void foot.offsetWidth;
      foot.classList.add('in');
    }

    /* Sliding to a memory the story walked onto by itself has no source
       element to fly from; it steps in from the side instead. */
    const card = cardRef.current;
    if (card && !originRef?.current) {
      place(card, { x: 30, y: 0, rot: 0, sc: 0.985, op: 0 });
      flush(card);
      glide(card, { x: 0, y: 0, rot: 0, sc: 1, op: 1 }, MOVE.STEP, { reduce });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  /* ---------- the clock ---------- */

  useEffect(() => {
    if (!open) return undefined;
    const s = st.current;

    const tick = now => {
      s.raf = requestAnimationFrame(tick);

      if (isVoice) {
        const p = voiceApi?.progressOf(voiceAt) || { ratio: 0, playing: false, duration: 0, current: 0 };
        setVoicePlaying(p.playing);
        storyRef.current?.classList.toggle('playing', p.playing);
        setBar(p.ratio);
        setFill(p.ratio);
        if (p.duration && durRef.current) {
          durRef.current.textContent = mmss(p.duration - p.current);
        }
        return;
      }

      /* A film sets its own pace: the bar follows the PICTURE rather than a
         clock, and the memory hands over when the film actually ends. Unless
         it never started — then it is treated like a photograph, below. */
      if (kind === 'video' && !s.filmStuck) {
        if (s.paused || s.drag) return;
        const video = videoRef.current;
        const d = video?.duration;
        if (d && Number.isFinite(d)) setBar(video.currentTime / d);
        return;
      }

      if (s.paused || s.drag) { s.t0 = now; return; }
      // a written page is read, not glanced at — it is given longer
      const span = kind === 'note' ? NOTE_MS : PHOTO_MS;
      s.elapsed += Math.min(64, now - s.t0);
      s.t0 = now;
      if (s.elapsed >= span) { step(1); return; }
      setBar(s.elapsed / span);
    };

    s.raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(s.raf); s.raf = 0; };
  }, [open, index, kind, isVoice, voiceAt, setBar, setFill, step, voiceApi]);

  /* Inside the story the notes hand over like memories; outside, they run on.
     This is the inside case. */
  useEffect(() => {
    if (!open || !isVoice) return undefined;
    return voiceApi?.onEnded(voiceAt, () => step(1));
  }, [open, isVoice, voiceAt, voiceApi, step]);

  /* ---------- holding pauses, everywhere ---------- */

  const holdPause = useCallback(() => {
    const s = st.current;
    s.paused = true;
    if (isVoice) { voiceApi?.pause(voiceAt); return; }
    // holding a film stops the picture too, not just the bar above it
    if (kind === 'video') { try { videoRef.current?.pause(); } catch (_) { /* fine */ } }
  }, [isVoice, voiceAt, kind, voiceApi]);

  const holdRelease = useCallback(() => {
    const s = st.current;
    if (!s.paused) return;
    s.paused = false;
    s.t0 = performance.now();
    if (isVoice) { voiceApi?.play(voiceAt); return; }
    if (kind === 'video' && !s.filmStuck) {
      videoRef.current?.play().catch(() => { s.filmStuck = true; });
    }
  }, [isVoice, voiceAt, kind, voiceApi]);

  /* a story left running in a hidden tab should not race ahead */
  useEffect(() => {
    if (!open) return undefined;
    const onVisibility = () => { if (document.hidden) holdPause(); else holdRelease(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [open, holdPause, holdRelease]);

  /* ---------- the hand on the story ---------- */

  const onPointerDown = e => {
    if (!open || e.target.closest?.('button')) return;
    st.current.drag = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY,
      moved: false, vy: 0, ly: e.clientY, lt: performance.now()
    };
    clearTimeout(st.current.hold);
    st.current.hold = setTimeout(holdPause, HOLD_MS);
    try { storyRef.current?.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
  };

  const onPointerMove = e => {
    const d = st.current.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;

    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      clearTimeout(st.current.hold);
    }

    if (dy > 0) {                                   // pulled downward: it starts to leave
      const card = cardRef.current;
      if (card?._s) {
        // the hand owns the card: no transition may run under it
        card.style.transition = 'none';
        card._s.y = dy;
        card._s.sc = 1 - Math.min(0.14, dy / 1500);
        paint(card);
      }
      storyRef.current?.style.setProperty('--fade', String(Math.max(0.12, 1 - dy / 460)));
    }

    const now = performance.now();
    const dt = now - d.lt;
    if (dt > 8) { d.vy = (e.clientY - d.ly) / dt * 1000; d.ly = e.clientY; d.lt = now; }
  };

  const onPointerUp = e => {
    const d = st.current.drag;
    if (!d || (e && e.pointerId !== d.id)) return;
    st.current.drag = null;
    clearTimeout(st.current.hold);
    if (e) { try { storyRef.current?.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ } }

    if (!d.moved) {
      if (st.current.paused) { holdRelease(); return; }   // it was a hold, not a tap
      const box = storyRef.current.getBoundingClientRect();
      const zone = (d.x0 - box.left) / (box.width || 1);
      step(zone < 0.34 ? -1 : 1);                        // left third steps back, the rest goes on
      return;
    }

    const dy = (e ? e.clientY : d.ly) - d.y0;
    if (dy > 110 || d.vy > 620) {                        // thrown down: put it back on the pile
      glide(cardRef.current, { y: innerHeight * 0.85, sc: 0.8, op: 0 }, MOVE.STEP, { reduce });
      storyRef.current?.style.setProperty('--fade', '0');
      onClose({ flyBack: false });
      return;
    }

    storyRef.current?.style.setProperty('--fade', '1');
    glide(cardRef.current, { x: 0, y: 0, sc: 1, op: 1 }, MOVE.STEP, { reduce });
    holdRelease();
  };

  /* ---------- closing ---------- */

  /* The parent decides WHEN the story closes; this is how it looks when it
     does. Exposed through the ref the parent already holds. */
  useEffect(() => {
    if (open) return undefined;
    // reset for the next opening, so a story never reopens mid-drag
    st.current.drag = null;
    st.current.paused = false;
    clearTimeout(st.current.hold);
    stopMove(cardRef.current);
    storyRef.current?.style.setProperty('--fade', '1');
    return undefined;
  }, [open]);

  const requestClose = useCallback(() => {
    flipOut();
    onClose({ flyBack: true });
  }, [flipOut, onClose]);

  /* the caption and the date under the memory */
  const caption = kind === 'note' ? ''
    : isVoice ? (item.label || item.caption || `Message vocal ${voiceAt + 1}`)
      : (item.caption || '');
  const dateLine = kind === 'note' ? '' : albumDate;

  return (
    <div
      className={[
        'story',
        open ? 'show' : '',
        isVoice ? 'voice' : '',
        kind === 'video' ? 'film' : '',
        kind === 'note' ? 'page' : ''
      ].filter(Boolean).join(' ')}
      ref={storyRef}
      role="dialog"
      aria-modal="true"
      aria-hidden={open ? 'false' : 'true'}
      aria-label="Souvenir"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="story-glow" aria-hidden="true" />
      {everOpened && tier === 2 && (
        <Dust className="story-dust" tier={tier} reduce={reduce} warm />
      )}

      <StoryProgress ref={barsRef} count={count} index={index} />

      <button className="story-x" type="button" ref={closeRef}
        aria-label="Fermer" onClick={requestClose}>×</button>

      <div className="story-body">
        <div className="story-card" ref={cardRef}>
          {!everOpened ? null : isVoice ? (
            <AudioPlayer
              index={voiceAt}
              playing={voicePlaying}
              /* the length is known from the pearl itself; the file is not
                 consulted, and the rAF loop overwrites this as it plays */
              remaining={mmss(item.seconds)}
              when={albumDate}
              refs={{ waveRef, fillRef, durRef }}
              onToggle={() => voiceApi?.toggle(voiceAt)}
              onSeek={ratio => voiceApi?.seek(voiceAt, ratio)}
            />
          ) : kind === 'note' ? (
            <NoteMemory item={item} fallbackDate={albumDate} />
          ) : kind === 'video' ? (
            <VideoMemory
              item={item}
              ref={videoRef}
              onEnded={() => step(1)}
              onStuck={() => {
                /* the film will not start: fall back to the photograph's clock
                   so the story moves on instead of stopping dead */
                st.current.filmStuck = true;
                st.current.elapsed = 0;
                st.current.t0 = performance.now();
              }}
            />
          ) : (
            <PhotoMemory item={item} index={index} />
          )}
        </div>

        {/* The words are the other half of the memory, so they are given a
            surface of their own rather than being laid on the photograph: a
            pane of glass, a hairline, and room to wrap. A caption that ran
            under a bright picture was unreadable exactly when the picture was
            worth captioning. */}
        {(caption || dateLine) && (
          <div className="story-foot">
            <div className="story-words">
              <p className="story-cap">{caption}</p>
              <p className="story-date">{dateLine}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
