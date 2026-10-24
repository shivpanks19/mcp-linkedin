#!/usr/bin/env node
/**
 * Print ~/.linkedin-ads-mcp/tokens.json as one line for LINKEDIN_TOKENS_JSON on Render.
 * Does not print to logs if you redirect: npm run print-tokens > /tmp/tokens.line
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tokenPath =
  process.env.TOKEN_STORAGE_PATH ||
  path.join(os.homedir(), '.linkedin-ads-mcp', 'tokens.json');

if (!fs.existsSync(tokenPath)) {
  console.error(`No tokens file at ${tokenPath}. Run npm run auth first.`);
  process.exit(1);
}

const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
if (!tokens.access_token) {
  console.error('tokens.json is missing access_token');
  process.exit(1);
}

process.stdout.write(JSON.stringify(tokens));
