/* ============================================================
   Recording a voice, and pulling a still out of a film.

   Browsers disagree about what MediaRecorder may produce: Safari records
   MP4/AAC, Chrome and Firefox record WebM/Opus. Rather than force a container
   nobody agrees on, the recorder asks for the first one the browser admits to
   supporting and stores whatever comes out — every browser can play back what
   it was able to record.

   The microphone needs a secure origin. On http:// anywhere other than
   localhost the request simply never resolves, so that case is named
   explicitly instead of appearing as a mysterious failure.
   ============================================================ */

const AUDIO_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg'
];

export const secureEnough = () =>
  window.isSecureContext || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

export const canRecord = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

function pickType() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  return AUDIO_TYPES.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

export class VoiceRecorder {
  constructor({ onTick, maxMs } = {}) {
    this.onTick = onTick || (() => {});
    this.maxMs = maxMs || 5 * 60e3;      // five minutes, as the panel has always allowed
    this.stream = null;
    this.rec = null;
    this.chunks = [];
    this.t0 = 0;
    this.timer = 0;
    this.recording = false;
  }

  async start() {
    if (this.recording) return;
    if (!secureEnough()) {
      throw new Error('Le micro exige une connexion sécurisée (https). Vous pouvez importer un fichier audio à la place.');
    }
    if (!canRecord()) {
      throw new Error('Ce navigateur ne sait pas enregistrer. Vous pouvez importer un fichier audio à la place.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (e) {
      throw new Error(e?.name === 'NotAllowedError'
        ? 'Le micro a été refusé. Autorisez-le, ou importez un fichier audio.'
        : 'Aucun micro disponible. Vous pouvez importer un fichier audio à la place.');
    }

    const mimeType = pickType();
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.rec.addEventListener('dataavailable', e => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    });
    this.rec.start();
    this.recording = true;
    this.t0 = performance.now();
    this.timer = setInterval(() => {
      const ms = performance.now() - this.t0;
      this.onTick(ms / 1000);
      if (ms >= this.maxMs) this.stop();
    }, 100);
  }

  /** @returns {Promise<{blob: Blob, seconds: number} | null>} */
  stop() {
    if (!this.recording || !this.rec) return Promise.resolve(null);
    this.recording = false;
    clearInterval(this.timer);
    const seconds = (performance.now() - this.t0) / 1000;

    return new Promise(resolve => {
      this.rec.addEventListener('stop', () => {
        const type = this.rec?.mimeType || this.chunks[0]?.type || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this.release();
        resolve(blob.size ? { blob, seconds } : null);
      }, { once: true });
      try { this.rec.stop(); } catch (_) { this.release(); resolve(null); }
    });
  }

  /** Walk away mid-recording — the microphone light must not stay on. */
  cancel() {
    clearInterval(this.timer);
    this.recording = false;
    if (this.rec && this.rec.state !== 'inactive') {
      try { this.rec.stop(); } catch (_) { /* already stopped */ }
    }
    this.release();
  }

  release() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.rec = null;
  }
}

/* ============================================================
   A still from a film.

   Without ffmpeg the server cannot open a video, so the frame is taken HERE,
   where the file already is. It is only ever shown small, which is why a
   modest JPEG is plenty — and it is what keeps a video card from ever being
   an empty black rectangle.
   ============================================================ */
export function grabPoster(file, { at = 0.12 } = {}) {
  return new Promise(resolve => {
    let url = '';
    const video = document.createElement('video');

    const give = out => {
      if (url) URL.revokeObjectURL(url);
      video.removeAttribute('src');
      try { video.load(); } catch (_) { /* already gone */ }
      resolve(out);
    };
    const fail = () => give({ poster: null, seconds: null });

    try { url = URL.createObjectURL(file); } catch (_) { return fail(); }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    // a codec the browser cannot decode must not hang the upload
    const bail = setTimeout(fail, 9000);
    video.addEventListener('error', () => { clearTimeout(bail); fail(); }, { once: true });

    video.addEventListener('loadeddata', () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      // a little way in: frame zero is often black
      const seekTo = duration ? Math.min(duration * at, Math.max(0, duration - 0.1)) : 0;

      const draw = () => {
        clearTimeout(bail);
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return fail();
          const scale = Math.min(1, 1280 / Math.max(w, h));
          const c = document.createElement('canvas');
          c.width = Math.round(w * scale);
          c.height = Math.round(h * scale);
          c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
          c.toBlob(blob => give({ poster: blob, seconds: duration }), 'image/jpeg', 0.82);
        } catch (_) { fail(); }
        return undefined;
      };

      if (seekTo > 0) {
        video.addEventListener('seeked', draw, { once: true });
        try { video.currentTime = seekTo; } catch (_) { draw(); }
      } else {
        draw();
      }
    }, { once: true });

    return undefined;
  });
}
