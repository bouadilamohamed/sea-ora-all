/* ============================================================
   The administration console's line to the server.
   The key is held in memory for the life of the tab and sent as a header —
   it is never written to storage.
   ============================================================ */
import { request } from './client';

const key = k => ({ 'x-admin-key': k });

/** Can the console open at all? Asked before any form is shown. */
export const status = () => request('/api/admin/status');

export const openSession = adminKey =>
  request('/api/admin/session', { method: 'POST', json: { key: adminKey } });

export const createGift = (adminKey, { reference, tempPassword }) =>
  request('/api/admin/gifts', { method: 'POST', headers: key(adminKey), json: { reference, tempPassword } });

export const listGifts = adminKey =>
  request('/api/admin/gifts', { headers: key(adminKey) });

export const giftQrPng = (slug, size = 600) => `/api/admin/gifts/${slug}/qr.png?size=${size}`;
export const giftQrSvg = slug => `/api/admin/gifts/${slug}/qr.svg`;
