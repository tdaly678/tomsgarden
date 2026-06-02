import type React from 'react';
import type { GamePhase } from '@tomsgarden/shared';

/**
 * Placeholder board page. Reads the room id from the URL (`?room=<id>` or the
 * last path segment) so deep-links into a specific game room work even before
 * the realtime client is wired up.
 */
function getRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('room');
  if (fromQuery) return fromQuery;

  const segments = window.location.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && last !== 'tomsgarden') return last;

  return 'lobby';
}

export function App(): React.ReactElement {
  const roomId = getRoomId();
  const phase: GamePhase = 'lobby';

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        background: '#10241b',
        color: '#e8f3ec',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '3rem', letterSpacing: '0.05em' }}>
        Tomsgarden
      </h1>
      <p style={{ opacity: 0.8 }}>
        Room: <code>{roomId}</code> &middot; phase: <code>{phase}</code>
      </p>
      <p style={{ opacity: 0.5, fontSize: '0.85rem' }}>
        Board placeholder — realtime client coming soon.
      </p>
    </main>
  );
}
