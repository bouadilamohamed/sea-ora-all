/* ============================================================
   The workshop's line to the server.
   Every write answers with the whole gift, so the builder never has to guess
   what changed: it redraws from one truth.
   ============================================================ */
import { request, upload, filenameFor } from './client';

const KEY = slug => `seaora.gift.${slug}`;

export const getToken = slug => sessionStorage.getItem(KEY(slug)) || '';
export function setToken(slug, token) {
  if (token) sessionStorage.setItem(KEY(slug), token);
  else sessionStorage.removeItem(KEY(slug));
}

const auth = slug => {
  const token = getToken(slug);
  return token ? { 'x-gift-token': token } : {};
};

const base = slug => `/api/gifts/${slug}`;
const send = (slug, path, options = {}) =>
  request(`${base(slug)}${path}`, { ...options, headers: { ...auth(slug), ...options.headers } });
const post = (slug, path, formData, onProgress) =>
  upload(`${base(slug)}${path}`, formData, { headers: auth(slug), onProgress });

/* ---------- the door ---------- */
export const door = slug => request(base(slug));
export const open = (slug, password) =>
  request(`${base(slug)}/session`, { method: 'POST', json: { password } });
export const content = slug => send(slug, '/content');

/* ---------- photographs ---------- */
export function addPhotos(slug, files, onProgress) {
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('images', f));
  return post(slug, '/photos', fd, onProgress);
}
export function replacePhoto(slug, id, file, onProgress) {
  const fd = new FormData();
  fd.append('images', file);
  return post(slug, `/photos/${id}/replace`, fd, onProgress);
}
export const captionPhoto = (slug, id, caption) =>
  send(slug, `/photos/${id}`, { method: 'PATCH', json: { caption } });
export const removePhoto = (slug, id) => send(slug, `/photos/${id}`, { method: 'DELETE' });

/* ---------- voices ---------- */
export function addVoice(slug, blob, label, seconds, onProgress) {
  const fd = new FormData();
  fd.append('audio', blob, filenameFor(blob, 'voix'));
  if (label) fd.append('label', label);
  if (seconds) fd.append('seconds', String(seconds));
  return post(slug, '/voices', fd, onProgress);
}
export function replaceVoice(slug, id, blob, seconds, onProgress) {
  const fd = new FormData();
  fd.append('audio', blob, filenameFor(blob, 'voix'));
  if (seconds) fd.append('seconds', String(seconds));
  return post(slug, `/voices/${id}/replace`, fd, onProgress);
}
export const labelVoice = (slug, id, label) =>
  send(slug, `/voices/${id}`, { method: 'PATCH', json: { label } });
export const removeVoice = (slug, id) => send(slug, `/voices/${id}`, { method: 'DELETE' });

/* ---------- films ---------- */
export function addVideo(slug, file, poster, label, seconds, onProgress) {
  const fd = new FormData();
  fd.append('video', file, filenameFor(file, 'video'));
  if (poster) fd.append('poster', poster, 'poster.jpg');
  if (label) fd.append('label', label);
  if (seconds) fd.append('seconds', String(seconds));
  return post(slug, '/videos', fd, onProgress);
}
export function replaceVideo(slug, id, file, poster, seconds, onProgress) {
  const fd = new FormData();
  fd.append('video', file, filenameFor(file, 'video'));
  if (poster) fd.append('poster', poster, 'poster.jpg');
  if (seconds) fd.append('seconds', String(seconds));
  return post(slug, `/videos/${id}/replace`, fd, onProgress);
}
export const labelVideo = (slug, id, label) =>
  send(slug, `/videos/${id}`, { method: 'PATCH', json: { label } });
export const removeVideo = (slug, id) => send(slug, `/videos/${id}`, { method: 'DELETE' });

/* ---------- written memories ---------- */
export const addNote = (slug, note) => send(slug, '/notes', { method: 'POST', json: note });
export const editNote = (slug, id, note) => send(slug, `/notes/${id}`, { method: 'PATCH', json: note });
export const removeNote = (slug, id) => send(slug, `/notes/${id}`, { method: 'DELETE' });

/* ---------- order, prose, sealing ---------- */

/* One order for the whole album: photographs, films, voices and written pages
   share a single sequence, so `ids` is the complete list and there is no kind
   to send with it. */
export const reorder = (slug, ids) => send(slug, '/order', { method: 'POST', json: { ids } });

/* Per-kind helpers, chosen from a memory's own `kind`. The workshop holds one
   list of mixed memories, so every verb has to be able to look up its route. */
export const removeOf = { photo: removePhoto, video: removeVideo, voice: removeVoice, note: removeNote };
export const labelOf = { photo: captionPhoto, video: labelVideo, voice: labelVoice };
export const setMessage = (slug, message) =>
  send(slug, '/message', { method: 'PATCH', json: { message } });
export const finish = (slug, password, confirm) =>
  send(slug, '/finish', { method: 'POST', json: { password, confirm } });
