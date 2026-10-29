/**
 * Fetch a public MP4 URL for LinkedIn video upload.
 */

import { assertPublicHttpUrl, isPrivateHostname } from './image-from-url.js';

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'application/mp4', 'application/octet-stream']);

export function contentTypeFromVideoResponse(
  headerValue: string | null,
  pathname: string
): string {
  const headerType = (headerValue || '').split(';')[0].trim().toLowerCase();
  if (headerType === 'video/mp4' || headerType === 'application/mp4') {
    return 'video/mp4';
  }
  if (pathname.toLowerCase().match(/\.mp4(?:$|\?)/)) {
    return 'video/mp4';
  }
  if (headerType && ALLOWED_VIDEO_TYPES.has(headerType)) {
    return 'video/mp4';
  }
  throw new Error(
    `videoUrl must be MP4 (got content-type "${headerType || 'unknown'}")`
  );
}

export async function fetchVideoFromUrl(
  videoUrl: string
): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }> {
  const url = assertPublicHttpUrl(videoUrl);
  const response = await fetch(url.toString(), {
    redirect: 'follow',
    headers: {
      Accept: 'video/mp4,application/octet-stream',
      'User-Agent': 'linkedin-mcp-video-fetch/1.3',
    },
  });

  const finalUrl = response.url || url.toString();
  const finalParsed = new URL(finalUrl);
  if (isPrivateHostname(finalParsed.hostname)) {
    throw new Error('videoUrl redirected to a private or local host');
  }

  if (!response.ok) {
    throw new Error(`Failed to download videoUrl (${response.status}): ${videoUrl}`);
  }

  const contentType = contentTypeFromVideoResponse(
    response.headers.get('content-type'),
    finalParsed.pathname
  );

  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader) {
    const declared = Number(lengthHeader);
    if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES) {
      throw new Error(`videoUrl is larger than ${MAX_VIDEO_BYTES} bytes (500MB LinkedIn limit)`);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 75_000) {
    throw new Error('videoUrl is too small (LinkedIn minimum ~75KB)');
  }
  if (arrayBuffer.byteLength > MAX_VIDEO_BYTES) {
    throw new Error(`videoUrl is larger than ${MAX_VIDEO_BYTES} bytes (500MB LinkedIn limit)`);
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
    finalUrl,
  };
}
