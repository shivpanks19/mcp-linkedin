#!/usr/bin/env node
/**
 * Emergency: push local tokens.json to Render (hosted MCP normally self-manages tokens).
 * Requires RENDER_API_KEY and RENDER_SERVICE_ID in environment (not used on Render itself).
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pushTokensToRenderEnv } from '../dist/auth/render-token-sync.js';
import { resolveRenderServiceId } from '../dist/auth/render-token-sync.js';

const apiKey = process.env.RENDER_API_KEY?.trim();
const serviceId = resolveRenderServiceId();
if (!apiKey || !serviceId) {
  console.error('Set RENDER_API_KEY and RENDER_SERVICE_ID in this shell (emergency sync only).');
  process.exit(1);
}

const tokenPath =
  process.env.TOKEN_STORAGE_PATH ||
  path.join(os.homedir(), '.linkedin-ads-mcp', 'tokens.json');

if (!fs.existsSync(tokenPath)) {
  console.error(`No tokens at ${tokenPath}. Run npm run auth first.`);
  process.exit(1);
}

const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
if (!tokens.access_token) {
  console.error('tokens.json missing access_token');
  process.exit(1);
}

try {
  await pushTokensToRenderEnv(tokens, { triggerDeploy: process.argv.includes('--deploy') });
  console.log('Updated Render LINKEDIN_TOKENS_JSON (no redeploy unless --deploy).');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
