/**
 * Minimal ambient declaration for `partysocket` so the client type-checks in
 * environments where the dependency is declared in package.json but not yet
 * installed (e.g. the offline CI sandbox). At runtime/build the real package's
 * own types take precedence. We only declare the small surface we use.
 */
declare module 'partysocket' {
  export interface PartySocketOptions {
    host: string;
    room: string;
    party?: string;
    query?: Record<string, string> | (() => Record<string, string>);
  }

  export default class PartySocket {
    constructor(options: PartySocketOptions);
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    reconnect(): void;
    addEventListener(
      type: 'open' | 'close' | 'error',
      listener: (event: Event) => void,
    ): void;
    addEventListener(
      type: 'message',
      listener: (event: MessageEvent<string>) => void,
    ): void;
    removeEventListener(type: string, listener: (event: Event) => void): void;
  }
}
