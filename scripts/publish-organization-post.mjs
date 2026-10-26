#!/usr/bin/env node
/**
 * Publish an organic company-page post with optional image.
 * Usage:
 *   node scripts/publish-organization-post.mjs --org 12345 --text "Hello" --confirm
 *   node scripts/publish-organization-post.mjs --org 12345 --file post.md --image ./card.jpg --confirm
 *   node scripts/publish-organization-post.mjs --org 12345 --text "Hello" --image-url https://cdn.example.com/card.jpg --cta-url https://example.com --confirm
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { LinkedInApiClient } from '../dist/lib/linkedin-api.js';
import { TokenStore } from '../dist/auth/token-store.js';

function parseArgs(argv) {
  const out = { confirm: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--confirm') out.confirm = true;
    else if (a === '--org') out.org = argv[++i];
    else if (a === '--text') out.text = argv[++i];
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--image') out.image = argv[++i];
    else if (a === '--image-url') out.imageUrl = argv[++i];
    else if (a === '--cta-url') out.ctaUrl = argv[++i];
    else if (a === '--cta-label') out.ctaLabel = argv[++i];
  }
  return out;
}

function extractPostBody(markdown) {
  const start = markdown.indexOf('## Post copy');
  if (start === -1) return markdown.trim();
  const slice = markdown.slice(start);
  const end = slice.indexOf('\n---\n');
  const block = end === -1 ? slice : slice.slice(0, end);
  const lines = block.split('\n').slice(1);
  const body = [];
  for (const line of lines) {
    if (line.startsWith('## ')) break;
    body.push(line);
  }
  return body.join('\n').trim();
}

async function main() {
  const args = parseArgs(process.argv);
  const org = args.org || process.env.LINKEDIN_ORGANIZATION_ID;
  if (!org) {
    console.error('Missing --org or LINKEDIN_ORGANIZATION_ID');
    process.exit(1);
  }
  if (!args.confirm) {
    console.error('Pass --confirm to publish live');
    process.exit(1);
  }

  let commentary = args.text;
  if (args.file) {
    const md = fs.readFileSync(path.resolve(args.file), 'utf8');
    commentary = extractPostBody(md);
  }
  if (!commentary?.trim()) {
    console.error('No post text (--text or --file)');
    process.exit(1);
  }

  if (args.image && args.imageUrl) {
    console.error('Pass only one of --image or --image-url');
    process.exit(1);
  }

  const client = new LinkedInApiClient(new TokenStore());
  let imageUrn;
  if (args.imageUrl) {
    const uploaded = await client.uploadImage({ owner: org, imageUrl: args.imageUrl });
    imageUrn = uploaded.imageUrn;
    console.error('Uploaded image from URL:', imageUrn);
  } else if (args.image) {
    const imagePath = path.resolve(args.image);
    const uploaded = await client.uploadImage({ owner: org, filePath: imagePath });
    imageUrn = uploaded.imageUrn;
    console.error('Uploaded image:', imageUrn);
  }

  const result = await client.createOrganicOrganizationPost({
    organizationId: org,
    commentary,
    imageUrn,
    contentLandingPage: imageUrn ? args.ctaUrl : undefined,
    contentCallToActionLabel: imageUrn && args.ctaUrl ? (args.ctaLabel || 'LEARN_MORE') : undefined,
  });

  console.log(JSON.stringify({
    success: true,
    postId: result.postId,
    organizationId: org,
    imageUrn: imageUrn || undefined,
    ctaUrl: args.ctaUrl || undefined,
  }, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
