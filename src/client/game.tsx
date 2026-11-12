import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const App = () => <main>Kolam</main>;

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
