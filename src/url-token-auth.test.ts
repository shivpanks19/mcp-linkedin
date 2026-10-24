import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProtectedPath,
  isPublicPath,
  pathTokenAndRewrittenPath,
  rewritePathTokenUrl,
  tokenMatches,
} from './url-token-auth.js';

test('public paths are /, /health', () => {
  assert.equal(isPublicPath('/'), true);
  assert.equal(isPublicPath('/health'), true);
  assert.equal(isPublicPath('/mcp'), false);
});

test('protected paths include /mcp and prefixes', () => {
  assert.equal(isProtectedPath('/mcp'), true);
  assert.equal(isProtectedPath('/mcp/'), true);
  assert.equal(isProtectedPath('/sse'), true);
  assert.equal(isProtectedPath('/messages'), true);
  assert.equal(isProtectedPath('/health'), false);
});

test('path token rewrite extracts /<token>/mcp', () => {
  assert.deepEqual(pathTokenAndRewrittenPath('/secret/mcp'), {
    token: 'secret',
    rewritten: '/mcp',
  });
  assert.deepEqual(rewritePathTokenUrl('/secret/mcp?foo=1'), {
    token: 'secret',
    url: '/mcp?foo=1',
  });
  assert.deepEqual(rewritePathTokenUrl('/mcp'), {
    token: '',
    url: '/mcp',
  });
});

test('tokenMatches is length-safe', () => {
  assert.equal(tokenMatches('secret', 'secret'), true);
  assert.equal(tokenMatches('secret', 'wrong'), false);
  assert.equal(tokenMatches('secret', ''), false);
  assert.equal(tokenMatches('', 'secret'), false);
});
