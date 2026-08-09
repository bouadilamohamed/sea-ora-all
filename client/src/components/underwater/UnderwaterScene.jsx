import { useEffect, useRef } from 'react';
import { createShellScene, glProbe } from '../../three/shellScene';

/* ============================================================
   The 3D coquillage.

   React mounts a host element and hands it to the scene factory; everything
   after that is three.js talking to itself at sixty frames a second. The
   component re-renders freely without disturbing it — the scene is created
   once, on mount, and the parent drives it through the imperative handle
   rather than through props.
   ============================================================ */
export default function UnderwaterScene({ profile, sceneRef, onReady, onFail, onShellTap }) {
  const hostRef = useRef(null);
  /* The tap handler changes on every render of the page (it closes over the
     gate's state). The scene is built once, so it reads the CURRENT handler
     through a ref rather than capturing a stale one. */
  const tapRef = useRef(onShellTap);
  tapRef.current = onShellTap;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let scene;
    try {
      scene = createShellScene(host, profile, {
        onReady,
        onShellTap: () => tapRef.current?.(),
        onContextLost: () => onFail?.({
          message: 'La scène 3D a été interrompue.',
          detail: 'Le navigateur a libéré le contexte graphique (mémoire insuffisante ou onglet resté en arrière-plan).',
          tech: ''
        })
      });
    } catch (err) {
      /* A failure here is not a blank screen: the probe says WHY, in words a
         visitor can act on, and the pearl can still be opened without it. */
      const probe = glProbe();
      const detail = (!probe.webgl1 && !probe.webgl2)
        ? 'WebGL semble désactivé ou indisponible. Sur ordinateur : activez l’accélération graphique dans les réglages du navigateur. Sur mobile : ouvrez le lien dans Chrome ou Safari plutôt que dans l’application (Instagram, Messenger…).'
        : 'Le contexte graphique n’a pas pu démarrer. Fermez les autres onglets 3D, puis rechargez.';
      const tech = [
        `WebGL2 ${probe.webgl2 ? 'oui' : 'non'}`,
        `WebGL1 ${probe.webgl1 ? 'oui' : 'non'}`,
        probe.gpu ? `GPU ${probe.gpu}` : '',
        err?.message ? String(err.message) : ''
      ].filter(Boolean).join(' · ');

      console.error(err);
      onFail?.({ message: 'La scène 3D n’a pas pu démarrer.', detail, tech });
      return undefined;
    }

    if (sceneRef) sceneRef.current = scene;

    /* Opt-in diagnostics. Adding ?perf to a pearl's URL exposes what the scene
       actually costs on this device — tier, resolution, triangles per frame,
       draw calls, compiled programs. It is how the numbers in the README were
       measured, and it means a phone that feels slow can be looked at rather
       than guessed about. Nothing is installed unless asked for. */
    if (/[?&]perf\b/.test(location.search)) window.__seaoraInfo = scene.diagnostics;

    return () => {
      delete window.__seaoraInfo;
      if (sceneRef) sceneRef.current = null;
      scene.dispose();
    };
    // built once: the profile is detected before this ever mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="scene-host" ref={hostRef} aria-hidden="true" />;
}
