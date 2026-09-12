import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Register the service worker only in a real browser (not inside Capacitor's
// WebView, where it can serve stale assets).
const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor;
if (!isCapacitor) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
