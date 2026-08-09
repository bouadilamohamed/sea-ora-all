import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import UnderwaterScene from '../components/underwater/UnderwaterScene';
import WaterOverlay, { Vignette } from '../components/underwater/WaterOverlay';
import PasscodeGate from '../components/passcode/PasscodeGate';
import MemoryCollection from '../components/memories/MemoryCollection';
import LoadingScreen from '../components/ui/LoadingScreen';
import Fallback from '../components/ui/Fallback';
import { usePerformanceTier, prefersReducedMotion } from '../hooks/usePerformanceTier';
import { useVoiceNotes } from '../hooks/useVoiceNotes';
import * as api from '../api/pearls';

/* ============================================================
   The experience.

       Loading → underwater scene → passcode gate → authenticated
              → memory collection → select memory → open memory
              → fullscreen story viewer → photo / video / voice / note

   This component owns the flow and nothing else: the scene draws itself, the
   pile has its own physics, the story has its own clock. What lives here is
   the ORDER those things happen in.
   ============================================================ */

const EMPTY = {
  message: '', memories: [], images: [], videos: [], audios: [], notes: [],
  createdAt: 0, autoplay: true
};

export default function ViewerPage() {
  const { slug = '' } = useParams();
  const profile = usePerformanceTier();
  const reduceRef = useRef(prefersReducedMotion());
  const reduce = reduceRef.current;

  const sceneRef = useRef(null);
  const timers = useRef([]);

  const [sceneReady, setSceneReady] = useState(false);
  const [failure, setFailure] = useState(null);

  const [gate, setGate] = useState(null);          // the door's wording
  const [gateOpen, setGateOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const [content, setContent] = useState(EMPTY);
  const [unlocked, setUnlocked] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [flash, setFlash] = useState(false);
  const [hintAway, setHintAway] = useState(false);

  const voiceApi = useVoiceNotes(content.audios);

  /* every setTimeout the reveal schedules, so a close or an unmount cancels
     the whole cascade rather than letting a stale beat fire into a dead tree */
  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, Math.max(0, ms));
    timers.current.push(id);
    return id;
  }, []);
  const clearSchedule = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => () => clearSchedule(), [clearSchedule]);

  /* ---------- boot: the gate's wording, and nothing more ----------
     Only non-secret metadata comes back here (title, invitation, hint,
     whether a reference is needed). Photos, films and voices stay on the
     server until the code has been verified. */
  useEffect(() => {
    let alive = true;
    api.gate(slug)
      .then(door => { if (alive) setGate(door); })
      .catch(err => {
        if (!alive) return;
        if (err.status === 404) {
          setGate({
            gateTitle: 'Perle introuvable',
            gateNote: 'Ce lien a expiré ou n’existe plus.',
            missing: true
          });
          return;
        }
        /* The gift exists but its author has not sealed it yet: there is no
           code to type, so the gate says so instead of offering a field that
           cannot work. */
        if (err.status === 409) {
          setGate({
            gateTitle: err.payload.gateTitle || 'Cadeau en préparation',
            gateNote: err.payload.gateNote || 'Cette perle n’a pas encore été scellée par son auteur.',
            missing: true
          });
          return;
        }
        // offline → the gate still works, unlock will report the error
        setGate({});
      });
    return () => { alive = false; };
  }, [slug]);

  /* ---------- the reveal ---------- */

  const reveal = useCallback(() => {
    setUnlocked(true);
    setGateOpen(false);
    setHintAway(true);

    const scene = sceneRef.current;
    const revealAt = scene ? scene.reveal() : 0;
    const t = reduce ? 0 : 1;

    clearSchedule();
    schedule(() => setFlash(true), revealAt - 400 * t);
    schedule(() => {
      setGalleryVisible(true);
      /* Nothing plays by itself.
         A voice used to begin the instant the souvenirs landed. It is someone
         speaking, in a room the visitor did not choose — on a bus, in an
         office, next to someone asleep — and it started before they had seen
         a single photograph. A recording now waits to be asked for: the play
         button on its card, or opening it. */
      /* The gallery covers the canvas completely, so every frame rendered
         behind it is wasted work competing with scrolling for the main
         thread. Stopping the loop — and dropping the water layers out of the
         tree — once the fade has finished is what makes the deck smooth. */
      schedule(() => {
        sceneRef.current?.suspend();
        document.body.classList.add('in-gallery');
      }, 700);
    }, revealAt);
    schedule(() => setFlash(false), revealAt + 900 * t);
  }, [reduce, schedule, clearSchedule]);

  const closeReveal = useCallback(() => {
    clearSchedule();
    setGalleryVisible(false);
    setFlash(false);
    setHintAway(false);
    voiceApi.stopAll();
    document.body.classList.remove('in-gallery');
    sceneRef.current?.resume();      // the shell is visible again
    sceneRef.current?.closeReveal();
  }, [clearSchedule, voiceApi]);

  useEffect(() => () => document.body.classList.remove('in-gallery'), []);

  /* ---------- the gate ---------- */

  const failCode = useCallback(message => {
    setError(message);
    setShake(true);
    setTimeout(() => setShake(false), 460);
  }, []);

  const submit = useCallback(async ({ passcode, reference }, clear) => {
    if (!passcode) return;
    if (gate?.needsRef && !reference) { failCode('Entrez la référence'); return; }

    setChecking(true);
    setError('');
    try {
      const answer = await api.unlock({ slug, passcode, reference });

      setContent({ ...EMPTY, ...answer.content });
      if (answer.token) sessionStorage.setItem(`seaora.view.${answer.slug || slug}`, answer.token);

      /* Still inside the user's tap. Mobile browsers only allow playback that
         descends from a gesture; priming the element here is what makes the
         FIRST press of a play button work later, on a page the visitor has by
         then been looking at for some time. It starts nothing — it plays
         silence for an instant and pauses. */
      voiceApi.arm();
      /* The push-in gives us three seconds; use them to pull the thumbnails
         down in the background, so the gallery never shows empty frames. */
      preload(answer.content);

      clear?.();
      reveal();
    } catch (err) {
      /* gate metadata may have been missed (offline at boot) — the server
         tells us the field is needed after all */
      if (err.payload?.needsRef && !gate?.needsRef) {
        setGate(g => ({ ...(g || {}), needsRef: true }));
      }
      failCode(err.status === 0
        ? 'Connexion impossible — réessayez'
        : (err.message || 'Code incorrect — réessayez'));
    } finally {
      setChecking(false);
    }
  }, [slug, gate, voiceApi, reveal, failCode]);

  /* ---------- the shell answers a tap ---------- */

  const onShellTap = useCallback(() => {
    if (galleryVisible) return;                    // the gallery handles its own close
    if (gateOpen) { setGateOpen(false); return; }
    if (!unlocked) { setGateOpen(true); return; }
    reveal();                                      // already unlocked → reopen the reveal
  }, [galleryVisible, gateOpen, unlocked, reveal]);

  const pearlOrigin = useCallback(() => sceneRef.current?.pearlScreenPos() || null, []);

  return (
    <>
      <WaterOverlay tier={profile.tier} reduce={reduce} />

      <UnderwaterScene
        profile={profile}
        sceneRef={sceneRef}
        onReady={() => setSceneReady(true)}
        onFail={setFailure}
        onShellTap={onShellTap}
      />

      <Vignette />

      <div className="ui">
        <h1 className="title">SEAORA<span className="small">Keep love within reach</span></h1>
        <p className={`hint${hintAway ? ' away' : ''}`}>
          <b>Touchez</b> le coquillage&nbsp;·&nbsp;<b>glissez</b> pour pivoter
        </p>
      </div>

      <PasscodeGate
        open={gateOpen && !galleryVisible}
        gate={gate}
        checking={checking}
        error={error}
        shake={shake}
        onSubmit={submit}
        onDismiss={() => setGateOpen(false)}
      />

      <div className={`flash${flash ? ' on' : ''}`} aria-hidden="true" />

      {unlocked && (
        <MemoryCollection
          content={content}
          visible={galleryVisible}
          tier={profile.tier}
          reduce={reduce}
          voiceApi={voiceApi}
          pearlOrigin={pearlOrigin}
          onClose={closeReveal}
        />
      )}

      {failure
        ? <Fallback {...failure} />
        : <LoadingScreen hidden={sceneReady || !!gate} label="Chargement du coquillage" />}
    </>
  );
}

/* Fetch the first few thumbnails during the push-in, so the deck is instant
   when it lands. Only the thumbnails: the full photograph is fetched when a
   memory is actually opened. */
function preload(content) {
  if (!content) return;
  /* In album order, so the first few fetched are the first few the pile shows
     — which is the whole point of doing it during the push-in. */
  const album = Array.isArray(content.memories) && content.memories.length
    ? content.memories.map(m => (m.kind === 'video' ? m.poster : m.thumb || m.src))
    : [
      ...content.images.map(i => i.thumb || i.src),
      ...content.videos.map(v => v.poster)
    ];
  album.filter(Boolean).slice(0, 8)
    .forEach(src => { const im = new Image(); im.src = src; });
}
