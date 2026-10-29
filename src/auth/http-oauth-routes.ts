import * as crypto from 'node:crypto';
import type express from 'express';
import { LinkedInOAuth } from './oauth.js';
import { TokenStore } from './token-store.js';
import { configuredToken } from '../url-token-auth.js';

const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function purgeExpiredStates(): void {
  const now = Date.now();
  for (const [state, created] of pendingStates) {
    if (now - created > STATE_TTL_MS) {
      pendingStates.delete(state);
    }
  }
}

function assertMcpGate(req: express.Request, res: express.Response): boolean {
  const gate = configuredToken();
  if (!gate) {
    return true;
  }
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const header = req.headers.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  if (queryToken === gate || bearer === gate) {
    return true;
  }
  res.status(401).json({
    error: 'Unauthorized',
    hint: 'Open /auth/linkedin?token=YOUR_MCP_URL_AUTH_TOKEN or send Authorization: Bearer …',
  });
  return false;
}

function successHtml(expiresInDays: number): string {
  return `<!doctype html>
<html><body style="font-family:system-ui;text-align:center;padding:3rem">
<h1 style="color:#0077b5">LinkedIn connected</h1>
<p>Tokens saved for this MCP service. You can close this tab.</p>
<p style="color:#666">Access token ~${expiresInDays} days · refresh persists automatically</p>
</body></html>`;
}

function failureHtml(message: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui;text-align:center;padding:3rem">
<h1 style="color:#c00">LinkedIn auth failed</h1>
<p>${message.replace(/</g, '&lt;')}</p>
</body></html>`;
}

/**
 * Browser OAuth on the hosted HTTP server (Render). Register redirect URI on the LinkedIn app:
 *   https://YOUR-SERVICE.onrender.com/auth/linkedin/callback
 */
export function mountLinkedInOAuthRoutes(app: express.Application, tokenStore: TokenStore): void {
  app.get('/auth/linkedin', (req, res) => {
    if (!assertMcpGate(req, res)) {
      return;
    }
    purgeExpiredStates();
    try {
      const oauth = new LinkedInOAuth(tokenStore);
      const state = crypto.randomBytes(16).toString('hex');
      pendingStates.set(state, Date.now());
      res.redirect(oauth.getAuthorizationUrl(state));
    } catch (error) {
      res.status(500).send(failureHtml(error instanceof Error ? error.message : String(error)));
    }
  });

  app.get('/auth/linkedin/callback', async (req, res) => {
    purgeExpiredStates();
    try {
      const { code, state: returnedState, error, error_description } = req.query;

      if (error) {
        throw new Error(`OAuth error: ${error} - ${error_description ?? ''}`);
      }

      if (!returnedState || typeof returnedState !== 'string' || !pendingStates.has(returnedState)) {
        throw new Error('Invalid or expired OAuth state — restart from /auth/linkedin');
      }
      pendingStates.delete(returnedState);

      if (!code || typeof code !== 'string') {
        throw new Error('No authorization code received');
      }

      const oauth = new LinkedInOAuth(tokenStore);
      const tokens = await oauth.exchangeCodeForTokens(code);
      await tokenStore.saveTokens(tokens);

      res.send(successHtml(Math.floor(tokens.expires_in / 86400)));
    } catch (error) {
      res.status(400).send(failureHtml(error instanceof Error ? error.message : String(error)));
    }
  });
}
