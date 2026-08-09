/* ============================================================
   The one line to the server.

   Nothing in the application calls fetch directly: every request goes through
   here, so a lapsed session, a rate limit or a dead connection is reported in
   one voice and handled in one place.
   ============================================================ */

/* Empty in development and in the normal deployment, where Vite proxies /api
   and Express serves the built client from the same origin. Set VITE_API_URL
   only when the two halves genuinely live on different hosts. */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message || 'Une erreur est survenue.');
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload || {};
  }
}

/** The session behind this request has gone: the caller must ask again. */
export class SessionLost extends ApiError {
  constructor(message, payload) {
    super(message || 'Session expirée.', 401, payload);
    this.name = 'SessionLost';
  }
}

const url = path => `${BASE}${path}`;

export async function request(path, options = {}) {
  const { method = 'GET', json, body, headers = {}, signal } = options;

  const init = { method, headers: { ...headers }, signal };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (body !== undefined) {
    init.body = body;                       // FormData sets its own boundary
  }

  let response;
  try {
    response = await fetch(url(path), init);
  } catch (_) {
    throw new ApiError('Connexion impossible — réessayez.', 0);
  }

  /* A QR image or an SVG is not JSON; anything that is not asked for as JSON
     is handed back raw. */
  if (options.raw) {
    if (!response.ok) throw new ApiError('Ressource indisponible.', response.status);
    return response;
  }

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) throw new SessionLost(payload.error, payload);
  if (!response.ok) throw new ApiError(payload.error, response.status, payload);

  return payload;
}

/* Uploads use XHR rather than fetch: a photograph from a phone is several
   megabytes and the card showing it has to be able to say how far along it
   is — which fetch still cannot report. */
export function upload(path, formData, { headers = {}, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url(path));
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);

    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      });
    }

    xhr.addEventListener('load', () => {
      let payload = {};
      try { payload = JSON.parse(xhr.responseText || '{}'); } catch (_) { /* not JSON */ }
      if (xhr.status === 401) return reject(new SessionLost(payload.error, payload));
      if (xhr.status >= 200 && xhr.status < 300) return resolve(payload);
      reject(new ApiError(payload.error || "L'envoi a échoué.", xhr.status, payload));
    });
    xhr.addEventListener('error', () => reject(new ApiError('Connexion perdue pendant l’envoi.', 0)));
    xhr.addEventListener('abort', () => reject(new ApiError('Envoi interrompu.', 0)));

    xhr.send(formData);
  });
}

/* MediaRecorder hands back a nameless Blob; multer wants something to store. */
export function filenameFor(blob, stem) {
  const type = (blob && blob.type) || '';
  const ext = (type.split('/')[1] || 'webm').split(';')[0].replace(/[^a-z0-9]/gi, '') || 'webm';
  return `${stem}.${ext}`;
}
