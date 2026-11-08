import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CandidateApp from './apps/CandidateApp';
import HrApp from './apps/HrApp';
import { AuthProvider } from './auth';
import { IS_HR } from './portal';
import { PreferencesProvider } from './preferences';
import './styles.css';
import './workspace.css';

// Jeden kód, dva portály: import.meta.env.VITE_APP Vite pri zostavení nahradí textom,
// takže druhá aplikácia sa do buildu nedostane (preto tu nie je IS_HR).
const App = import.meta.env.VITE_APP === 'hr' ? HrApp : CandidateApp;
document.title = IS_HR ? 'SmartRecruit HR' : 'SmartRecruit';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PreferencesProvider><AuthProvider>
        <App />
      </AuthProvider></PreferencesProvider>
    </BrowserRouter>
  </React.StrictMode>
);
