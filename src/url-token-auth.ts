/**
 * URL-token access control for hosted MCP HTTP endpoints.
 * Mirrors mcp-google-ads/url_token_auth.py so Cursor can use:
 *   /mcp?token=...  or  /<token>/mcp
 */
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

export const TOKEN_ENV_VAR = 'MCP_URL_AUTH_TOKEN';
export const QUERY_PARAM = 'token';
export const PUBLIC_PATHS = new Set(['/', '/health']);
export const PROTECTED_PATHS = new Set(['/mcp', '/sse', '/messages']);

declare global {
  namespace Express {
    interface Request {
      mcpPathToken?: string;
    }
  }
}

export function configuredToken(): string {
  return (process.env[TOKEN_ENV_VAR] || '').trim();
}

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

export function isProtectedPath(path: string): boolean {
  const normalized = '/' + path.replace(/^\/+|\/+$/g, '');
  if (PROTECTED_PATHS.has(normalized)) return true;
  for (const protectedPath of PROTECTED_PATHS) {
    if (normalized.startsWith(`${protectedPath}/`)) return true;
  }
  return false;
}

export function queryToken(query: Request['query'] | string): string {
  if (typeof query === 'string') {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    return (params.get(QUERY_PARAM) || '').trim();
  }
  const raw = query[QUERY_PARAM];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export function bearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return '';
  if (value.toLowerCase().startsWith('bearer ')) {
    return value.slice('Bearer '.length).trim();
  }
  return '';
}

export function pathTokenAndRewrittenPath(path: string): { token: string; rewritten: string } {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2 && PROTECTED_PATHS.has(`/${parts[1]}`)) {
    return { token: parts[0], rewritten: '/' + parts.slice(1).join('/') };
  }
  return { token: '', rewritten: path };
}

export function rewritePathTokenUrl(url: string): { token: string; url: string } {
  const qIndex = url.indexOf('?');
  const path = qIndex === -1 ? url : url.slice(0, qIndex);
  const search = qIndex === -1 ? '' : url.slice(qIndex);
  const { token, rewritten } = pathTokenAndRewrittenPath(path);
  if (!token) return { token: '', url };
  return { token, url: rewritten + search };
}

export function tokenMatches(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function pathTokenRewrite(req: Request, _res: Response, next: NextFunction): void {
  const { token, url } = rewritePathTokenUrl(req.url);
  if (token) {
    req.mcpPathToken = token;
    req.url = url;
  }
  next();
}

export function urlTokenAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = configuredToken();
  if (!expected) {
    next();
    return;
  }

  if (isPublicPath(req.path)) {
    next();
    return;
  }

  if (!isProtectedPath(req.path)) {
    next();
    return;
  }

  const headerToken =
    bearerToken(req.headers.authorization) ||
    (typeof req.headers['x-mcp-token'] === 'string' ? req.headers['x-mcp-token'].trim() : '');
  const supplied = queryToken(req.query) || req.mcpPathToken || headerToken;

  if (!tokenMatches(expected, supplied)) {
    res.status(401).set('Cache-Control', 'no-store').json({ error: 'unauthorized' });
    return;
  }

  next();
}
