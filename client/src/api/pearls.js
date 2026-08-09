/* ============================================================
   The viewer's line to the server.

   `gate` fetches the door's wording — no media comes back, whatever the pearl
   holds. `unlock` is the only call that releases it, and only if the passcode
   is right; the passcode is verified server-side and never lives in this
   bundle.
   ============================================================ */
import { request } from './client';

/** The door: title, invitation, hint, and whether a reference is required. */
export const gate = slug =>
  request(`/api/auth/gate${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`);

/**
 * Try a passcode. On success the answer carries the whole album plus a
 * short-lived read token for /api/memories.
 */
export const unlock = ({ slug, passcode, reference }) =>
  request('/api/auth/passcode', {
    method: 'POST',
    json: { slug: slug || undefined, passcode, reference: reference || undefined }
  });

/** The memories of an already-unlocked pearl, as the flat Memory shape. */
export const memories = (token, type) =>
  request(`/api/memories${type ? `?type=${type}` : ''}`, { headers: { 'x-view-token': token } });

/* ---------- creating a pearl in one shot (the panel) ---------- */

export const create = (formData, onProgress) =>
  import('./client').then(({ upload }) => upload('/api/pearls', formData, { onProgress }));

/* ---------- managing one afterwards ---------- */

export const manage = (slug, key) =>
  request(`/api/pearls/${slug}/manage`, { headers: { 'x-manage-key': key } });

export const patch = (slug, key, body) =>
  request(`/api/pearls/${slug}`, { method: 'PATCH', headers: { 'x-manage-key': key }, json: body });

export const destroy = (slug, key) =>
  request(`/api/pearls/${slug}`, { method: 'DELETE', headers: { 'x-manage-key': key } });

export const qrPng = (slug, size = 720) => `/api/pearls/${slug}/qr.png?size=${size}`;
export const qrSvg = slug => `/api/pearls/${slug}/qr.svg`;
