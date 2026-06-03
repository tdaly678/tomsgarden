/**
 * Temp-link & room-id helpers for the lobby flow.
 *
 * The room IS the link: a room id maps 1:1 to a PartyKit room, and the
 * shareable URL is just the app served under the GitHub Pages base path with
 * `?room=<id>`. We never need a separate "create room" round-trip — the first
 * player to `Join` a fresh room id becomes its host (see server.ts).
 */

/** Characters used for generated room codes (no ambiguous 0/O/1/I/l). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Generate a short, human-shareable, URL-safe room id. */
export function makeRoomId(): string {
  const buf = new Uint32Array(CODE_LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) buf[i] = Math.floor(Math.random() * 0xffffffff);
  }
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Build a shareable URL for a room. Uses Vite's `import.meta.env.BASE_URL`
 * (the GitHub Pages base path, e.g. `/tomsgarden/`) so links work both in dev
 * and on the deployed project page. Preserves the `host` param if present so a
 * non-default PartyKit host carries through the share link.
 */
export function makeShareUrl(roomId: string, host?: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const origin = window.location.origin;
  // Ensure exactly one slash between base and origin.
  const path = `${origin}${base.endsWith('/') ? base : base + '/'}`;
  const url = new URL(path);
  url.searchParams.set('room', roomId);
  if (host) url.searchParams.set('host', host);
  return url.toString();
}

/**
 * Extract a room id from raw user input: accepts either a bare code
 * ("ABC123") or a full pasted share URL (we read its `?room=` param).
 */
export function parseRoomInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Looks like a URL? pull ?room= out of it.
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('?room=')) {
    try {
      const u = new URL(trimmed, window.location.origin);
      const r = u.searchParams.get('room');
      if (r) return r.trim();
    } catch {
      // fall through to treating it as a bare code
    }
  }
  return trimmed;
}

/** Copy text to clipboard with a graceful fallback. Returns success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
