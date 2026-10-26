import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPublicHttpUrl,
  contentTypeFromImageResponse,
  isPrivateHostname,
} from './image-from-url.js';

test('assertPublicHttpUrl accepts https image URLs', () => {
  const url = assertPublicHttpUrl('https://cdn.example.com/posts/card.png');
  assert.equal(url.hostname, 'cdn.example.com');
});

test('assertPublicHttpUrl rejects non-http schemes and localhost', () => {
  assert.throws(() => assertPublicHttpUrl('ftp://cdn.example.com/a.png'), /http or https/);
  assert.throws(() => assertPublicHttpUrl('not a url'), /Invalid imageUrl/);
  assert.throws(() => assertPublicHttpUrl('http://localhost/secret.png'), /private or local/);
  assert.throws(() => assertPublicHttpUrl('http://127.0.0.1/secret.png'), /private or local/);
  assert.throws(() => assertPublicHttpUrl('http://192.168.1.4/secret.png'), /private or local/);
});

test('isPrivateHostname covers RFC1918 and loopback', () => {
  assert.equal(isPrivateHostname('10.0.0.8'), true);
  assert.equal(isPrivateHostname('172.16.0.4'), true);
  assert.equal(isPrivateHostname('cdn.linkedin.com'), false);
});

test('contentTypeFromImageResponse maps headers and extensions', () => {
  assert.equal(contentTypeFromImageResponse('image/jpeg; charset=binary', '/x'), 'image/jpeg');
  assert.equal(contentTypeFromImageResponse('image/png', '/x'), 'image/png');
  assert.equal(contentTypeFromImageResponse(null, '/posts/card.PNG'), 'image/png');
  assert.throws(
    () => contentTypeFromImageResponse('text/html', '/index.html'),
    /JPEG, PNG, or GIF/
  );
});
