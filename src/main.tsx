import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Guard against third-party browser extension noise (e.g. MetaMask/Web3 wallets)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (
      reason.toLowerCase().includes('metamask') ||
      reason.toLowerCase().includes('ethereum') ||
      reason.toLowerCase().includes('web3') ||
      reason.toLowerCase().includes('failed to connect to metamask')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (
      message.toLowerCase().includes('metamask') ||
      message.toLowerCase().includes('ethereum') ||
      message.toLowerCase().includes('web3')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
