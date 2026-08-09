import { useEffect, useMemo } from 'react';

/* ============================================================
   Device tier — 2 = desktop / flagship, 1 = average phone, 0 = low-end phone.

   Only values the browser ACTUALLY reports count against the device: iPhones
   do not expose deviceMemory at all, and must not be punished for it.

   The rule starts a phone at tier 1 and makes it EARN tier 2. Starting every
   phone at the top and demanding proof of weakness was backwards — the proof
   arrives as dropped frames, and by then the visitor has already watched the
   shell stutter. This costs a flagship almost nothing (it is the tier the
   adaptive scaler would settle on anyway) and saves every mid-range device
   the worst of the first three seconds.
   ============================================================ */
export function detectTier() {
  const isMobile = matchMedia('(pointer:coarse)').matches
    || Math.min(screen.width, screen.height) < 768;

  const cores = navigator.hardwareConcurrency;   // may be undefined
  const mem = navigator.deviceMemory;            // undefined on iOS / Firefox

  let tier = 2;
  if (isMobile) {
    const lowCores = cores !== undefined && cores <= 4;
    const lowMem = mem !== undefined && mem <= 3;
    // either signal alone is enough to call a phone weak
    if (lowCores || lowMem) tier = 0;
    // and a phone only reaches the top tier by clearly being a recent flagship
    else if (cores !== undefined && cores >= 8 && (mem === undefined || mem >= 6)) tier = 2;
    else tier = 1;
  }

  /* Shader features are tiered separately from geometry.

     A recent iPhone has the CPU of a laptop and the sustained GPU budget of a
     phone: it carries the vertex count of tier 2 happily, then thermally
     throttles itself into the ground running a thin-film interference model
     across a full-screen pearl. So the material tier is capped on any touch
     device however fast the processor claims to be — the expensive shader
     blocks are a desktop luxury, and what they buy is a faint rainbow at
     grazing angles that nobody is looking for. */
  const matTier = isMobile ? Math.min(tier, 1) : tier;

  return { tier, matTier, isMobile };
}

/**
 * Detect the tier once, and mirror it onto <body> as the classes the
 * stylesheet has always keyed off: perf-mid, perf-low, is-mobile.
 */
export function usePerformanceTier() {
  const profile = useMemo(detectTier, []);

  useEffect(() => {
    const { classList } = document.body;
    if (profile.tier === 1) classList.add('perf-mid');
    if (profile.tier === 0) classList.add('perf-low');
    if (profile.isMobile) classList.add('is-mobile');
    return () => classList.remove('perf-mid', 'perf-low', 'is-mobile');
  }, [profile]);

  return profile;
}

/** Honoured everywhere: a spring, a drift, a rising bubble. */
export function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion:reduce)').matches;
}
