'use strict';
/* ============================================================
   QR codes.
   Error correction is always H: the code has to survive a logo laid over it,
   a crumpled print or an engraving.
   ============================================================ */
const QRCode = require('qrcode');

const HEX = /^#?[0-9a-f]{6}$/i;
const normalizeColor = (v, fallback) =>
  HEX.test(String(v || '')) ? `#${String(v).replace('#', '')}` : fallback;

const clampSize = v => {
  const n = Number.parseInt(v, 10);
  return Math.min(1400, Math.max(180, Number.isFinite(n) ? n : 720));
};

function png(target, { size, dark, light } = {}) {
  return QRCode.toBuffer(target, {
    type: 'png',
    width: clampSize(size),
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: normalizeColor(dark, '#062033'),
      light: light === 'transparent' ? '#0000' : normalizeColor(light, '#ffffff')
    }
  });
}

function svg(target) {
  return QRCode.toString(target, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#062033', light: '#ffffff' }
  });
}

module.exports = { png, svg };
