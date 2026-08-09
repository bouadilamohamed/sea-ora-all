import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  makeValveGeometry, mirrorValveY, makeMantleGeometry,
  makeNacreNormal, makeStudioEnv, makeHaloTexture, makeShadowBlobTexture
} from './shellGeometry';

/* ============================================================
   The scene.

   Framed as a factory rather than a component: three.js owns a canvas, a
   render loop and a pile of GPU resources, none of which belong in a React
   render. The component mounts this, hands it a canvas, and talks to it
   through the small API at the bottom — reveal(), closeReveal(), renderOn(),
   renderOff(), pearlScreenPos(), dispose().
   ============================================================ */

/* The push-in, from the first move to the pearl filling the screen.

   This was ten and a half seconds once, then four, then two. Three is the
   length that still reads as cinematic — the shell opens, the pearl rises,
   the light gathers — without the visitor wondering whether the page has
   stopped responding. The curve is smootherstep, so it has no start jolt and
   no braking at the end; a shorter move on that curve does not feel abrupt,
   it feels decisive. */
const REVEAL_MS = 3000;

/* The shell drifts as it turns, so squaring the camera up before the push-in
   runs on almost every reveal and is added to its length. At a full second it
   made a three-second zoom feel like four; two thirds still reads as a
   deliberate settling rather than a cut. */
const RECENTER_SECONDS = 0.65;

/* ---- WebGL diagnostics ----
   What the device can actually do, so a failure can say WHY instead of just
   "try a recent browser". The probe contexts are released right away: phones
   allow only a handful of live WebGL contexts. */
export function glProbe() {
  const ctx = type => {
    try { return document.createElement('canvas').getContext(type); } catch (_) { return null; }
  };
  const g2 = ctx('webgl2');
  const g1 = ctx('webgl') || ctx('experimental-webgl');
  const gl = g2 || g1;
  let gpu = '';
  if (gl) {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch (_) { /* blocked by the browser's fingerprinting defence */ }
  }
  [g1, g2].forEach(c => {
    try { c?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) { /* fine */ }
  });
  return { webgl2: !!g2, webgl1: !!g1, gpu };
}

/* A canvas whose getContext already failed stays poisoned, so each attempt
   gets a fresh node. We degrade the request instead of giving up: no MSAA,
   then the default GPU, then explicitly accepting a software renderer — a
   slow shell still beats an error screen. */
function createRenderer(host, tier) {
  const attempts = [
    { antialias: tier > 0, powerPreference: 'high-performance' },
    { antialias: false, powerPreference: 'default' },
    { antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false, precision: 'mediump', stencil: false }
  ];
  let last;
  for (const opts of attempts) {
    const canvas = document.createElement('canvas');
    canvas.className = 'scene-canvas';
    host.replaceChildren(canvas);
    try {
      return new THREE.WebGLRenderer({ canvas, alpha: true, ...opts });
    } catch (err) {
      last = err;
      console.warn('WebGL attempt failed', opts, err);
    }
  }
  throw last || new Error('WebGL indisponible');
}

/**
 * @param {HTMLElement} host      the element the canvas is mounted into
 * @param {object} profile        {tier, matTier, isMobile} from usePerformanceTier
 * @param {object} handlers       {onReady, onContextLost, onShellTap}
 */
export function createShellScene(host, profile, handlers = {}) {
  const { tier, matTier, isMobile } = profile;
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* Geometry is tiered separately from the atmosphere, for the same reason the
     material already is.

     `tier` also names the CSS classes the water keys off (perf-mid, perf-low),
     so lowering it to buy triangles would quietly change how the caustics and
     the rays look. It must not. But a current Android flagship reports eight
     cores and eight gigabytes and therefore earns tier 2 — 61,000 triangles,
     a 160×64 valve mirrored, and a 256² nacre map generated on the main thread
     before the first frame — for a shell that is 380 points wide.

     Capping the MESH at tier 1 on any touch device drops that to about 37,000
     triangles and a 128² map. Held at arm's length the silhouette is identical;
     what goes is vertex work the phone was spending on curvature finer than
     its own pixels. The water above it is untouched. */
  const geoTier = isMobile ? Math.min(tier, 1) : tier;

  const renderer = createRenderer(host, tier);
  const canvas = renderer.domElement;

  /* The single most expensive thing this scene did before its first frame.
     three.js validates every program it links by reading getProgramInfoLog,
     getShaderInfoLog and LINK_STATUS — and each of those is a synchronous
     query that BLOCKS the main thread until the driver has finished compiling
     and linking. Modern drivers compile in parallel in the background and only
     stall if someone asks; this asks, five times, for the five programs this
     scene uses, and a MeshPhysicalMaterial with clearcoat, sheen and a normal
     map is a very large shader.

     Measured on a 4×-throttled phone profile: a single 4.0-second task at
     boot, 1.87s of it inside that one validation function. Turning the check
     off lets all five link in parallel and costs nothing at runtime — the
     shaders here are fixed and known-good. It stays ON in development, where a
     silent shader failure is exactly what you need to be told about. */
  renderer.debug.checkShaderErrors = !!import.meta.env.DEV;

  // a lost context freezes the render loop silently — say so instead
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    handlers.onContextLost?.();
  });

  /* Resolution.

     A phone reporting devicePixelRatio 3 was being rendered at 2 — on a 393pt
     screen that is 786×1704, 1.34 million fragments, every one of them run
     through a clearcoat-and-sheen shader. Halving the ratio quarters that
     work, and on a screen held at arm's length the difference is a slight
     softening of the shell's edge, not a loss of the pearl. So we start
     conservative and stay there. */
  const PR_CAP = isMobile ? (tier === 0 ? 1.0 : 1.25) : 1.5;
  const PR_MIN = isMobile ? 0.65 : 0.75;
  let pixelRatio = Math.min(window.devicePixelRatio, PR_CAP);

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  /* Shadows. A realtime shadow costs a whole extra pass over the geometry
     every frame, plus the depth compare in the lighting. The shell is grounded
     by a soft dark pool underneath it, and at this camera distance a pre-baked
     blob is almost indistinguishable — so only a desktop pays for the real
     thing, and 1024 is more than this scene's one casting light can use. */
  const REALTIME_SHADOWS = !isMobile && tier === 2;
  renderer.shadowMap.enabled = REALTIME_SHADOWS;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  /* Environment (reflections) — procedural, no external HDR. Both sources are
     disposed the moment the cubemap exists: PMREM keeps its own copy, and
     leaving the source alive holds a render target for the whole session. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  let envTex;
  if (tier === 2 && !isMobile) {
    const roomEnv = new RoomEnvironment();
    envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose?.();
  } else {
    const studio = makeStudioEnv();
    envTex = pmrem.fromEquirectangular(studio).texture;
    studio.dispose();
  }
  scene.environment = envTex;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(33, innerWidth / innerHeight, 0.1, 100);
  // slightly closer home position on touch devices → the shell reads bigger
  if (isMobile) camera.position.set(0, 1.62, 4.28);
  else camera.position.set(0, 1.75, 4.6);

  /* Responsive framing. Rather than a heuristic widening curve, compute the
     exact FOV needed for the shell (half-width ≈ 1.08 world units) to fill
     FILL of the screen width on narrow screens. The coquillage is then as
     large as it can be on every phone without its sides being cut off while
     rotating. */
  const BASE_FOV = 33, REF_ASPECT = 1.15, MAX_FOV = 60;
  const SHELL_HALF_W = 1.08, FILL = 0.96;
  const HOME_DIST = camera.position.distanceTo(new THREE.Vector3(0, -0.08, 0.5));

  function fitCamera() {
    const aspect = innerWidth / innerHeight;
    camera.aspect = aspect;
    let fov = BASE_FOV;
    if (aspect < REF_ASPECT) {
      const needed = 2 * Math.atan((SHELL_HALF_W / FILL) / (HOME_DIST * aspect)) * 180 / Math.PI;
      fov = Math.min(MAX_FOV, Math.max(BASE_FOV, needed));
    }
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  fitCamera();

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, -0.08, 0.5);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 0.3;
  controls.maxDistance = 7.5;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = 1.46;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.55;

  /* lights — softer key, more fill, so the interior reads and the top valve
     does not blow out */
  scene.add(new THREE.HemisphereLight(0xcfeeff, 0x182634, 0.6));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.7);
  key.position.set(3, 5.5, 3.5);
  key.castShadow = REALTIME_SHADOWS;
  if (REALTIME_SHADOWS) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.03;
    const sc = key.shadow.camera;
    sc.left = -2; sc.right = 2; sc.top = 2; sc.bottom = -2; sc.near = 0.5; sc.far = 22;
  }
  scene.add(key);

  const fillLight = new THREE.DirectionalLight(0x9fd0ff, 0.55);
  fillLight.position.set(-4, 2, 4);
  scene.add(fillLight);
  const rim = new THREE.DirectionalLight(0xbfe6ff, 0.7);
  rim.position.set(0, 3, -5);
  scene.add(rim);
  const interior = new THREE.PointLight(0xfff3e2, 0.5, 4, 2);
  interior.position.set(0, 1.3, 0.6);
  const pearlLight = new THREE.PointLight(0xfff1dd, 0, 3.5, 2);
  pearlLight.position.set(0, 0.12, 0.6);

  /* Nacre micro-detail. Generating it is CPU work before the first frame, and
     it is tiled three times across the shell — so the texel density on screen
     is already three times what the number suggests. 256 is plenty for a
     desktop; 128 is indistinguishable on a phone held at arm's length. */
  const nacreNormal = makeNacreNormal(geoTier === 2 ? 256 : 128);
  nacreNormal.repeat.set(3, 3);
  nacreNormal.anisotropy = 1;   // a normal map at grazing angles gains nothing

  /* Two-tone shell material: pearly mother-of-pearl on the inside (front
     faces), a more matte colour outside, so the bottom valve's underside
     reads as a tan ribbed clam shell while the inside stays nacre. */
  function makeShellMaterial(interiorHex, exteriorHex) {
    const opts = {
      color: 0xffffff, roughness: 0.4, metalness: 0.0,
      clearcoat: 0.8, clearcoatRoughness: 0.24,
      normalMap: nacreNormal,
      /* A smaller normal map and no second clearcoat fetch means the growth
         lines carry less on their own — so the one remaining map is pushed a
         little harder on the tiers that lost the other, which costs nothing:
         normalScale is a multiply, not a texture read. */
      normalScale: new THREE.Vector2(matTier === 2 ? 0.22 : 0.30, matTier === 2 ? 0.22 : 0.30),
      envMapIntensity: 0.9,
      side: THREE.DoubleSide
    };

    /* What each feature buys, and what it costs:
         clearcoat       the wet lacquer over the nacre. Kept everywhere — it is
                         the biggest single reason the shell reads as shell.
         normalMap       the growth lines. Kept everywhere; one texture fetch.
         sheen           the powdery rim. Kept on mobile but softened, because a
                         full-strength sheen lobe is a second specular evaluation.
         clearcoatNormal a SECOND normal fetch and a second lobe, for detail the
                         base normal map already carries. Desktop only.
         iridescence     a thin-film interference model — the most expensive
                         block in the material. Desktop only. */
    if (matTier === 2) {
      opts.sheen = 1.0;
      opts.sheenRoughness = 0.5;
      opts.sheenColor = new THREE.Color(0xffdfe8);
      opts.clearcoatNormalMap = nacreNormal;
      opts.iridescence = 0.4;
      opts.iridescenceIOR = 1.3;
      opts.iridescenceThicknessRange = [140, 420];
    } else if (matTier === 1) {
      opts.sheen = 0.7;
      opts.sheenRoughness = 0.6;
      opts.sheenColor = new THREE.Color(0xffdfe8);
      opts.envMapIntensity = 1.0;   // the lost iridescence, paid back as environment
    } else {
      opts.clearcoat = 0.6;
      opts.clearcoatRoughness = 0.3;
      opts.envMapIntensity = 1.05;
    }

    const mat = new THREE.MeshPhysicalMaterial(opts);
    const inC = new THREE.Color(interiorHex).convertSRGBToLinear();
    const exC = new THREE.Color(exteriorHex).convertSRGBToLinear();

    mat.onBeforeCompile = shader => {
      shader.uniforms.uInt = { value: inC };
      shader.uniforms.uExt = { value: exC };
      shader.fragmentShader = 'uniform vec3 uInt;\nuniform vec3 uExt;\n' + shader.fragmentShader
        .replace('#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb *= ( gl_FrontFacing ? uInt : uExt );')
        .replace('#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n  if(!gl_FrontFacing){ roughnessFactor = clamp(roughnessFactor*1.4 + 0.16, 0.0, 1.0); }');
    };

    /* The two valves differ only in the colour of their outer face, and that
       colour is a uniform — so they share one compiled program. Keying the
       cache on the hexes made the browser compile the whole physical shader
       twice, which on a weak phone is one of the longest single pauses before
       the first frame. */
    mat.customProgramCacheKey = () => `shell_${matTier}`;
    return mat;
  }

  const shellMatBottom = makeShellMaterial(0xf2e9d9, 0xc6a679); // tan exterior
  const shellMatTop = makeShellMaterial(0xf2e9d9, 0xeee1cb);    // cream exterior

  /* The pearl is the one object the whole page is about, so it keeps more than
     the shell does: the sheen stays on every tier because it is what makes the
     surface look soft rather than plastic. Only the thin-film interference —
     by far the costliest term — is desktop-only, and its absence is paid back
     with a stronger environment reflection and a warmer emissive. */
  const pearlOpts = {
    color: 0xfdf9f6, roughness: 0.1, metalness: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.08,
    envMapIntensity: 1.4,
    emissive: new THREE.Color(0xffe9d8), emissiveIntensity: 0.05,
    sheen: 0.6, sheenColor: new THREE.Color(0xfff0f6)
  };
  if (matTier === 2) {
    pearlOpts.iridescence = 0.5;
    pearlOpts.iridescenceIOR = 1.4;
    pearlOpts.iridescenceThicknessRange = [280, 580];
  } else {
    pearlOpts.envMapIntensity = 1.6;
    pearlOpts.emissiveIntensity = 0.07;
  }
  const pearlMat = new THREE.MeshPhysicalMaterial(pearlOpts);

  const mantleOpts = {
    vertexColors: true, color: 0xffffff, roughness: 0.34,
    clearcoat: 0.6, clearcoatRoughness: 0.16,
    emissive: new THREE.Color(0x2a0805), emissiveIntensity: 0.07,
    envMapIntensity: 0.85, side: THREE.DoubleSide
  };
  // the mantle sits inside the bowl, mostly in shadow — its sheen is the first
  // thing that can go, and nobody will find it missing
  if (matTier === 2) {
    mantleOpts.sheen = 0.5;
    mantleOpts.sheenColor = new THREE.Color(0xffd8cd);
  } else {
    mantleOpts.clearcoat = 0.4;
  }
  const mantleMat = new THREE.MeshPhysicalMaterial(mantleOpts);

  const valveGeo = geoTier === 2 ? makeValveGeometry(160, 64)
    : geoTier === 1 ? makeValveGeometry(120, 52)
      : makeValveGeometry(80, 36);
  const topGeo = mirrorValveY(valveGeo);
  const mantleGeo = makeMantleGeometry(
    geoTier === 2 ? 140 : geoTier === 1 ? 110 : 70,
    geoTier === 2 ? 44 : geoTier === 1 ? 36 : 26
  );

  /* One group holding the whole shell, so it can be shifted lower in the scene
     as a unit: the camera stays put and the shell drops down. */
  const shellGroup = new THREE.Group();
  shellGroup.position.y = -0.55;
  scene.add(shellGroup);
  shellGroup.add(interior);
  shellGroup.add(pearlLight);

  /* Shadow flags only mean anything when the renderer is actually casting.
     Leaving them true otherwise makes three walk the whole shadow path every
     frame to discover it has nothing to do. */
  const SH = REALTIME_SHADOWS;

  const bottom = new THREE.Mesh(valveGeo, shellMatBottom);
  bottom.castShadow = SH; bottom.receiveShadow = SH;
  shellGroup.add(bottom);

  const top = new THREE.Mesh(topGeo, shellMatTop);
  top.castShadow = SH; top.receiveShadow = SH;
  const topPivot = new THREE.Group();       // hinge at the origin (the umbo)
  topPivot.add(top);
  shellGroup.add(topPivot);

  const mantle = new THREE.Mesh(mantleGeo, mantleMat);
  mantle.castShadow = SH; mantle.receiveShadow = SH;
  shellGroup.add(mantle);

  const pearlY0 = -0.07;
  /* A sphere of 0.27 world units never covers more than about a third of the
     screen until the final push-in, and by then it is nearly flat-shaded
     anyway. 64 segments is smooth to the silhouette; 96 was 18,000 triangles
     for a ball. */
  const pearlSeg = geoTier === 2 ? 64 : geoTier === 1 ? 48 : 32;
  const pearlGeo = new THREE.SphereGeometry(0.27, pearlSeg, pearlSeg);
  const pearl = new THREE.Mesh(pearlGeo, pearlMat);
  pearl.position.set(0, pearlY0, 0.6);
  pearl.castShadow = SH; pearl.receiveShadow = SH;
  shellGroup.add(pearl);

  const haloTex = makeHaloTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  halo.scale.set(1.6, 1.6, 1.6);
  halo.position.copy(pearl.position);
  shellGroup.add(halo);

  const disposables = [valveGeo, topGeo, mantleGeo, pearlGeo, nacreNormal, haloTex,
    shellMatBottom, shellMatTop, pearlMat, mantleMat, halo.material, envTex];

  if (REALTIME_SHADOWS) {
    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.99;
    ground.receiveShadow = true;
    scene.add(ground);
    disposables.push(groundGeo, groundMat);
  } else {
    /* The painted stand-in has to fall where the real one did, or the shell
       reads as hovering. The key light sits at (3, 5.5, 3.5), so the shadow
       goes down-left and slightly toward the viewer; the offset below is that
       direction scaled by how far the shell floats above the floor. */
    const blobTex = makeShadowBlobTexture();
    const blobGeo = new THREE.PlaneGeometry(2.7, 1.85);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(-0.2, -0.985, -0.05);
    scene.add(blob);
    disposables.push(blobTex, blobGeo, blobMat);
  }

  /* ============================================================
     the reveal rig
     ============================================================ */
  let target = 0;       // 0 = closed, 1 = open
  let openT = 0;        // the eased value that actually drives the shell
  let zoomT = 0;        // 0 = home, 1 = the pearl fills the screen
  let zoomStart = 0;

  const targetHome = controls.target.clone();
  const camHomePos = camera.position.clone();
  const homeDistance = camera.position.distanceTo(controls.target);
  const homeDir = camHomePos.clone().sub(targetHome).normalize();
  const PEARL_RADIUS = 0.27;
  const zoomDistance = 0.34;   // just outside the pearl's surface
  const nearHome = camera.near;

  const pearlWorld = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const newTarget = new THREE.Vector3();

  /* If the user has rotated the shell away from its default facing when they
     open it, snap the camera back to the correct angle first, so the zoom
     always lands cleanly on the pearl. */
  let recenterActive = false;
  let recenterT = 1;
  const recenterFromPos = new THREE.Vector3();
  const recenterFromTarget = new THREE.Vector3();

  /* ---- adaptive resolution ----

     The old version waited 90 frames of warm-up and then averaged 50 more —
     140 frames, which on a device running at 19fps is seven seconds of visible
     stutter before the first correction, and each correction was a timid 0.15.

     This one samples in windows of 20 after a 25-frame warm-up, so the first
     verdict lands in well under a second, and it sizes the correction to how
     far off the pace the device actually is: badly struggling drops two steps
     at once, mildly struggling drops one.

     It never climbs back up. Resolution that oscillates is worse to look at
     than resolution that is simply lower — the shell would visibly soften and
     sharpen every couple of seconds. One-way is the whole point. */
  const FRAME_POOR = 1 / 34;   // slipping
  const FRAME_BAD = 1 / 24;    // clearly drowning
  let frameAcc = 0, frameN = 0, warmup = 25, settled = false;

  function applyPixelRatio() {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
  }

  function tuneResolution(dt) {
    if (settled) return;                 // already at the floor: stop measuring
    if (warmup > 0) { warmup--; return; } // ignore startup jank / shader compiles
    if (dt > 0.5) return;                // a stall, not a frame rate
    frameAcc += dt; frameN++;
    if (frameN < 20) return;

    const avg = frameAcc / frameN;
    frameAcc = 0; frameN = 0;
    if (avg <= FRAME_POOR) return;       // keeping up — leave it alone

    const step = avg > FRAME_BAD ? 0.35 : 0.18;
    const next = Math.max(PR_MIN, pixelRatio - step);
    if (next === pixelRatio) { settled = true; return; }
    pixelRatio = next;
    applyPixelRatio();
    if (pixelRatio <= PR_MIN) settled = true;
  }

  /* ---- frame pacing ----
     On a weak device, asking for 60 and delivering 24 is worse than asking for
     30 and delivering it: the frames arrive evenly, so the shell turns
     smoothly instead of lurching. Only tier 0 is paced. */
  const FRAME_MIN_MS = tier === 0 ? 1000 / 30 : 0;
  let lastFrameAt = 0;

  const clock = new THREE.Clock();
  let rafId = 0;
  let rendering = true;
  let firstFrame = true;
  let disposed = false;

  /* ---- rendering only when something has changed ----

     With prefers-reduced-motion the shell does not auto-rotate, the pearl does
     not shimmer and nothing eases: the scene is a still life. It was still
     being redrawn sixty times a second, which on a phone is a warm back pocket
     and a flat battery for a picture that never changes.

     `dirty` is raised by anything that genuinely moves the image — a drag, a
     pinch, the reveal, a resize — and lowered once the frame that answers it
     has been drawn. Two extra frames are granted after each change so
     OrbitControls' damping can come to rest rather than freezing mid-glide.
     When motion is not reduced this is always true, so the loop behaves
     exactly as it did. */
  let dirty = true;
  let settleFrames = 0;
  const markDirty = () => { dirty = true; settleFrames = 2; };
  if (reduce) {
    controls.addEventListener('change', markDirty);
    controls.addEventListener('start', markDirty);
  }

  function animate() {
    if (!rendering || disposed) return;
    rafId = requestAnimationFrame(animate);

    /* Pacing happens before anything else is computed: a frame we are not
       going to draw should cost nothing at all, not a full simulation step
       thrown away at the end. */
    if (FRAME_MIN_MS) {
      const now = performance.now();
      if (now - lastFrameAt < FRAME_MIN_MS) return;
      lastFrameAt = now;
    }

    const dt = clock.getDelta();
    tuneResolution(dt);

    openT += (target - openT) * Math.min(1, dt * 6);
    const e = openT < 0.5 ? 4 * openT ** 3 : 1 - Math.pow(-2 * openT + 2, 3) / 2; // easeInOutCubic

    topPivot.rotation.x = -1.28 * e;              // lift the front valve open
    pearl.position.y = pearlY0 + 0.05 * e;
    pearl.scale.setScalar(1 + 0.04 * e);
    pearlMat.emissiveIntensity = 0.05 + 0.45 * e;
    pearlLight.intensity = 2.2 * e;
    halo.material.opacity = 0.8 * e;
    halo.position.copy(pearl.position);

    pearl.rotation.y += dt * 0.25;                // shimmer

    if (recenterActive) {
      recenterT = Math.min(1, recenterT + dt / RECENTER_SECONDS);
      const rEase = recenterT < 0.5 ? 4 * recenterT ** 3 : 1 - Math.pow(-2 * recenterT + 2, 3) / 2;
      camera.position.lerpVectors(recenterFromPos, camHomePos, rEase);
      controls.target.lerpVectors(recenterFromTarget, targetHome, rEase);
      if (recenterT >= 1) { recenterActive = false; controls.enabled = true; }
      controls.update();
    } else {
      /* Push-in toward the pearl. It preserves the camera's current orbit
         direction, so rotating is never restricted — not even mid-zoom. */
      if (reduce) zoomT = target;
      else if (target === 1) zoomT = Math.min(1, Math.max(0, (performance.now() - zoomStart) / REVEAL_MS));
      else if (zoomT > 0) zoomT = Math.max(0, zoomT - dt * 1.6);   // pull back out on close

      /* smootherstep (6t⁵-15t⁴+10t³): zero velocity AND zero acceleration at
         both ends, so the move has no perceptible start jolt and no braking at
         the end — easeInOutCubic still lands with a visible stop. */
      const ez = zoomT * zoomT * zoomT * (zoomT * (zoomT * 6 - 15) + 10);

      pearl.getWorldPosition(pearlWorld);
      newTarget.copy(targetHome).lerp(pearlWorld, ez);
      camDir.copy(camera.position).sub(controls.target);
      if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, 1);
      camDir.normalize();
      const dist = homeDistance + (zoomDistance - homeDistance) * ez;
      camera.position.copy(newTarget).addScaledVector(camDir, dist);
      controls.target.copy(newTarget);

      /* Shrink the near-clip plane as we approach the pearl's surface so it is
         never sliced away — this is what lets the zoom go all the way in until
         the pearl genuinely fills the entire screen. */
      const safeNear = Math.max(0.01, Math.min(nearHome, dist - PEARL_RADIUS - 0.03));
      if (Math.abs(camera.near - safeNear) > 0.001) {
        camera.near = safeNear;
        camera.updateProjectionMatrix();
      }

      controls.autoRotate = reduce ? false : (ez < 0.12);
      controls.autoRotateSpeed = reduce ? 0 : (0.55 - 0.3 * e);
      controls.update();
    }

    /* A still scene under reduced motion is not redrawn. Everything else —
       the auto-rotating shell, the reveal, a finger on the glass — reports
       itself as changed and is drawn exactly as before. */
    if (reduce && !firstFrame) {
      const moving = target !== openT || zoomT !== (target === 1 ? 1 : 0) || recenterActive;
      if (moving) markDirty();
      if (!dirty && settleFrames <= 0) return;
      if (!moving && settleFrames > 0) settleFrames--;
      if (settleFrames <= 0) dirty = false;
    }

    renderer.render(scene, camera);

    if (firstFrame) { firstFrame = false; handlers.onReady?.(); }
  }

  /* The render loop can be parked entirely — see the gallery reveal.
     Restarting resets the clock, otherwise the first frame back would carry
     the whole paused duration as its delta and jump every eased value. */
  function renderOff() {
    if (!rendering) return;
    rendering = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function renderOn() {
    if (rendering || disposed) return;
    if (document.hidden) return;   // nothing to draw for nobody
    rendering = true;
    clock.getDelta();
    lastFrameAt = 0;
    animate();
  }

  /* A backgrounded tab still gets rAF callbacks in some browsers, and on a
     phone a scene left rendering behind another app is the fastest way to
     drain a battery and have the WebGL context taken away. Park it. */
  let pausedByHide = false;
  let suspended = false;          // the gallery took the screen
  const onVisibility = () => {
    if (document.hidden) {
      if (rendering) { pausedByHide = true; renderOff(); }
    } else if (pausedByHide) {
      pausedByHide = false;
      if (!suspended) renderOn();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  /* A phone fires resize continuously while its address bar slides away, and
     every one of those reallocates the drawing buffer — one of the most
     expensive things a WebGL context can be asked to do. Coalesce them, and
     ignore the ones that do not actually change the size. */
  let resizeT = 0;
  let lastW = innerWidth;
  let lastH = innerHeight;
  const onResize = () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (innerWidth === lastW && innerHeight === lastH) return;
      lastW = innerWidth; lastH = innerHeight;
      fitCamera();
      applyPixelRatio();
      markDirty();
    }, 140);
  };
  addEventListener('resize', onResize);

  /* click vs drag detection, coexisting with OrbitControls */
  let downX = 0, downY = 0, downT = 0, moved = false;
  const onDown = e => { downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = false; };
  const onMove = e => { if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true; };
  const onUp = () => { if (!moved && performance.now() - downT < 350) handlers.onShellTap?.(); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);

  animate();

  /* ============================================================
     the API the React component talks to
     ============================================================ */
  return {
    /** Open the shell and begin the push-in. @returns the reveal's length, ms */
    reveal() {
      target = 1;
      markDirty();

      const curDir = camera.position.clone().sub(controls.target).normalize();
      const angleOff = curDir.angleTo(homeDir);
      if (!reduce && angleOff > 0.06) {
        recenterActive = true;
        recenterT = 0;
        recenterFromPos.copy(camera.position);
        recenterFromTarget.copy(controls.target);
        controls.enabled = false;
      } else {
        recenterActive = false;
        recenterT = 1;
      }

      /* The push-in only starts once the camera has been squared up, so the
         clock the animation reads and the beats the UI schedules share one
         origin — the gallery then lands on the exact frame the zoom ends.
         Reopening after a partial close resumes from where the camera is. */
      const delay = recenterActive ? RECENTER_SECONDS * 1000 : 0;
      zoomStart = performance.now() + delay - zoomT * REVEAL_MS;
      return reduce ? 0 : delay + REVEAL_MS * (1 - zoomT);
    },

    /** Close the shell and pull back out. */
    closeReveal() {
      target = 0;
      markDirty();
    },

    /** Projects the pearl's position to screen pixels — where the cards fly from. */
    pearlScreenPos() {
      pearl.getWorldPosition(pearlWorld);
      const ndc = pearlWorld.clone().project(camera);
      return {
        x: (ndc.x * 0.5 + 0.5) * innerWidth,
        y: (1 - (ndc.y * 0.5 + 0.5)) * innerHeight
      };
    },

    /* The gallery covers the canvas completely, so every frame rendered behind
       it is wasted work competing with scrolling for the main thread. */
    suspend() { suspended = true; renderOff(); },
    resume() { suspended = false; renderOn(); },

    renderOn, renderOff,

    diagnostics: () => ({
      tier, matTier, geoTier, mobile: isMobile,
      shadows: REALTIME_SHADOWS,
      pixelRatio: +pixelRatio.toFixed(2),
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      programs: renderer.info.programs ? renderer.info.programs.length : 0,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures
    }),

    dispose() {
      disposed = true;
      renderOff();
      clearTimeout(resizeT);
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      controls.dispose();
      disposables.forEach(d => d?.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss?.();
      host.replaceChildren();
    }
  };
}
