import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LoadingScreen from './components/ui/LoadingScreen';

/* ============================================================
   Four screens, one application.

     /p/:slug       the gift — the experience
     /build/:slug   the workshop, where a customer fills it
     /admin         the console, where an order becomes an empty gift
     /panel         the creation panel: a whole pearl in one pass

   Everything is code-split. The viewer carries three.js and the workshop
   carries the recorder; neither has any business loading when someone opens
   the administration console.
   ============================================================ */
const ViewerPage = lazy(() => import('./pages/ViewerPage'));
const BuilderPage = lazy(() => import('./pages/BuilderPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const PanelPage = lazy(() => import('./pages/PanelPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/p/:slug" element={<ViewerPage />} />
          {/* opened without a gift: the seeded demo pearl */}
          <Route path="/p" element={<ViewerPage />} />
          <Route path="/build/:slug" element={<BuilderPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/panel" element={<PanelPage />} />
          <Route path="/" element={<PanelPage />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
