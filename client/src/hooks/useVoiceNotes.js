import { useCallback, useEffect, useRef, useState } from 'react';
import * as bus from '../services/audioBus';

/* ============================================================
   The voice notes of one pearl, as real HTMLAudioElements.

   The elements are owned here rather than rendered as <audio> tags, because
   they must outlive the components that show them: a note keeps playing while
   the story viewer opens over the pile, and the pile follows whatever is
   being heard.

   Only the FIRST note is fetched ahead of time, because only the first plays
   by itself when the pile lands. The rest are preload="none": their length is
   already known — it travels with the pearl — so a metadata request has
   nothing left to tell us, and a gift with eight voices no longer opens eight
   connections nobody asked for.
   ============================================================ */
export function useVoiceNotes(audios) {
  const elementsRef = useRef([]);
  const [playingIndex, setPlayingIndex] = useState(-1);
  /* Progress is a ref, not state: it is read every frame by the waveform and
     the progress bar, which write it straight to the DOM. */
  const progressRef = useRef({ index: -1, current: 0, duration: 0 });
  const [durations, setDurations] = useState(() => audios.map(a => a.seconds ?? null));

  useEffect(() => {
    const elements = audios.map((audio, i) => {
      const el = new Audio();
      el.preload = i === 0 ? 'auto' : 'none';
      el.src = audio.src;
      return el;
    });
    elementsRef.current = elements;

    const unregister = elements.map(el => bus.register(el));
    const cleanups = elements.map((el, i) => {
      const onPlay = () => setPlayingIndex(i);
      const onPause = () => setPlayingIndex(p => (p === i ? -1 : p));
      /* A note sealed before lengths were recorded fills its own in the first
         time the browser looks at the file. */
      const onMeta = () => setDurations(d => {
        if (d[i] != null || !Number.isFinite(el.duration)) return d;
        const next = d.slice();
        next[i] = el.duration;
        return next;
      });
      el.addEventListener('play', onPlay);
      el.addEventListener('pause', onPause);
      el.addEventListener('loadedmetadata', onMeta);
      return () => {
        el.removeEventListener('play', onPlay);
        el.removeEventListener('pause', onPause);
        el.removeEventListener('loadedmetadata', onMeta);
      };
    });

    return () => {
      cleanups.forEach(fn => fn());
      unregister.forEach(fn => fn());   // stops, unloads and forgets each element
      elementsRef.current = [];
      setPlayingIndex(-1);
    };
  }, [audios]);

  const elementAt = useCallback(i => elementsRef.current[i] || null, []);

  const play = useCallback(i => {
    const el = elementsRef.current[i];
    if (!el) return Promise.resolve();
    return bus.play(el);
  }, []);

  const pause = useCallback(i => {
    bus.pause(elementsRef.current[i]);
  }, []);

  const toggle = useCallback(i => {
    const el = elementsRef.current[i];
    if (!el) return;
    if (el.paused) bus.play(el); else bus.pause(el);
  }, []);

  const stopAll = useCallback(() => bus.stopAll(), []);

  /** Prime every element inside the unlock tap, so note one may start later. */
  const arm = useCallback(() => {
    const first = elementsRef.current[0];
    if (first) bus.arm(first);
  }, []);

  const seek = useCallback((i, ratio) => {
    const el = elementsRef.current[i];
    if (!el || !el.duration) return;
    el.currentTime = Math.max(0, Math.min(1, ratio)) * el.duration;
  }, []);

  /** Where a note is, right now — read per frame, never through React state. */
  const progressOf = useCallback(i => {
    const el = elementsRef.current[i];
    if (!el || !el.duration || !Number.isFinite(el.duration)) {
      return { ratio: 0, current: 0, duration: durations[i] ?? 0, playing: false };
    }
    return {
      ratio: el.currentTime / el.duration,
      current: el.currentTime,
      duration: el.duration,
      playing: !el.paused && !el.ended
    };
  }, [durations]);

  /** Subscribe to a note's `ended` — the album hands over on its own. */
  const onEnded = useCallback((i, handler) => {
    const el = elementsRef.current[i];
    if (!el) return () => {};
    el.addEventListener('ended', handler);
    return () => el.removeEventListener('ended', handler);
  }, []);

  return {
    playingIndex, durations, progressRef,
    elementAt, play, pause, toggle, stopAll, arm, seek, progressOf, onEnded,
    count: audios.length
  };
}
