import * as THREE from 'three';

/* ============================================================
   The coquillage, as geometry.

   One parametric surface describes a valve; the top one is the same surface
   mirrored, with its winding flipped so its front faces still point into the
   shell. The mantle is built ON that surface, offset upward, which is what
   keeps it inside the bowl however the valve is tuned.
   ============================================================ */

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* shell parameters, shared so the coral hugs the same surface */
const A = 1.36;
const RIBC = 14;
const RIBF = RIBC * Math.PI / A;
const BOWL = 0.4;
const RIBA = 0.03;
const EDGE = 0.05;
const BASE = 0.05;

function surf(u, v) {
  const theta = -A + 2 * A * u;
  const r = BASE + (1 - BASE) * v;
  const wave = Math.cos(RIBF * theta);
  const rEff = r * (1 + EDGE * smoothstep(0.15, 1, v) * wave);
  const x = rEff * Math.sin(theta);
  const z = rEff * Math.cos(theta);
  const ybowl = -BOWL * Math.sin(Math.PI * v) * Math.cos(0.5 * Math.PI * theta / A);
  const yrib = RIBA * Math.sin(Math.PI * (0.08 + 0.86 * v)) * wave;
  return [x, ybowl + yrib, z];
}

/* The valve is a smooth doubly-curved patch with a ribbed edge; the ribs are
   what need resolution, and they run along u. So u stays comparatively high
   while v — across the bowl, where the surface is nearly flat — comes down
   hard. 200×84 was 17,000 vertices for a shape that reads identically at half
   that. */
export function makeValveGeometry(NU = 160, NV = 64) {
  const row = NU + 1;
  const pos = [];
  const uvs = [];
  const idx = [];

  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const p = surf(u, v);
      pos.push(p[0], p[1], p[2]);
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Mirror a valve across y AND flip winding, so front faces still face in. */
export function mirrorValveY(src) {
  const g = src.clone();
  g.scale(1, -1, 1);
  const a = g.getIndex().array;
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  g.getIndex().needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/* The coral mantle: a thin glossy lining over the bowl floor with a soft,
   gently scalloped collar that cradles the pearl. Built directly on the shell
   surface (offset upward) so it always sits inside the bowl and never pokes
   past the rim. */
export function makeMantleGeometry(NU = 140, NV = 44) {
  const uMin = 0.14, uMax = 0.86, vMin = 0.16, vMax = 0.92;
  const row = NU + 1;
  const seatU = 0.5, seatV = 0.56;      // where the pearl rests
  const seatRU = 0.22, seatRV = 0.20;   // collar radius in (u,v) space
  const bedH = 0.014, ringH = 0.135, ringW = 0.62, lipH = 0.05, scFreq = 9;

  const deep = new THREE.Color(0x9f4438);
  const tip = new THREE.Color(0xf6b1a0);
  const tmp = new THREE.Color();
  const pos = [], idx = [], col = [];

  for (let j = 0; j <= NV; j++) {
    const v = vMin + (vMax - vMin) * (j / NV);
    const ev = j / NV;
    for (let i = 0; i <= NU; i++) {
      const u = uMin + (uMax - uMin) * (i / NU);
      const eu = i / NU;
      const b = surf(u, v);
      // taper to zero thickness at the patch border so it blends into the shell
      const edge = Math.pow(Math.sin(Math.PI * eu) * Math.sin(Math.PI * ev), 0.6);
      // raised collar ring around the pearl seat
      const dd = Math.hypot((u - seatU) / seatRU, (v - seatV) / seatRV);
      const ring = ringH * Math.exp(-Math.pow((dd - 1.0) / ringW, 2));
      // gently scalloped front lip
      const lip = lipH * (0.5 + 0.5 * Math.sin(scFreq * Math.PI * eu)) * smoothstep(0.6, 1, ev);
      const th = (bedH + ring + lip) * Math.max(edge, 0.18);

      pos.push(b[0], b[1] + th + 0.004, b[2]);

      let br = 0.18 + (ring / ringH) * 0.55 + ev * 0.14 + 0.05 * Math.sin(scFreq * Math.PI * eu);
      br = Math.min(1, Math.max(0, br));
      tmp.copy(deep).lerp(tip, br);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const p = j * row + i;
      const q = p + 1;
      const r = p + row;
      const s = r + 1;
      idx.push(p, r, q, q, r, s);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ============================================================
   Procedural nacre micro-detail (growth lines + fine grain), baked to a
   normal map.

   This used to be the single most expensive thing the page did before its
   first frame. The height function calls Math.sin about ten times, and it was
   evaluated FOUR times per texel — once for each neighbour of the central
   difference. At 512² that is roughly ten million sine calls on the main
   thread, and on a weak phone it alone accounted for most of an eighteen-
   second boot.

   The field is now evaluated ONCE per texel into a scratch array, and the
   differences are read back out of it. Same texture, a quarter of the work,
   and the array is thrown away as soon as the bytes are packed.
   ============================================================ */
export function makeNacreNormal(size) {
  const hash = n => { const x = Math.sin(n) * 43758.5453; return x - Math.floor(x); };

  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi + yi * 57);
    const b = hash(xi + 1 + yi * 57);
    const c = hash(xi + (yi + 1) * 57);
    const d = hash(xi + 1 + (yi + 1) * 57);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  const H = (x, y) => {
    let h = 0.45 * Math.sin(y * 0.16);      // concentric growth lines (radial v)
    h += 0.22 * Math.sin(x * 0.55);         // fine radial ribs (angular u)
    h += 0.55 * vnoise(x * 0.06, y * 0.06); // broad waviness
    h += 0.18 * vnoise(x * 0.3, y * 0.3);   // grain
    return h;
  };

  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) field[row + x] = H(x, y);
  }

  /* The map repeats, so the differences wrap rather than clamp — a seam in a
     normal map reads as a crease around the whole shell. */
  const m = size - 1;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    const up = ((y - 1) & m) * size;
    const down = ((y + 1) & m) * size;
    for (let x = 0; x < size; x++) {
      const dx = field[row + ((x + 1) & m)] - field[row + ((x - 1) & m)];
      const dy = field[down + x] - field[up + x];
      let nx = -dx, ny = -dy, nz = 1.0;
      const L = Math.hypot(nx, ny, nz);
      nx /= L; ny /= L; nz /= L;
      const i = (row + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/* A studio environment, cheaply.

   RoomEnvironment is a little scene of emissive boxes that has to be rendered
   and then convolved before the first frame. It is worth its cost on a
   desktop, where it gives the nacre its broken highlights. On a phone the same
   creamy falloff can be had from a small equirectangular gradient — warm
   above, cool below, one soft key — which PMREM convolves in a fraction of
   the time because there is no scene to draw. */
export function makeStudioEnv() {
  const w = 64, h = 32;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#fff6e8');     // warm ceiling
  sky.addColorStop(0.45, '#cfe6f2');
  sky.addColorStop(0.72, '#4a6a7c');
  sky.addColorStop(1, '#101c26');     // cool floor
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // one soft key light, where the directional key sits in the scene
  const key = g.createRadialGradient(w * 0.72, h * 0.24, 0, w * 0.72, h * 0.24, w * 0.3);
  key.addColorStop(0, 'rgba(255,255,255,.95)');
  key.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = key;
  g.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeHaloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(231,246,255,.95)');
  g.addColorStop(0.35, 'rgba(200,232,255,.45)');
  g.addColorStop(1, 'rgba(200,232,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* The grounding shadow, painted.

   The shell must sit ON something — without a pool of dark underneath it
   floats, and the whole illusion goes. But a realtime shadow costs a second
   pass over every triangle each frame, and at this distance the difference
   between it and a soft painted blob is almost nothing.

   Spread thin over a wide plane a soft gradient simply disappears into dark
   water, so the core is held dark and opaque out to a third of the radius. */
export function makeShadowBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,.62)');
  g.addColorStop(0.30, 'rgba(0,0,0,.50)');
  g.addColorStop(0.58, 'rgba(0,0,0,.22)');
  g.addColorStop(0.82, 'rgba(0,0,0,.06)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
