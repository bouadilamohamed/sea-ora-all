import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { upload } from '../api/client';
import { useToast } from '../hooks/useToast';
import { VoiceRecorder, canRecord, secureEnough } from '../services/capture';
import { mmss } from '../utils/format';
import { MicIcon, TrashIcon } from '../components/ui/icons';

/* ============================================================
   The creation panel.

   The direct route: images, voices, a secret code, a word — and a sealed
   pearl at the end, with its QR code, its link and the management key to keep.

   The pearls created here are remembered in this browser's localStorage so
   they can be found again. Only the slug and the link are kept; the code
   never touches storage.
   ============================================================ */

const STORE_KEY = 'seaora.pearls';
const MAX_IMAGES = 24;
const MAX_AUDIOS = 8;

export default function PanelPage() {
  const { show: toast, element: toastEl } = useToast();

  const [images, setImages] = useState([]);      // {file, url}
  const [voices, setVoices] = useState([]);      // {blob, url, label, seconds}
  const [password, setPassword] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [mine, setMine] = useState([]);

  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState('0:00');
  const recorderRef = useRef(null);
  const imageInput = useRef(null);
  const audioInput = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    document.body.classList.add('is-page');
    document.title = 'SEAORA — Créer votre perle';
    return () => document.body.classList.remove('is-page');
  }, []);

  useEffect(() => {
    try { setMine(JSON.parse(localStorage.getItem(STORE_KEY) || '[]')); } catch (_) { setMine([]); }
  }, []);

  /* Object URLs are a real allocation: released when a preview goes away, and
     when the page does. */
  useEffect(() => () => {
    images.forEach(i => URL.revokeObjectURL(i.url));
    voices.forEach(v => URL.revokeObjectURL(v.url));
    recorderRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addImages = useCallback(files => {
    const wanted = Array.from(files).filter(f => /^image\//.test(f.type));
    if (!wanted.length) return;
    setImages(prev => {
      const room = MAX_IMAGES - prev.length;
      if (room <= 0) { toast(`${MAX_IMAGES} images au maximum.`, true); return prev; }
      const taken = wanted.slice(0, room);
      if (taken.length < wanted.length) toast(`${MAX_IMAGES} images au maximum.`, true);
      return [...prev, ...taken.map(file => ({ file, url: URL.createObjectURL(file) }))];
    });
  }, [toast]);

  const addAudios = useCallback(files => {
    const wanted = Array.from(files).filter(f => /^audio\//.test(f.type) || f.type === 'video/webm');
    if (!wanted.length) return;
    setVoices(prev => {
      const room = MAX_AUDIOS - prev.length;
      if (room <= 0) { toast(`${MAX_AUDIOS} voix au maximum.`, true); return prev; }
      return [
        ...prev,
        ...wanted.slice(0, room).map(file => ({
          blob: file, url: URL.createObjectURL(file), label: file.name.replace(/\.[^.]+$/, ''), seconds: null
        }))
      ];
    });
  }, [toast]);

  /* drag and drop over the whole drop zone */
  useEffect(() => {
    const zone = dropRef.current;
    if (!zone) return undefined;
    const over = e => { e.preventDefault(); zone.classList.add('over'); };
    const leave = () => zone.classList.remove('over');
    const drop = e => {
      e.preventDefault();
      zone.classList.remove('over');
      addImages(e.dataTransfer?.files || []);
    };
    zone.addEventListener('dragover', over);
    zone.addEventListener('dragleave', leave);
    zone.addEventListener('drop', drop);
    return () => {
      zone.removeEventListener('dragover', over);
      zone.removeEventListener('dragleave', leave);
      zone.removeEventListener('drop', drop);
    };
  }, [addImages]);

  const toggleRecording = async () => {
    const rec = recorderRef.current;
    if (rec?.recording) {
      const out = await rec.stop();
      recorderRef.current = null;
      setRecording(false);
      if (!out) { toast('Rien n’a été enregistré.', true); return; }
      setVoices(prev => prev.length >= MAX_AUDIOS ? prev : [...prev, {
        blob: out.blob,
        url: URL.createObjectURL(out.blob),
        label: `Voix ${prev.length + 1}`,
        seconds: out.seconds
      }]);
      return;
    }
    const next = new VoiceRecorder({ onTick: s => setRecTime(mmss(s)) });
    recorderRef.current = next;
    try {
      await next.start();
      setRecording(true);
      setRecTime('0:00');
    } catch (err) {
      recorderRef.current = null;
      toast(err.message, true);
    }
  };

  const suggest = () => {
    const words = ['perle', 'nacre', 'marée', 'écume', 'corail', 'rivage'];
    setPassword(`${words[Math.floor(Math.random() * words.length)]}${100 + Math.floor(Math.random() * 900)}`);
  };

  const seal = async e => {
    e.preventDefault();
    setError('');
    if (!images.length) { setError('Ajoutez au moins une image.'); return; }
    if (password.trim().length < 3) { setError('Le code doit faire au moins 3 caractères.'); return; }

    const fd = new FormData();
    images.forEach(i => fd.append('images', i.file));
    voices.forEach(v => {
      fd.append('audio', v.blob, `voix.${(v.blob.type.split('/')[1] || 'webm').split(';')[0]}`);
      fd.append('audioLabels', v.label || '');
      fd.append('audioSeconds', v.seconds ? String(v.seconds) : '');
    });
    fd.append('password', password.trim());
    if (reference.trim()) fd.append('reference', reference.trim());
    fd.append('message', message);

    setProgress(0);
    try {
      const out = await upload('/api/pearls', fd, { onProgress: p => setProgress(p) });
      setProgress(null);
      const record = {
        slug: out.slug,
        url: out.url,
        manageKey: out.manageKey,
        reference: out.reference || '',
        createdAt: Date.now()
      };
      const next = [record, ...mine.filter(m => m.slug !== record.slug)].slice(0, 20);
      setMine(next);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch (_) { /* private mode */ }
      setResult({ ...out, password: password.trim() });
    } catch (err) {
      setProgress(null);
      setError(err.message || 'La création a échoué.');
    }
  };

  const reset = () => {
    images.forEach(i => URL.revokeObjectURL(i.url));
    voices.forEach(v => URL.revokeObjectURL(v.url));
    setImages([]); setVoices([]); setPassword(''); setReference(''); setMessage('');
    setResult(null); setError('');
  };

  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copié`); }
    catch (_) { toast('La copie a échoué.', true); }
  };

  const canSeal = images.length > 0 && password.trim().length >= 3 && progress === null;
  const recordable = useMemo(() => canRecord() && secureEnough(), []);

  /* ---------- the result ---------- */
  if (result) {
    return (
      <main className="console panel">
        <header className="masthead">
          <div className="brand">
            <span className="brand-pearl" aria-hidden="true" />
            <span className="brand-name">SEAORA</span>
          </div>
          <p className="brand-sub">Keep love within reach</p>
        </header>

        <section className="card result">
          <h2 className="card-title">Votre perle est scellée</h2>
          <p className="card-note">
            Partagez le QR code ou le lien. Le code secret reste connu de vous seul.
          </p>

          <div className="qr-frame">
            <img src={`/api/pearls/${result.slug}/qr.png?size=600`} alt="QR code de votre perle"
              width="260" height="260" />
          </div>

          <div className="link-row">
            <span className="mono link">{result.url}</span>
            <button className="mini" type="button" onClick={() => copy(result.url, 'Lien')}>Copier</button>
          </div>
          {result.reference && (
            <div className="link-row">
              <span className="mono link">Référence : {result.reference}</span>
              <button className="mini" type="button"
                onClick={() => copy(result.reference, 'Référence')}>Copier</button>
            </div>
          )}
          <div className="link-row">
            <span className="mono link">Code secret : {result.password}</span>
            <button className="mini" type="button"
              onClick={() => copy(result.password, 'Code')}>Copier</button>
          </div>
          <div className="link-row">
            <span className="mono link">Clé de gestion : {result.manageKey}</span>
            <button className="mini" type="button"
              onClick={() => copy(result.manageKey, 'Clé')}>Copier</button>
          </div>

          <div className="actions">
            <a className="btn" href={result.url} target="_blank" rel="noopener noreferrer">Ouvrir la perle</a>
            <a className="btn ghost" href={`/api/pearls/${result.slug}/qr.png?size=1200`} download>
              Télécharger le QR
            </a>
            <a className="btn ghost" href={`/api/pearls/${result.slug}/qr.svg`} download>
              Version SVG
            </a>
            <button className="btn ghost" type="button" onClick={reset}>Créer une autre perle</button>
          </div>

          <p className="warn">
            Conservez la clé de gestion : c’est elle, et elle seule, qui permet de modifier ou de
            supprimer cette perle plus tard.
          </p>
        </section>

        {toastEl}
      </main>
    );
  }

  /* ---------- the studio ---------- */
  return (
    <main className="console panel">
      <header className="masthead">
        <div className="brand">
          <span className="brand-pearl" aria-hidden="true" />
          <span className="brand-name">SEAORA</span>
        </div>
        <p className="brand-sub">Keep love within reach</p>
      </header>

      <div className="lede">
        <h1>Scellez un souvenir<br /><em>dans la perle</em></h1>
        <p>
          Vos photos et votre voix, cachées dans un coquillage. Un code secret pour l’ouvrir,
          un QR code pour l’offrir.
        </p>
      </div>

      <form className="card" onSubmit={seal} autoComplete="off">
        {/* 01 — the memories */}
        <fieldset className="step">
          <legend><i>01</i> Les souvenirs</legend>

          {/* a real button: everything inside it is phrasing content */}
          <button type="button" className="drop" ref={dropRef}
            onClick={() => imageInput.current?.click()}>
            <span className="drop-inner">
              <b>Déposez vos images</b>
              <span>ou touchez pour parcourir · JPG, PNG, WebP, HEIC</span>
            </span>
          </button>
          <input type="file" accept="image/*" multiple hidden ref={imageInput}
            onChange={e => { addImages(e.target.files); e.target.value = ''; }} />

          {!!images.length && (
            <ul className="thumbs">
              {images.map((img, i) => (
                <li key={img.url}>
                  <img src={img.url} alt={`image ${i + 1}`} />
                  <button type="button" aria-label={`Retirer l’image ${i + 1}`}
                    onClick={() => setImages(prev => {
                      URL.revokeObjectURL(prev[i].url);
                      return prev.filter((_, k) => k !== i);
                    })}>
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="count">
            {images.length ? `${images.length} image${images.length > 1 ? 's' : ''}` : 'Aucune image'}
            {' · '}<span>{MAX_IMAGES} maximum</span>
          </p>
        </fieldset>

        {/* 02 — the voices */}
        <fieldset className="step">
          <legend><i>02</i> Les voix</legend>
          <p className="help">
            La première démarre au moment où les souvenirs apparaissent ; les suivantes s’enchaînent.
          </p>

          <div className="voice-row">
            <button type="button" className={`rec-btn${recording ? ' on' : ''}`}
              onClick={toggleRecording} disabled={!recordable && !recording}>
              <span className="rec-dot" />
              <span>{recording ? 'Arrêter' : 'Enregistrer'}</span>
            </button>
            <span className="rec-time">{recTime}</span>
            <span className="or">ou</span>
            <button type="button" className="btn ghost small"
              onClick={() => audioInput.current?.click()}>Importer des fichiers</button>
            <input type="file" accept="audio/*" multiple hidden ref={audioInput}
              onChange={e => { addAudios(e.target.files); e.target.value = ''; }} />
          </div>

          {!recordable && (
            <p className="help warn-inline">
              Le micro exige une connexion sécurisée (https) — importez un fichier audio à la place.
            </p>
          )}

          {!!voices.length && (
            <ul className="voice-list">
              {voices.map((v, i) => (
                <li key={v.url}>
                  <span className="voice-ic" aria-hidden="true"><MicIcon /></span>
                  <input
                    type="text" maxLength={60} value={v.label} aria-label={`Titre de la voix ${i + 1}`}
                    onChange={e => setVoices(prev =>
                      prev.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <audio controls preload="metadata" src={v.url} />
                  <button type="button" aria-label={`Retirer la voix ${i + 1}`}
                    onClick={() => setVoices(prev => {
                      URL.revokeObjectURL(prev[i].url);
                      return prev.filter((_, k) => k !== i);
                    })}>
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {/* 03 — the secret */}
        <fieldset className="step">
          <legend><i>03</i> Le code secret</legend>
          <div className="grid2">
            <label className="field">
              <span className="label">Code d’ouverture</span>
              <span className="with-action">
                <input type="text" maxLength={64} placeholder="perle" required
                  value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" className="mini" onClick={suggest}
                  aria-label="Suggérer un code">Suggérer</button>
              </span>
            </label>
            <label className="field">
              <span className="label">Référence <i>(optionnel — second secret)</i></span>
              <input type="text" maxLength={64} placeholder="SEA-4821"
                autoCapitalize="characters" autoComplete="off" spellCheck="false"
                value={reference} onChange={e => setReference(e.target.value)} />
            </label>
          </div>
          <p className="help">
            Si vous remplissez la référence, elle sera demandée <b>en plus</b> du code pour ouvrir
            le coquillage. Majuscules et espaces sans importance.
          </p>
        </fieldset>

        {/* 04 — the word */}
        <fieldset className="step">
          <legend><i>04</i> Le mot</legend>
          <p className="help">
            Il s’affichera juste au-dessus des souvenirs, une fois le coquillage ouvert.
          </p>
          <label className="field">
            <textarea maxLength={600} rows={4} value={message}
              placeholder={'Pour toi,\nquelques instants que je garde…'}
              onChange={e => setMessage(e.target.value)} />
            <span className="help">{message.length} / 600</span>
          </label>
        </fieldset>

        <div className="actions">
          <button className="btn" type="submit" disabled={!canSeal}>Sceller la perle</button>
        </div>
        {error && <p className="err" role="alert">{error}</p>}

        {progress !== null && (
          <div className="progress">
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <span>Envoi des souvenirs… {Math.round(progress * 100)}%</span>
          </div>
        )}
      </form>

      {!!mine.length && (
        <section className="card list">
          <h2 className="card-title">Vos perles</h2>
          <div className="gift-list">
            {mine.map(p => (
              <article className="gift" key={p.slug}>
                <div className="gift-head">
                  <span className="mono">{p.slug}</span>
                  {p.reference && <span className="pill sealed">{p.reference}</span>}
                </div>
                <div className="gift-links">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">Ouvrir</a>
                  <a href={`/api/pearls/${p.slug}/qr.png?size=1200`} download>QR</a>
                </div>
                <time className="gift-date">
                  {new Date(p.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </time>
              </article>
            ))}
          </div>
          <p className="warn">
            Cette liste vit dans ce navigateur seulement. Les images sont ré-encodées et leurs
            données EXIF supprimées.
          </p>
        </section>
      )}

      <footer className="foot">SEAORA · La Perle</footer>
      {toastEl}
    </main>
  );
}
