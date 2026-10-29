import type { LinkedInTokens } from '../lib/types.js';
import { isRenderHosted } from './hosted-token-maintenance.js';

const RENDER_API = 'https://api.render.com/v1';

/** Render injects RENDER_SERVICE_ID on web services; optional override for local scripts. */
export function resolveRenderServiceId(): string | undefined {
  return process.env.RENDER_SERVICE_ID?.trim() || undefined;
}

/**
 * Push refreshed tokens back to Render env — **only on the Render host itself**,
 * so deploys/cold starts keep a valid refresh_token without copying from a laptop.
 */
export function renderTokenSyncConfigured(): boolean {
  if (!isRenderHosted()) {
    return false;
  }
  return Boolean(process.env.RENDER_API_KEY?.trim() && resolveRenderServiceId());
}

function renderAuthHeaders(): Record<string, string> {
  const key = process.env.RENDER_API_KEY?.trim();
  if (!key) {
    throw new Error('RENDER_API_KEY is not set');
  }
  return {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

type RenderEnvRow = { envVar: { key: string; value: string }; cursor?: string };

async function listServiceEnvVars(serviceId: string): Promise<Array<{ key: string; value: string }>> {
  const out: Array<{ key: string; value: string }> = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${RENDER_API}/services/${serviceId}/env-vars`);
    url.searchParams.set('limit', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const res = await fetch(url, { headers: renderAuthHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Render list env-vars failed (${res.status}): ${body.slice(0, 400)}`);
    }

    const page = (await res.json()) as RenderEnvRow[];
    for (const row of page) {
      out.push({ key: row.envVar.key, value: row.envVar.value });
    }
    cursor = page.length > 0 ? page[page.length - 1].cursor : undefined;
  } while (cursor);

  return out;
}

/**
 * Updates LINKEDIN_TOKENS_JSON on this Render service without removing other env vars.
 * Does not trigger a deploy — the running instance already has fresh tokens in memory.
 */
export async function pushTokensToRenderEnv(
  tokens: LinkedInTokens,
  options: { envKey?: string; triggerDeploy?: boolean; serviceId?: string } = {}
): Promise<void> {
  const serviceId = options.serviceId || resolveRenderServiceId();
  if (!serviceId) {
    throw new Error('RENDER_SERVICE_ID is not set');
  }

  const envKey = options.envKey || process.env.RENDER_TOKENS_ENV_KEY || 'LINKEDIN_TOKENS_JSON';
  const serialized = JSON.stringify(tokens);

  const existing = await listServiceEnvVars(serviceId);
  const merged = existing.filter((row) => row.key !== envKey);
  merged.push({ key: envKey, value: serialized });

  const putRes = await fetch(`${RENDER_API}/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: renderAuthHeaders(),
    body: JSON.stringify(merged.map(({ key, value }) => ({ key, value }))),
  });

  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(`Render update env-vars failed (${putRes.status}): ${body.slice(0, 400)}`);
  }

  if (options.triggerDeploy) {
    const deployRes = await fetch(`${RENDER_API}/services/${serviceId}/deploys`, {
      method: 'POST',
      headers: renderAuthHeaders(),
      body: JSON.stringify({ clearCache: false }),
    });
    if (!deployRes.ok) {
      const body = await deployRes.text();
      throw new Error(`Render deploy trigger failed (${deployRes.status}): ${body.slice(0, 400)}`);
    }
  }
}

/** On Render only: persist refreshed tokens to LINKEDIN_TOKENS_JSON for the next cold start. */
export function scheduleRenderTokenSync(tokens: LinkedInTokens, reason: string): void {
  if (!renderTokenSyncConfigured()) {
    return;
  }
  if (process.env.RENDER_TOKEN_SYNC === '0' || process.env.RENDER_TOKEN_SYNC === 'false') {
    return;
  }

  void pushTokensToRenderEnv(tokens)
    .then(() => {
      console.error(`Render self token persist OK (${reason})`);
    })
    .catch((error) => {
      console.error(
        `Render self token persist failed (${reason}):`,
        error instanceof Error ? error.message : error
      );
    });
}
