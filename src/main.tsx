import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import { AuthProvider } from './state/AuthProvider';
import { AuthGate } from './features/auth/AuthGate';
import { DataProvider } from './state/DataProvider';
import { MessagesProvider } from './state/MessagesProvider';
import { ScopeProvider } from './state/ScopeProvider';
import { applyFavicon } from './assets/brand';
import './styles/global.css';

applyFavicon();

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

// Hash routing, not browser history: the deliverable is a single HTML file
// opened straight off the filesystem, where the history API has no server to
// resolve paths against. The hash keeps deep links working from file://.
createRoot(el).render(
  <StrictMode>
    <HashRouter>
      {/*
        AuthProvider wraps everything, but AuthGate sits OUTSIDE DataProvider on
        purpose: on the platform build the API refuses unauthenticated reads, so
        loading the data before there is a token would fail every request and
        show an error screen behind the login form. On the self-contained build
        the gate is a pass-through and nothing changes.
      */}
      <AuthProvider>
        <AuthGate>
          <DataProvider>
            {/*
              Messages sit INSIDE the gate and OUTSIDE the scope, because a
              conversation belongs to a person rather than to whichever
              portfolio they happen to be looking at. They are deliberately
              not part of the data snapshot: a message moves no figure, so
              carrying one alongside the reported position would mean every
              new message invalidated the position and every load of the
              position carried a conversation.
            */}
            <MessagesProvider>
              <ScopeProvider>
                <App />
              </ScopeProvider>
            </MessagesProvider>
          </DataProvider>
        </AuthGate>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
