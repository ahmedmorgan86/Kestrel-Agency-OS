import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeAndBrandProvider } from './context/ThemeAndBrandContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ThemeAndBrandProvider>
    <App />
  </ThemeAndBrandProvider>
);
