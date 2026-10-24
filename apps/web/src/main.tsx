import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

const root = document.querySelector('#root');

if (!root) {
  throw new Error('Root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
