/**
 * Fetch a public image URL for LinkedIn upload.
 * Agents pass HTTPS image URLs; this module downloads bytes with basic SSRF guards.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
};

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid imageUrl: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('imageUrl must be an http or https URL');
  }

  if (isPrivateHostname(url.hostname)) {
    throw new Error('imageUrl must not point to a private or local host');
  }

  return url;
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some(n => n > 255)) return false;
    const [a, b] = octets;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  return false;
}

export function contentTypeFromImageResponse(
  headerValue: string | null,
  pathname: string
): string {
  const headerType = (headerValue || '').split(';')[0].trim().toLowerCase();
  if (headerType && ALLOWED_CONTENT_TYPES[headerType]) {
    return ALLOWED_CONTENT_TYPES[headerType];
  }

  const extMatch = pathname.toLowerCase().match(/\.(jpe?g|png|gif)(?:$|\?)/);
  if (extMatch) {
    const ext = `.${extMatch[1] === 'jpeg' ? 'jpeg' : extMatch[1]}`;
    const mapped = EXT_TO_CONTENT_TYPE[ext === '.jpg' ? '.jpg' : ext];
    if (mapped) return mapped;
  }

  throw new Error(
    `imageUrl must return JPEG, PNG, or GIF (got content-type "${headerType || 'unknown'}")`
  );
}

export async function fetchImageFromUrl(
  imageUrl: string
): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }> {
  const url = assertPublicHttpUrl(imageUrl);
  const response = await fetch(url.toString(), {
    redirect: 'follow',
    headers: {
      Accept: 'image/jpeg,image/png,image/gif,image/*;q=0.8',
      'User-Agent': 'linkedin-mcp-image-fetch/1.3',
    },
  });

  const finalUrl = response.url || url.toString();
  try {
    const finalParsed = new URL(finalUrl);
    if (isPrivateHostname(finalParsed.hostname)) {
      throw new Error('imageUrl redirected to a private or local host');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('private or local')) {
      throw error;
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to download imageUrl (${response.status}): ${imageUrl}`);
  }

  const contentType = contentTypeFromImageResponse(
    response.headers.get('content-type'),
    new URL(finalUrl).pathname
  );

  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader) {
    const declared = Number(lengthHeader);
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      throw new Error(`imageUrl is larger than ${MAX_IMAGE_BYTES} bytes`);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 32) {
    throw new Error('imageUrl did not return image bytes');
  }
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`imageUrl is larger than ${MAX_IMAGE_BYTES} bytes`);
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
    finalUrl,
  };
}
