import { useCallback, useEffect, useRef, useState } from 'react';
import * as admin from '../api/admin';
import { useToast } from '../hooks/useToast';

/* ============================================================
   Administration.

   One screen, one job: an order comes in, an empty gift goes out. The
   administrator types the reference engraved on the object and a temporary
   password, and receives a QR code to hand to the customer.

   The key is held in memory for the life of the tab and sent as a header. It
   is never written to storage, and the temporary password is shown exactly
   once — the database only keeps its hash.
   ============================================================ */
export default function AdminPage() {
  const { show: toast, element: toastEl } = useToast();

  const [configured, setConfigured] = useState(null);
  const [key, setKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [lockErr, setLockErr] = useState('');
  const [checking, setChecking] = useState(false);

  const [form, setForm] = useState({ reference: '', tempPassword: '' });
  const [formErr, setFormErr] = useState('');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const [gifts, setGifts] = useState([]);

  const keyRef = useRef('');

  useEffect(() => {
    document.body.classList.add('is-page');
    document.title = 'SEAORA — Administration';
    return () => document.body.classList.remove('is-page');
  }, []);

  useEffect(() => {
    admin.status()
      .then(s => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  const loadGifts = useCallback(async () => {
    try {
      const r = await admin.listGifts(keyRef.current);
      setGifts(r.gifts || []);
    } catch (_) { /* the list is a convenience, not the job */ }
  }, []);

  const unlock = async e => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    setLockErr('');
    try {
      await admin.openSession(key.trim());
      keyRef.current = key.trim();
      setUnlocked(true);
      setKey('');
      loadGifts();
    } catch (err) {
      setLockErr(err.message || 'Clé administrateur incorrecte.');
    } finally {
      setChecking(false);
    }
  };

  const generate = async e => {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    setFormErr('');
    try {
      const gift = await admin.createGift(keyRef.current, form);
      // the temporary password is echoed here and nowhere else, ever again
      setResult({ ...gift, tempPassword: form.tempPassword });
      setForm({ reference: '', tempPassword: '' });
      loadGifts();
    } catch (err) {
      setFormErr(err.message || 'La génération a échoué.');
    } finally {
      setWorking(false);
    }
  };

  const suggest = () => {
    const words = ['lune', 'nacre', 'perle', 'marée', 'corail', 'sirène', 'écume', 'rivage'];
    const word = words[Math.floor(Math.random() * words.length)];
    setForm(f => ({ ...f, tempPassword: `${word}-${1000 + Math.floor(Math.random() * 9000)}` }));
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copié`);
    } catch (_) {
      toast('La copie a échoué.', true);
    }
  };

  return (
    <main className="console">

      <header className="masthead">
        <div className="brand">
          <span className="brand-pearl" aria-hidden="true" />
          <span className="brand-name">SEAORA</span>
        </div>
        <p className="brand-sub">Administration</p>
      </header>

      {configured === false && (
        <section className="card lock">
          <h1 className="card-title">Console fermée</h1>
          <p className="card-note">
            L’administration n’est pas configurée. Renseignez <code>ADMIN_KEY</code> dans
            le fichier <code>.env</code> à la racine du projet, puis redémarrez le serveur.
          </p>
        </section>
      )}

      {configured && !unlocked && (
        <section className="card lock">
          <h1 className="card-title">Console fermée</h1>
          <p className="card-note">Entrez la clé administrateur pour continuer.</p>
          <form onSubmit={unlock} autoComplete="off">
            <label className="field">
              <span className="label">Clé administrateur</span>
              <input type="password" autoComplete="off" spellCheck="false" placeholder="••••••••••••"
                value={key} onChange={e => setKey(e.target.value)} />
            </label>
            <button className="btn" type="submit" disabled={checking}>
              {checking ? 'Vérification…' : 'Ouvrir la console'}
            </button>
            {lockErr && <p className="err" role="alert">{lockErr}</p>}
          </form>
        </section>
      )}

      {unlocked && !result && (
        <section className="card">
          <h1 className="card-title">Nouvelle commande</h1>
          <p className="card-note">Deux champs, puis le QR code à envoyer au client.</p>

          <form onSubmit={generate} autoComplete="off">
            <label className="field">
              <span className="label">Référence</span>
              <input
                type="text" autoComplete="off" spellCheck="false" autoCapitalize="characters"
                placeholder="SEA-4821" required
                value={form.reference}
                onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              />
              <span className="help">
                Celle gravée sur l’objet. Elle sera demandée au destinataire, avec le code.
              </span>
            </label>

            <label className="field">
              <span className="label">Mot de passe temporaire</span>
              <span className="with-action">
                <input
                  type="text" autoComplete="off" spellCheck="false"
                  placeholder="lune-8412" required
                  value={form.tempPassword}
                  onChange={e => setForm(f => ({ ...f, tempPassword: e.target.value }))}
                />
                <button type="button" className="mini" onClick={suggest}>Suggérer</button>
              </span>
              <span className="help">
                À communiquer au client. Il ne servira qu’une fois, pour ouvrir son atelier.
              </span>
            </label>

            <button className="btn" type="submit" disabled={working}>
              {working ? 'Génération…' : 'Générer le cadeau'}
            </button>
            {formErr && <p className="err" role="alert">{formErr}</p>}
          </form>
        </section>
      )}

      {result && (
        <section className="card result">
          <h2 className="card-title">Cadeau généré</h2>
          <p className="card-note">Envoyez ce QR code au client.</p>

          <div className="qr-frame">
            <img src={`${result.qr}?size=600`} alt="QR code de l’atelier" width="260" height="260" />
          </div>

          <dl className="facts">
            <div><dt>Référence</dt><dd>{result.reference}</dd></div>
            <div><dt>Identifiant</dt><dd className="mono">{result.slug}</dd></div>
            <div><dt>Mot de passe temporaire</dt><dd className="mono">{result.tempPassword}</dd></div>
          </dl>

          <div className="link-row">
            <span className="mono link">{result.builderUrl}</span>
            <button className="mini" type="button"
              onClick={() => copy(result.builderUrl, 'Lien')}>Copier</button>
          </div>

          <div className="actions">
            <a className="btn ghost" href={`${result.qr}?size=1200`} download>Télécharger le QR (PNG)</a>
            <a className="btn ghost" href={result.qrSvg} download>SVG pour l’impression</a>
            <button className="btn ghost" type="button" onClick={() => setResult(null)}>
              Nouvelle commande
            </button>
          </div>

          <p className="warn">
            Ce mot de passe temporaire n’est plus affiché après cette page. Notez-le avant de fermer.
          </p>
        </section>
      )}

      {unlocked && !!gifts.length && (
        <section className="card list">
          <h2 className="card-title">Derniers cadeaux</h2>
          <div className="gift-list">
            {gifts.map(gift => (
              <article className="gift" key={gift.slug}>
                <div className="gift-head">
                  <span className="mono">{gift.slug}</span>
                  <span className={`pill ${gift.status === 'SEALED' ? 'sealed' : 'draft'}`}>
                    {gift.status === 'SEALED' ? 'scellé' : 'en préparation'}
                  </span>
                </div>
                <p className="gift-counts">
                  {gift.counts.images} photo{gift.counts.images > 1 ? 's' : ''} ·{' '}
                  {gift.counts.videos} vidéo{gift.counts.videos > 1 ? 's' : ''} ·{' '}
                  {gift.counts.audios} voix ·{' '}
                  {gift.counts.notes} écrit{gift.counts.notes > 1 ? 's' : ''}
                </p>
                <div className="gift-links">
                  <a href={gift.builderUrl} target="_blank" rel="noopener noreferrer">Atelier</a>
                  <a href={gift.viewerUrl} target="_blank" rel="noopener noreferrer">Cadeau</a>
                  <a href={`${gift.qr}?size=1200`} download>QR</a>
                </div>
                <time className="gift-date">
                  {new Date(gift.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </time>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="foot">SEAORA — Keep love within reach</footer>
      {toastEl}
    </main>
  );
}
