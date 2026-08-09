import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles/base.css';
import './styles/underwater.css';
import './styles/gate.css';
import './styles/collection.css';
import './styles/story.css';
import './styles/pages.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
