'use strict';
/* ============================================================
   Environment
   One place that reads process.env, so nothing below has to guess what a
   missing variable means. The root .env is the single source; a server/.env
   may override it for a one-off local run.
   ============================================================ */
const path = require('path');
const dotenv = require('dotenv');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
dotenv.config({ path: path.join(SERVER_ROOT, '.env'), override: true });

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v, fallback = '') => String(v ?? '').trim() || fallback;

const uploadDir = str(process.env.UPLOAD_DIR, './uploads');

const env = {
  nodeEnv: str(process.env.NODE_ENV, 'development'),
  isProduction: str(process.env.NODE_ENV) === 'production',

  port: num(process.env.PORT, 5000),
  trustProxy: num(process.env.TRUST_PROXY, 0),

  /* Absolute origin of this server, when it is known. QR codes encode it, so
     an unset value in production means every printed code is a dead link —
     server.js says so loudly at boot. */
  publicUrl: str(process.env.PUBLIC_URL).replace(/\/+$/, ''),
  clientUrl: str(process.env.CLIENT_URL, 'http://localhost:5173').replace(/\/+$/, ''),

  /* The demo pearl's passcode. Lives here and only here: the browser never
     receives it, it is compared server-side like every other code. */
  passcode: str(process.env.PASSCODE, 'perle'),
  adminKey: str(process.env.ADMIN_KEY),

  /* The pepper the reference's unique index is derived under — see
     utils/crypto.referenceKey. It is set once and never changed: a new value
     makes every reference already in the database unmatchable, and duplicate
     detection quietly stops working on those rows. */
  referencePepper: str(process.env.REFERENCE_PEPPER, 'seaora-reference'),

  storageDriver: str(process.env.STORAGE_DRIVER, 'database'),
  uploadDir: path.isAbsolute(uploadDir) ? uploadDir : path.resolve(PROJECT_ROOT, uploadDir),

  limits: {
    images: num(process.env.MAX_IMAGES, 24),
    imageMb: num(process.env.MAX_IMAGE_MB, 12),
    audios: num(process.env.MAX_AUDIOS, 8),
    audioMb: num(process.env.MAX_AUDIO_MB, 20),
    videos: num(process.env.MAX_VIDEOS, 6),
    videoMb: num(process.env.MAX_VIDEO_MB, 120),
    notes: num(process.env.MAX_NOTES, 24)
  },

  /* How long a session lives. A build can be picked up again the same day;
     a viewer's read token is short, because it is minted on every unlock. */
  builderSessionMs: 12 * 3600e3,
  viewSessionMs: 6 * 3600e3,

  /* Anti-brute-force on the gate: 12 tries per IP per pearl per quarter hour. */
  unlock: { windowMs: 15 * 60e3, maxTries: 12 },

  paths: { projectRoot: PROJECT_ROOT, serverRoot: SERVER_ROOT },

  /// The slug of the pearl the gate falls back to when the app is opened
  /// without one (the seeded demo). Mirrors the old "no slug ⇒ demo" branch.
  demoSlug: str(process.env.DEMO_SLUG, 'demo')
};

module.exports = env;
