import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClipboardProvider, MemoryRouter } from '@tapkit/ui';
import { DesktopShell } from './desktop-shell';
import './styles.css';
import './design-system.css';
import './form-controls.css';
import './experience.css';
import { ViewerProvider } from '../features/viewer/state';
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
const initialRoute =
  window.tapkit.initialRoute === '/quick-input' &&
  window.sessionStorage.getItem('tapkit.quick-input-promoted') === '1'
    ? '/'
    : (window.tapkit.initialRoute ?? '/');
createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={[initialRoute]}>
      <ClipboardProvider writeText={window.tapkit.copyText}>
        <ViewerProvider>
          <DesktopShell />
        </ViewerProvider>
      </ClipboardProvider>
    </MemoryRouter>
  </StrictMode>,
);
