import type { TokenStore } from './token-store.js';
import { configuredToken } from '../url-token-auth.js';

const TICK_MS = 30 * 60 * 1000;

export function isRenderHosted(): boolean {
  return process.env.RENDER === 'true';
}

/** Public URL to start LinkedIn OAuth on this Render service (no laptop). */
export function hostedLinkedInAuthUrl(): string | null {
  if (!isRenderHosted()) {
    return null;
  }
  const base = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (!base) {
    return null;
  }
  const gate = configuredToken();
  if (gate) {
    return `${base}/auth/linkedin?token=${encodeURIComponent(gate)}`;
  }
  return `${base}/auth/linkedin`;
}

/**
 * On Render: periodically refresh before expiry and log re-auth URL if refresh fails.
 * No local token copy required — refresh uses refresh_token + client secret on-server.
 */
export function startHostedTokenMaintenance(tokenStore: TokenStore): void {
  if (!isRenderHosted()) {
    return;
  }

  const run = async (): Promise<void> => {
    const tokens = await tokenStore.getTokens();
    if (!tokens) {
      const url = hostedLinkedInAuthUrl();
      console.error(
        url
          ? `LinkedIn MCP: no tokens. Connect once in browser: ${url}`
          : 'LinkedIn MCP: no tokens. Set LINKEDIN_REDIRECT_URI and open /auth/linkedin'
      );
      return;
    }

    const ok = await tokenStore.hasValidToken();
    if (!ok) {
      const url = hostedLinkedInAuthUrl();
      console.error(
        url
          ? `LinkedIn token refresh failed (revoked or expired). Re-connect: ${url}`
          : 'LinkedIn token refresh failed. Re-run hosted OAuth at /auth/linkedin'
      );
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, TICK_MS);
}
