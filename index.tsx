// FIX: Removed the reference to "vite/client" as the type definition file could not be found.
// This is safe because this project does not use Vite-specific client features
// like `import.meta.env`.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);