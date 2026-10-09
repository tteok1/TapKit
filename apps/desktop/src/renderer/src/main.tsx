import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from '@tapkit/ui';
import { DesktopShell } from './desktop-shell';
import { readLayout } from './desktop-state';
import './styles.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(
  <StrictMode>
    <MemoryRouter
      initialEntries={[window.tapkit.initialRoute ?? readLayout(window.tapkit.windowSlot).route]}
    >
      <DesktopShell />
    </MemoryRouter>
  </StrictMode>,
);
