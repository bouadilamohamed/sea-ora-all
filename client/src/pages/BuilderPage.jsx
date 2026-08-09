import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Sheet, { ConfirmSheet } from '../components/builder/Sheet';
import LoadingScreen from '../components/ui/LoadingScreen';
import { useToast } from '../hooks/useToast';
import { usePerformanceTier, prefersReducedMotion } from '../hooks/usePerformanceTier';
import { VoiceRecorder, grabPoster, canRecord, secureEnough } from '../services/capture';
import { albumDate as formatAlbumDate, mmss, waveHeights } from '../utils/format';
import { SessionLost } from '../api/client';
import * as gifts from '../api/gifts';
import {
  PlusIcon, PhotoIcon, FilmIcon, PenIcon, MicLineIcon, MicIcon,
  PlayIcon, PauseIcon, SwapIcon, TrashIcon, TagIcon, EyeIcon
} from '../components/ui/icons';

/* ============================================================
   The workshop.

   The customer's side of the gift: the finished experience with one
   difference — a card can be filled, replaced or thrown away.

   Nothing here is a form. Every memory is added by taking the empty print at
   the end of the pile, and the moment it exists it becomes part of the pile,
   at the size, on the paper and with the shadow it will have on the day it is
   opened. What you see while you build is what will be seen.
   ============================================================ */

/* The four kinds of memory, in the order they are offered when something is
   added. One vocabulary — 'photo' | 'video' | 'note' | 'voice' — shared with
   the server and with the viewer, so a memory says what it is and nothing has
   to translate. */
const KINDS = [
  { id: 'photo', label: 'Photo', one: 'photo', sub: 'Choisissez une image', Icon: PhotoIcon },
  { id: 'voice', label: 'Voix', one: 'message vocal', sub: 'Enregistrez ou importez', Icon: MicLineIcon },
  { id: 'note', label: 'Écrit', one: 'souvenir écrit', sub: 'Un titre, une date, quelques mots', Icon: PenIcon },
  { id: 'video', label: 'Vidéo', one: 'vidéo', sub: 'Choisissez un film', Icon: FilmIcon }
];

const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]));

/* What the empty print at the end of the pile says. It no longer names one
   kind, because the pile no longer holds one kind: it asks, and the choosing
   is the next gesture. */
const ADD_LABEL = 'Ajouter un souvenir';
const ADD_SUB = 'Photo · voix · écrit · vidéo';

const titleOf = item => {
  if (!item) return '';
  if (item.kind === 'note') return item.title || 'Sans titre';
  if (item.kind === 'voice') return item.label || item.caption || 'Message vocal';
  if (item.kind === 'video') return item.label || item.caption || 'Vidéo';
  return item.caption || 'Souvenir';
};

export default function BuilderPage() {
  const { slug = '' } = useParams();
  const profile = usePerformanceTier();
  const reduce = useRef(prefersReducedMotion()).current;
  const { show: toast, element: toastEl } = useToast();

  const [booting, setBooting] = useState(true);
  const [door, setDoor] = useState(null);
  const [gift, setGift] = useState(null);
  const [gateNote, setGateNote] = useState('');
  const [gatePass, setGatePass] = useState('');
  const [gateErr, setGateErr] = useState('');
  const [gateShake, setGateShake] = useState(false);
  const [checking, setChecking] = useState(false);

  const [pos, setPos] = useState(0);
  const [saving, setSaving] = useState(null);       // {state, text}
  const [sheet, setSheet] = useState(null);         // which sheet is open
  const [preview, setPreview] = useState(null);     // a memory shown full screen

  const busyRef = useRef(false);
  const photoInput = useRef(null);
  const photoOneInput = useRef(null);
  const videoInput = useRef(null);
  const videoReplaceInput = useRef(null);
  const audioInput = useRef(null);
  const replacingRef = useRef(null);

  /* ONE list, in the author's order. Photographs, voices, written pages and
     films sit in the sequence they were added in — which is the sequence the
     gift will be read in. There are no tabs: a gift is not four collections,
     it is one album. */
  const list = useMemo(() => gift?.items || [], [gift]);
  const when = useMemo(() => formatAlbumDate(gift?.createdAt), [gift?.createdAt]);
  const current = list[pos] || null;                // null ⇒ the empty print is in hand
  const onAddCard = pos >= list.length;
  const kind = current?.kind || null;

  useEffect(() => { document.body.classList.add('is-page'); return () => document.body.classList.remove('is-page'); }, []);
  useEffect(() => { setPos(p => Math.min(p, list.length)); }, [list.length]);


  /* ---------- one line telling the customer their work is safe ---------- */
  const saveTimer = useRef(0);
  const note = useCallback((state, text) => {
    clearTimeout(saveTimer.current);
    if (state === 'off') { setSaving(null); return; }
    setSaving({ state, text: text || (state === 'err' ? 'Non enregistré' : 'Enregistré') });
    if (state !== 'busy') saveTimer.current = setTimeout(() => setSaving(null), 2200);
  }, []);

  /* Anything that talks to the server comes through here, so a lapsed session
     always ends up back at the door instead of failing quietly. */
  const guard = useCallback(async (fn, workingLabel) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    if (workingLabel) note('busy', workingLabel);
    try {
      const out = await fn();
      if (out?.content) setGift(out.content);
      note('ok');
      return out;
    } catch (err) {
      if (err instanceof SessionLost) {
        gifts.setToken(slug, '');
        setGift(null);
        setGateNote('Votre session a expiré. Entrez votre mot de passe pour continuer.');
        note('off');
        return null;
      }
      note('err');
      toast(err.message || 'Une erreur est survenue.', true);
      return null;
    } finally {
      busyRef.current = false;
    }
  }, [note, toast, slug]);

  /* ---------- boot ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!slug) {
        if (alive) { setBooting(false); setDoor({ missing: true }); setGateNote('Ce lien n’est pas valide.'); }
        return;
      }
      let d;
      try {
        d = await gifts.door(slug);
      } catch (_) {
        if (alive) {
          setBooting(false);
          setDoor({ missing: true, title: 'Cadeau introuvable' });
          setGateNote('Ce lien a expiré ou n’existe plus.');
        }
        return;
      }
      if (!alive) return;
      setDoor(d);
      setGateNote(d.sealed
        ? 'Entrez votre mot de passe pour reprendre où vous en étiez.'
        : 'Entrez le mot de passe temporaire que vous avez reçu.');

      // a session kept from earlier in the day walks straight back in
      if (gifts.getToken(slug)) {
        try {
          const r = await gifts.content(slug);
          if (alive) { setGift(r.content); setBooting(false); }
          return;
        } catch (_) { /* it lapsed — the door it is */ }
      }
      if (alive) setBooting(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  const submitGate = async e => {
    e?.preventDefault();
    if (checking) return;
    const value = gatePass.trim();
    if (!value) return;
    setChecking(true);
    setGateErr('');
    try {
      const r = await gifts.open(slug, value);
      gifts.setToken(slug, r.token);
      setGift(r.content);
      setGatePass('');
    } catch (err) {
      setGateErr(err.message || 'Mot de passe incorrect');
      setGateShake(true);
      setTimeout(() => setGateShake(false), 460);
    } finally {
      setChecking(false);
    }
  };

  /* ---------- adding ---------- */

  /* Adding starts with a question — photo, voice, written page or film —
     rather than with a tab that had to be found first. The empty print at the
     end of the pile opens it, and so does the + in the contact strip. */
  const addMemory = k => {
    if (k === 'photo') return photoInput.current?.click();
    if (k === 'video') return videoInput.current?.click();
    if (k === 'note') return setSheet({ type: 'note', item: null });
    if (k === 'voice') return setSheet({ type: 'voice', item: null });
    return setSheet({ type: 'chooser' });
  };

  const onPickPhotos = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const before = list.length;
    const r = await guard(() => gifts.addPhotos(slug, files), 'Envoi…');
    if (!r) return;
    setPos(before);
    toast(files.length > 1 ? `${files.length} photos ajoutées` : 'Photo ajoutée');
  };

  const onPickVideo = async e => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    const before = list.length;
    note('busy', 'Préparation…');
    const { poster, seconds } = await grabPoster(file);
    const r = await guard(() => gifts.addVideo(slug, file, poster, '', seconds), 'Envoi…');
    if (!r) return;
    setPos(before);
    toast('Vidéo ajoutée');
  };

  const onPickPhotoReplace = async e => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    const item = replacingRef.current;
    replacingRef.current = null;
    if (!file || !item) return;
    const at = pos;
    const r = await guard(() => gifts.replacePhoto(slug, item.id, file), 'Envoi…');
    if (!r) return;
    setPos(at);
    toast('Photo remplacée');
  };

  const onPickVideoReplace = async e => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    const item = replacingRef.current;
    replacingRef.current = null;
    if (!file || !item) return;
    const at = pos;
    note('busy', 'Préparation…');
    const { poster, seconds } = await grabPoster(file);
    const r = await guard(() => gifts.replaceVideo(slug, item.id, file, poster, seconds), 'Envoi…');
    if (!r) return;
    setPos(at);
    toast('Vidéo remplacée');
  };

  /* the pile is dropped whole onto the workshop: a photo dragged from the
     desktop is the same gesture as choosing one */
  useEffect(() => {
    if (!gift) return undefined;
    const prevent = e => e.preventDefault();
    const onDrop = async e => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const images = files.filter(f => /^image\//.test(f.type));
      const videos = files.filter(f => /^video\//.test(f.type));
      const audios = files.filter(f => /^audio\//.test(f.type));

      const before = (gift.items || []).length;
      if (images.length) {
        const r = await guard(() => gifts.addPhotos(slug, images), 'Envoi…');
        if (r) { setPos(before); toast('Photo ajoutée'); }
      } else if (videos.length) {
        note('busy', 'Préparation…');
        const { poster, seconds } = await grabPoster(videos[0]);
        const r = await guard(() => gifts.addVideo(slug, videos[0], poster, '', seconds), 'Envoi…');
        if (r) { setPos(before); toast('Vidéo ajoutée'); }
      } else if (audios.length) {
        const r = await guard(() => gifts.addVoice(slug, audios[0], '', null), 'Envoi…');
        if (r) { setPos(before); toast('Voix ajoutée'); }
      } else {
        toast('Ce type de fichier ne peut pas être ajouté.', true);
      }
    };
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', prevent);
      document.removeEventListener('drop', onDrop);
    };
  }, [gift, slug, guard, toast, note]);

  /* ---------- editing what is in hand ---------- */

  /* Every verb below reads the memory's OWN kind rather than a tab the user
     happens to be standing in — there is no tab any more. */
  const replaceCurrent = item => {
    replacingRef.current = item;
    if (item.kind === 'photo') return photoOneInput.current?.click();
    if (item.kind === 'video') return videoReplaceInput.current?.click();
    return setSheet({ type: 'voice', item });
  };

  const removeCurrent = async item => {
    const at = Math.max(0, pos - 1);
    const remove = gifts.removeOf[item.kind];
    if (!remove) return;
    const r = await guard(() => remove(slug, item.id), 'Suppression…');
    if (!r) return;
    setPos(at);
    toast('Souvenir retiré');
  };

  const renameCurrent = async (item, text) => {
    const at = pos;
    const rename = gifts.labelOf[item.kind];
    if (!rename) return null;
    const r = await guard(() => rename(slug, item.id, text), 'Enregistrement…');
    if (r) setPos(at);
    return r;
  };

  /* ---------- the order of the album ---------- */

  /* One sequence for everything, so a voice can be dragged in between two
     photographs and stay there. */
  const move = async (from, to) => {
    if (from === to) return;
    const ids = list.map(x => x.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    const r = await guard(() => gifts.reorder(slug, ids), 'Nouvel ordre…');
    if (r) { setPos(to); toast('Ordre modifié'); }
  };

  /* ---------- the door ---------- */

  if (booting) return <LoadingScreen label="Ouverture de l’atelier" />;

  /* The door is the working surface, in its one colour: no motes, no
     vignette, nothing drifting behind a password field. */
  if (!gift) {
    return (
      <div className="workshop-shell">
        <div className={`gate show${gateShake ? ' shake' : ''}`}>
          <form className={`gate-card${door?.missing ? ' missing' : ''}`} onSubmit={submitGate} autoComplete="off">
            <div className="gate-pearl" aria-hidden="true" />
            <h2>{door?.title || (door?.sealed ? 'Votre cadeau' : 'Votre cadeau vous attend')}</h2>
            <p>{gateNote}</p>
            <input
              type="password" inputMode="text" autoComplete="off" spellCheck="false"
              placeholder="• • • • • • •" aria-label="Mot de passe"
              value={gatePass} onChange={e => setGatePass(e.target.value)}
            />
            <button type="submit" disabled={checking}>{checking ? 'Ouverture…' : 'Entrer'}</button>
            <div className={`gate-err${gateErr ? ' show' : ''}`} role="alert">{gateErr}</div>
          </form>
        </div>
        {toastEl}
      </div>
    );
  }

  /* ---------- the workshop ---------- */

  const total = list.length;

  return (
    <div className="workshop-shell">
      <div className="topbar">
        <span className="wordmark">SEAORA</span>
        <span className={`saving${saving ? ' on' : ''}${saving?.state === 'err' ? ' err' : ''}`} role="status">
          {saving?.text || ''}
        </span>
      </div>

      <div className="workshop">
        {/* the pile — the same print, at the same angle, on the same paper */}
        <div className="work-stage">
          <WorkCard
            item={current}
            albumDate={when}
            addLabel={ADD_LABEL}
            addSub={ADD_SUB}
            onOpen={() => (onAddCard ? addMemory(null) : setPreview({ item: current }))}
          />
        </div>

        <div className="stack-meta">
          <button className="stack-btn" type="button" aria-label="Souvenir précédent"
            disabled={list.length < 1}
            onClick={() => setPos(p => Math.max(0, p - 1))}>‹</button>
          <span className="stack-count" aria-live="polite">
            <b>{onAddCard ? '+' : pos + 1}</b><i>/</i><span>{list.length}</span>
          </span>
          <button className="stack-btn" type="button" aria-label="Souvenir suivant"
            disabled={list.length < 1}
            onClick={() => setPos(p => Math.min(list.length, p + 1))}>›</button>
        </div>

        {/* what can be done to the memory in hand — read from its own kind */}
        <div className={`tools${current ? ' on' : ''}`}>
          {current && (
            <>
              <button className="tool" type="button" onClick={() => setPreview({ item: current })}>
                <EyeIcon /><span>Voir</span>
              </button>
              {kind === 'note' ? (
                <button className="tool" type="button" onClick={() => setSheet({ type: 'note', item: current })}>
                  <PenIcon /><span>Modifier</span>
                </button>
              ) : (
                <>
                  <button className="tool" type="button" onClick={() => replaceCurrent(current)}>
                    <SwapIcon /><span>Remplacer</span>
                  </button>
                  <button className="tool" type="button" onClick={() => setSheet({ type: 'rename', item: current })}>
                    <TagIcon /><span>{kind === 'photo' ? 'Légender' : 'Renommer'}</span>
                  </button>
                </>
              )}
              <button className="tool warn" type="button" onClick={() => setSheet({ type: 'remove', item: current })}>
                <TrashIcon /><span>Supprimer</span>
              </button>
            </>
          )}
        </div>

        {/* the words that belong to it — the viewer's own memory card */}
        <div className="journal">
          <div className="mem-card as-button">
            <div
              className="mem-open"
              role="button"
              tabIndex={0}
              aria-label="Modifier le mot qui accompagne le cadeau"
              onClick={() => setSheet({ type: 'message' })}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSheet({ type: 'message' });
                }
              }}
            >
              <h2 className="mem-title">{current ? titleOf(current) : 'Pour toi'}</h2>
              <p className="mem-date">
                {current && kind === 'note' && current.day ? current.day : when}
              </p>
              <div className="mem-scroll">
                <p className={`mem-text${gift.message ? '' : ' placeholder'}`}>
                  {gift.message || 'Touchez ici pour écrire le mot qui accompagne votre cadeau.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* everything at once, and where the order is changed */}
        <ContactStrip
          list={list}
          pos={pos}
          onSelect={setPos}
          onAdd={() => addMemory(null)}
          onMove={move}
        />

        {/* One way to add, and the way out. The four tabs are gone: they made a
            gift look like four collections, and they hid the fact that the
            order things are added in is the order they will be read in. */}
        <div className="rail">
          <button
            className="btn add-any" type="button"
            onClick={() => addMemory(null)}
          >
            <PlusIcon />
            <span>Ajouter un souvenir</span>
          </button>
          <button className="btn finish" type="button" onClick={() => setSheet({ type: 'finish' })}>
            {gift.sealed ? 'Mot de passe' : 'Terminer'}
          </button>
        </div>
      </div>

      {/* the pickers live here so the whole workshop can reach them */}
      <input type="file" accept="image/*" multiple hidden ref={photoInput} onChange={onPickPhotos} />
      <input type="file" accept="image/*" hidden ref={photoOneInput} onChange={onPickPhotoReplace} />
      <input type="file" accept="video/*" hidden ref={videoInput} onChange={onPickVideo} />
      <input type="file" accept="video/*" hidden ref={videoReplaceInput} onChange={onPickVideoReplace} />
      <input type="file" accept="audio/*" hidden ref={audioInput} />

      {preview && (
        <PreviewStory
          item={preview.item}
          albumDate={when}
          onClose={() => setPreview(null)}
        />
      )}

      <BuilderSheets
        sheet={sheet}
        close={() => setSheet(null)}
        gift={gift}
        slug={slug}
        total={total}
        guard={guard}
        toast={toast}
        note={note}
        audioInput={audioInput}
        onAdd={addMemory}
        onRename={renameCurrent}
        onRemove={removeCurrent}
        onSetPos={setPos}
        setGift={setGift}
      />

      {toastEl}
    </div>
  );
}

/* ============================================================
   One card in the workshop — the print, or the empty one at the end.

   Every list ends with the empty print. It is not a button placed under the
   pile: it IS the next card, and it looks like one. Filling it is the gesture
   of adding.
   ============================================================ */
function WorkCard({ item, albumDate, addLabel, addSub, onOpen }) {
  const kind = item?.kind;

  /* Same reasoning as the viewer's pile: the card holds a heading and a
     paragraph, which a native <button> may not contain, so it carries the
     button ROLE and answers the keyboard itself. */
  const asButton = label => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: onOpen,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
    }
  });

  if (!item) {
    return (
      <div className="pcard work-card is-add" {...asButton(addLabel)}>
        <div className="pcard-win">
          <div className="add-inner">
            <span className="add-mark" aria-hidden="true"><PlusIcon /></span>
            <span className="add-label">{addLabel}</span>
            <span className="add-sub">{addSub}</span>
          </div>
        </div>
        <div className="pcard-foot" />
      </div>
    );
  }

  if (kind === 'note') {
    return (
      <div className="pcard work-card is-note" {...asButton(`${item.title || 'Sans titre'} — ouvrir`)}>
        <div className="pcard-win">
          <div className="note-rule" aria-hidden="true" />
          <h3 className="note-title">{item.title || 'Sans titre'}</h3>
          {item.day && <p className="note-day">{item.day}</p>}
          <p className="note-body">{item.body}</p>
        </div>
        <div className="pcard-foot">
          <div className="pcard-cap" />
          <div className="pcard-date">{albumDate}</div>
        </div>
      </div>
    );
  }

  if (kind === 'voice') {
    const heights = waveHeights(item.voiceIndex ?? item.id ?? 1, 34);
    return (
      <div className="pcard work-card is-voice"
        {...asButton(`${item.label || 'Message vocal'} — écouter`)}>
        <div className="pcard-win">
          <div className="voice-mic" aria-hidden="true"><MicIcon /></div>
          <div className="voice-wave" aria-hidden="true">
            {heights.map((h, i) => <i key={i} style={{ '--h': h.toFixed(2), '--i': i }} />)}
          </div>
          <div className="voice-dur">{mmss(item.seconds)}</div>
        </div>
        <div className="pcard-foot">
          <div className="pcard-cap">{item.label || 'Message vocal'}</div>
          <div className="pcard-date">{albumDate}</div>
        </div>
      </div>
    );
  }

  const isVideo = kind === 'video';
  const src = isVideo ? item.poster : (item.thumb || item.src);
  const caption = isVideo ? (item.label || item.caption) : item.caption;

  return (
    <div className="pcard work-card" {...asButton(`${caption || 'Souvenir'} — ouvrir`)}>
      <div className="pcard-win">
        {src ? <img src={src} alt="" decoding="async" draggable={false} />
          : <div className="pcard-missing">Sans aperçu</div>}
        {isVideo && <div className="pcard-play" aria-hidden="true"><i><PlayIcon /></i></div>}
        {isVideo && item.seconds && <div className="pcard-dur">{mmss(item.seconds)}</div>}
      </div>
      <div className="pcard-foot">
        <div className={`pcard-cap${caption ? '' : ' placeholder'}`}>{caption || 'Sans légende'}</div>
        <div className="pcard-date">{albumDate}</div>
      </div>
    </div>
  );
}

/* ============================================================
   The contact strip — the WHOLE album at once, in its real order, and where
   that order is changed. Dragging a vignette onto another moves the memory
   there, across kinds: a voice can be dropped between two photographs.

   Each vignette says what it is, because they are no longer all the same
   thing: a photograph shows itself, a film its poster with a play badge, a
   voice a microphone, a written page a quotation mark.
   ============================================================ */
function ContactStrip({ list, pos, onSelect, onAdd, onMove }) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dropAt, setDropAt] = useState(null);

  return (
    <div className="strip">
      <div className="strip-rail">
        {list.map((item, i) => {
          const k = item.kind;
          const src = k === 'video' ? item.poster : (k === 'photo' ? (item.thumb || item.src) : null);
          return (
            <button
              key={item.id}
              type="button"
              className={[
                'thumb',
                i === pos ? 'current' : '',
                k === 'note' ? 'is-note' : '',
                k === 'voice' ? 'is-voice' : '',
                dragFrom === i ? 'dragging' : '',
                dropAt === i ? 'drop-before' : ''
              ].filter(Boolean).join(' ')}
              draggable
              title="Glissez pour déplacer"
              aria-label={`${i + 1}. ${titleOf(item)}`}
              onClick={() => onSelect(i)}
              onDragStart={() => setDragFrom(i)}
              onDragOver={e => { e.preventDefault(); setDropAt(i); }}
              onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
              onDrop={e => {
                e.preventDefault();
                if (dragFrom != null && dragFrom !== i) onMove(dragFrom, i);
                setDragFrom(null);
                setDropAt(null);
              }}
            >
              {k === 'note' ? <span>“</span>
                : k === 'voice' ? <MicIcon />
                  : src ? <img src={src} alt="" draggable={false} loading="lazy" decoding="async" /> : null}
              {k === 'video' && <span className="badge"><PlayIcon /></span>}
            </button>
          );
        })}
        <button type="button" className="thumb add" onClick={onAdd} aria-label={ADD_LABEL}>
          <PlusIcon />
        </button>
      </div>
      {list.length > 1 && <p className="strip-hint">Glissez une vignette pour changer l’ordre</p>}
    </div>
  );
}

/* ============================================================
   The preview — one memory, seen exactly as the gift will show it.
   ============================================================ */
function PreviewStory({ item, albumDate, onClose }) {
  const kind = item.kind;
  const audioRef = useRef(null);
  const fillRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(item.seconds || 0);
  const heights = useMemo(() => waveHeights(item.voiceIndex ?? 1, 36), [item.voiceIndex]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (kind !== 'voice') return undefined;
    const audio = new Audio(item.src);
    audioRef.current = audio;
    let raf = 0;

    const onMeta = () => setDuration(audio.duration);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => setPlaying(false));
    audio.play().catch(() => setPlaying(false));

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = audio.duration ? audio.currentTime / audio.duration : 0;
      fillRef.current?.style.setProperty('--p', `${(p * 100).toFixed(2)}%`);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      audio.removeEventListener('loadedmetadata', onMeta);
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (_) { /* gone */ }
      audioRef.current = null;
    };
  }, [item, kind]);

  return (
    <div
      className={`story show${kind === 'voice' ? ' voice' : ''}${playing ? ' playing' : ''}`}
      role="dialog" aria-modal="true" aria-label="Aperçu du souvenir"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="story-glow" aria-hidden="true" />
      <button className="story-x" type="button" aria-label="Fermer" onClick={onClose}>×</button>

      <div className="story-body">
        <div className="story-card">
          {kind === 'note' ? (
            <div className="story-note">
              <h3>{item.title || 'Sans titre'}</h3>
              <p className="d">{item.day || albumDate}</p>
              <p>{item.body}</p>
            </div>
          ) : kind === 'voice' ? (
            <div className="story-voice">
              <div className="sv-mic" aria-hidden="true"><MicIcon /></div>
              <div className="sv-wave">
                <span className="sv-lay" aria-hidden="true">
                  {heights.map((h, i) => <i key={i} style={{ '--h': h.toFixed(2), '--i': i }} />)}
                </span>
                <span className="sv-lay on" ref={fillRef} aria-hidden="true">
                  {heights.map((h, i) => <i key={i} style={{ '--h': h.toFixed(2), '--i': i }} />)}
                </span>
              </div>
              <button className="sv-play" type="button" aria-label={playing ? 'Pause' : 'Lecture'}
                onClick={() => {
                  const a = audioRef.current;
                  if (!a) return;
                  if (a.paused) a.play().catch(() => {}); else a.pause();
                }}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <div className="sv-dur">{mmss(duration)}</div>
            </div>
          ) : kind === 'video' ? (
            <video className="story-video" src={item.src} poster={item.poster || undefined}
              playsInline controls autoPlay preload="metadata" />
          ) : (
            <img className="story-img" src={item.src || item.thumb} alt={item.caption || ''} />
          )}
        </div>

        <div className="story-foot in">
          <div className="story-words">
            <p className="story-cap">
              {kind === 'note' ? '' : (item.caption || item.label || '')}
            </p>
            <p className="story-date">{kind === 'note' ? '' : albumDate}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Every sheet the workshop can open.
   ============================================================ */
function BuilderSheets({
  sheet, close, gift, slug, total, guard, toast, note,
  audioInput, onAdd, onRename, onRemove, onSetPos, setGift
}) {
  const [value, setValue] = useState('');
  const [noteForm, setNoteForm] = useState({ title: '', day: '', body: '' });
  const [message, setMessage] = useState('');
  const [pw, setPw] = useState({ a: '', b: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sealed, setSealed] = useState(null);

  const recorderRef = useRef(null);
  const previewUrlRef = useRef('');
  const [recState, setRecState] = useState({ recording: false, time: '0:00', label: 'Prêt' });
  const [made, setMade] = useState(null);

  useEffect(() => {
    setError('');
    setBusy(false);
    if (!sheet) return;
    if (sheet.type === 'rename') {
      setValue(sheet.item.kind === 'photo'
        ? (sheet.item.caption || '')
        : (sheet.item.label || sheet.item.caption || ''));
    }
    if (sheet.type === 'note') {
      setNoteForm(sheet.item
        ? { title: sheet.item.title || '', day: sheet.item.day || '', body: sheet.item.body || '' }
        : { title: '', day: '', body: '' });
    }
    if (sheet.type === 'message') setMessage(gift.message || '');
    if (sheet.type === 'finish') setPw({ a: '', b: '' });
    if (sheet.type === 'voice') {
      setMade(null);
      setRecState({ recording: false, time: '0:00', label: 'Prêt' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  /* walking away must not leave the microphone light on */
  useEffect(() => () => {
    recorderRef.current?.cancel();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  if (!sheet && !sealed) return null;

  /* ---------- what shall it be? ----------
     The first question when something is added, and the only one. It replaces
     the four tabs: the customer says what they want to put in, and it lands
     at the end of the album — wherever they are in it. */
  if (sheet?.type === 'chooser') {
    return (
      <Sheet
        open
        title="Ajouter un souvenir"
        note="Il se placera à la fin, dans l’ordre où vous le déposez."
        onDismiss={close}
        actions={[{ label: 'Annuler', kind: 'ghost', value: 'no', onClick: close }]}
      >
        <div className="picker">
          {KINDS.map(k => (
            <button
              key={k.id}
              type="button"
              className="picker-choice"
              onClick={() => { close(); onAdd(k.id); }}
            >
              <span className="picker-mark" aria-hidden="true"><k.Icon /></span>
              <span className="picker-text">
                <b>{k.label}</b>
                <i>{k.sub}</i>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  /* ---------- the words on a card ---------- */
  if (sheet?.type === 'rename') {
    const isPhoto = sheet.item.kind === 'photo';
    return (
      <Sheet
        open title={isPhoto ? 'La légende' : 'Le titre'}
        note={isPhoto ? 'Quelques mots écrits à la main sous la photo.' : 'Le nom que portera ce souvenir.'}
        error={error} busy={busy} onDismiss={close}
        actions={[
          {
            label: 'Enregistrer', value: 'save',
            onClick: async () => {
              setBusy(true);
              const ok = await onRename(sheet.item, value);
              setBusy(false);
              if (ok) close();
            }
          },
          { label: 'Annuler', kind: 'ghost', value: 'no', onClick: close }
        ]}
      >
        <label className="f">
          <span className="f-label">{isPhoto ? 'Légende' : 'Titre'}</span>
          <input type="text" maxLength={isPhoto ? 140 : 60} value={value}
            placeholder={isPhoto ? 'Notre premier été' : 'Pour toi'}
            onChange={e => setValue(e.target.value)} />
          <span className="f-help">Laissez vide pour n’en mettre aucune.</span>
        </label>
      </Sheet>
    );
  }

  /* ---------- a written memory ---------- */
  if (sheet?.type === 'note') {
    const isNew = !sheet.item;
    return (
      <Sheet
        open title={isNew ? 'Un souvenir' : 'Ce souvenir'}
        note="Un titre, le moment, et ce que vous voulez en dire."
        error={error} busy={busy} onDismiss={close}
        actions={[
          {
            label: isNew ? 'Ajouter au cadeau' : 'Enregistrer', value: 'save',
            onClick: async () => {
              if (!noteForm.title.trim() && !noteForm.body.trim()) {
                setError('Écrivez au moins un titre ou quelques mots.');
                return;
              }
              setBusy(true);
              const before = (gift.items || []).length;
              const r = await guard(
                () => (isNew ? gifts.addNote(slug, noteForm) : gifts.editNote(slug, sheet.item.id, noteForm)),
                'Enregistrement…'
              );
              setBusy(false);
              if (!r) return;
              if (isNew) onSetPos(before);
              toast(isNew ? 'Souvenir ajouté' : 'Souvenir modifié');
              close();
            }
          },
          { label: 'Annuler', kind: 'ghost', value: 'no', onClick: close }
        ]}
      >
        <label className="f">
          <span className="f-label">Titre</span>
          <input type="text" maxLength={80} value={noteForm.title}
            placeholder="Le jour où tout a commencé"
            onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))} />
        </label>
        <label className="f">
          <span className="f-label">Quand</span>
          <input type="text" maxLength={60} value={noteForm.day} placeholder="Été 2019"
            onChange={e => setNoteForm(f => ({ ...f, day: e.target.value }))} />
          <span className="f-help">Écrivez-le comme vous le diriez.</span>
        </label>
        <label className="f">
          <span className="f-label">Le souvenir</span>
          <textarea maxLength={1200} value={noteForm.body} placeholder="Je me souviens…"
            onChange={e => setNoteForm(f => ({ ...f, body: e.target.value }))} />
        </label>
      </Sheet>
    );
  }

  /* ---------- a voice ---------- */
  if (sheet?.type === 'voice') {
    const isReplace = !!sheet.item;
    const showPreview = (blob, seconds) => {
      setMade({ blob, seconds });
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      setRecState(s => ({ ...s, time: mmss(seconds), label: 'Écoutez, puis ajoutez-le' }));
    };

    return (
      <Sheet
        open title={isReplace ? 'Réenregistrer' : 'Votre voix'}
        note={canRecord() && secureEnough()
          ? 'Appuyez sur la perle, parlez, appuyez à nouveau.'
          : 'L’enregistrement n’est pas disponible ici — importez un fichier audio.'}
        error={error} busy={busy} onDismiss={close}
        actions={[
          {
            label: isReplace ? 'Remplacer' : 'Ajouter au cadeau', value: 'save',
            onClick: async () => {
              let payload = made;
              if (recorderRef.current?.recording) {
                const out = await recorderRef.current.stop();
                if (out) payload = { blob: out.blob, seconds: out.seconds };
              }
              if (!payload) { setError('Enregistrez ou importez d’abord un message.'); return; }

              setBusy(true);
              const before = (gift.items || []).length;
              const r = await guard(() => (isReplace
                ? gifts.replaceVoice(slug, sheet.item.id, payload.blob, payload.seconds)
                : gifts.addVoice(slug, payload.blob, value, payload.seconds)), 'Envoi…');
              setBusy(false);
              if (!r) return;
              if (!isReplace) onSetPos(before);
              toast(isReplace ? 'Message remplacé' : 'Voix ajoutée');
              close();
            }
          },
          { label: 'Annuler', kind: 'ghost', value: 'no', onClick: close }
        ]}
      >
        <div className={`rec${recState.recording ? ' on' : ''}`}>
          <button
            type="button" className="rec-orb" aria-label={recState.recording ? 'Arrêter' : 'Enregistrer'}
            onClick={async () => {
              const rec = recorderRef.current;
              if (rec?.recording) {
                const out = await rec.stop();
                setRecState(s => ({ ...s, recording: false }));
                if (out) showPreview(out.blob, out.seconds);
                else setRecState(s => ({ ...s, label: 'Rien n’a été enregistré' }));
                return;
              }
              const next = new VoiceRecorder({
                onTick: s => setRecState(st => ({ ...st, time: mmss(s) }))
              });
              recorderRef.current = next;
              try {
                await next.start();
                setMade(null);
                setRecState({ recording: true, time: '0:00', label: 'Parlez… appuyez pour arrêter' });
              } catch (err) {
                setError(err.message);
                recorderRef.current = null;
              }
            }}
          >
            <MicIcon />
          </button>
          <div className="rec-time">{recState.time}</div>
          <div className="rec-state">{recState.label}</div>
          <div className="rec-preview">
            {made && <audio controls preload="metadata" src={previewUrlRef.current} />}
          </div>
        </div>

        <div className="rec-or">ou</div>
        <div className="sheet-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={() => {
            const picker = audioInput.current;
            if (!picker) return;
            picker.onchange = () => {
              const f = (picker.files || [])[0];
              picker.value = '';
              picker.onchange = null;
              if (!f) return;
              showPreview(f, null);
              setRecState(s => ({ ...s, label: f.name }));
            };
            picker.click();
          }}>Importer un fichier audio</button>
        </div>

        {!isReplace && (
          <label className="f" style={{ marginTop: 18 }}>
            <span className="f-label">Titre</span>
            <input type="text" maxLength={60} value={value} placeholder="Pour toi, ce matin"
              onChange={e => setValue(e.target.value)} />
          </label>
        )}
      </Sheet>
    );
  }

  /* ---------- the letter ---------- */
  if (sheet?.type === 'message') {
    return (
      <Sheet
        open title="Le mot"
        note="Ces quelques lignes s’afficheront sous chaque souvenir, dans le cadeau."
        error={error} busy={busy} onDismiss={close}
        actions={[
          {
            label: 'Enregistrer', value: 'save',
            onClick: async () => {
              setBusy(true);
              const r = await guard(() => gifts.setMessage(slug, message), 'Enregistrement…');
              setBusy(false);
              if (r) { toast('Mot enregistré'); close(); }
            }
          },
          { label: 'Annuler', kind: 'ghost', value: 'no', onClick: close }
        ]}
      >
        <label className="f">
          <span className="f-label">Votre mot</span>
          <textarea maxLength={600} value={message}
            placeholder="Je voulais garder tout ça quelque part…"
            onChange={e => setMessage(e.target.value)} />
          <span className="f-help">600 caractères au plus. Les retours à la ligne sont conservés.</span>
        </label>
      </Sheet>
    );
  }

  /* ---------- throwing one away ---------- */
  if (sheet?.type === 'remove') {
    const what = KIND[sheet.item?.kind]?.one || 'souvenir';
    return (
      <ConfirmSheet
        open
        title="Retirer ce souvenir ?"
        note={`Ce ${what} ne fera plus partie du cadeau. C’est sans retour.`}
        onCancel={close}
        onConfirm={async () => { await onRemove(sheet.item); close(); }}
      />
    );
  }

  /* ---------- sealing ---------- */
  if (sheet?.type === 'finish') {
    const already = gift.sealed;
    if (!total) {
      toast('Ajoutez au moins un souvenir avant de terminer.', true);
      close();
      return null;
    }
    return (
      <Sheet
        open
        title={already ? 'Changer le mot de passe' : 'Terminer mon cadeau'}
        note={already
          ? 'Choisissez un nouveau mot de passe pour votre cadeau.'
          : `${total} souvenir${total > 1 ? 's' : ''} ${total > 1 ? 'sont prêts' : 'est prêt'}. Choisissez maintenant le mot de passe de votre cadeau.`}
        error={error} busy={busy} dismissible={!busy} onDismiss={close}
        actions={[
          {
            label: already ? 'Enregistrer' : 'Sceller le cadeau', value: 'save',
            onClick: async () => {
              if (pw.a.trim().length < 4) { setError('Au moins 4 caractères.'); return; }
              if (pw.a !== pw.b) { setError('Les deux mots de passe ne sont pas identiques.'); return; }
              setBusy(true);
              note('busy', 'Scellage…');
              try {
                const out = await gifts.finish(slug, pw.a.trim(), pw.b.trim());
                // the old session died with the old password; the server issued a new one
                gifts.setToken(slug, out.token);
                setGift(out.content);
                note('ok');
                close();
                setSealed(out);
              } catch (err) {
                setError(err.message);
                note('err');
              } finally {
                setBusy(false);
              }
            }
          },
          { label: 'Pas encore', kind: 'ghost', value: 'no', onClick: close }
        ]}
      >
        <label className="f">
          <span className="f-label">Votre mot de passe</span>
          <input type="password" autoComplete="new-password" placeholder="••••••••"
            value={pw.a} onChange={e => setPw(p => ({ ...p, a: e.target.value }))} />
        </label>
        <label className="f">
          <span className="f-label">Confirmez</span>
          <input type="password" autoComplete="new-password" placeholder="••••••••"
            value={pw.b} onChange={e => setPw(p => ({ ...p, b: e.target.value }))} />
          <span className="f-help">
            Ce mot de passe sera nécessaire pour accéder à votre cadeau et le modifier à l’avenir.
            {already ? '' : ' Le mot de passe temporaire cessera de fonctionner.'}
          </span>
        </label>
      </Sheet>
    );
  }

  /* ---------- and it is done ---------- */
  if (sealed) {
    return (
      <Sheet
        open
        title="Votre cadeau est scellé"
        note="Il ne s’ouvrira qu’avec la référence de l’objet et votre mot de passe."
        onDismiss={() => setSealed(null)}
        actions={[
          {
            label: 'Voir le cadeau', value: 'open',
            onClick: () => { window.open(sealed.viewerUrl, '_blank', 'noopener'); setSealed(null); }
          },
          { label: 'Continuer à modifier', kind: 'ghost', value: 'stay', onClick: () => setSealed(null) }
        ]}
      >
        <div className="done">
          <div className="done-pearl" aria-hidden="true" />
          <div className="done-qr">
            <img src={`${sealed.qr}?size=600`} alt="QR code du cadeau" />
          </div>
          <div className="done-link">
            <span>{sealed.viewerUrl}</span>
            <button type="button" onClick={async e => {
              try {
                await navigator.clipboard.writeText(sealed.viewerUrl);
                e.target.textContent = 'Copié';
              } catch (_) { e.target.textContent = 'Échec'; }
            }}>Copier</button>
          </div>
        </div>
      </Sheet>
    );
  }

  return null;
}
