// ============================================================
// Gravatar URL helper — computes MD5-based Gravatar URLs
// ============================================================

/**
 * Computes the Gravatar URL for a given email address.
 * Uses d=404 so the caller can detect missing avatars via onerror.
 */
export async function gravatarUrl(
  email: string,
  size: number = 80,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const hash = await md5Hex(normalized);
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/** Default profile image path. */
export const DEFAULT_PROFILE_IMAGE = "/static/images/panda.png";

/**
 * Sets the src of an <img> element to the Gravatar URL if useGravatar is true,
 * otherwise uses the default. Adds an onerror fallback either way.
 */
export async function applyProfileImage(
  img: HTMLImageElement,
  email: string | undefined,
  useGravatar: boolean,
  size: number = 80,
): Promise<void> {
  img.onerror = function (this: HTMLImageElement) {
    this.onerror = null;
    this.src = DEFAULT_PROFILE_IMAGE;
  };

  if (useGravatar && email) {
    img.src = await gravatarUrl(email, size);
  } else {
    img.src = DEFAULT_PROFILE_IMAGE;
  }
}

// ---- MD5 implementation using SubtleCrypto ----

async function md5Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  // SubtleCrypto doesn't support MD5, so we use a minimal pure-JS MD5.
  return md5(data);
}

// Minimal MD5 implementation (RFC 1321) for Gravatar hashing only.
// This avoids pulling in a dependency for a single use case.
function md5(bytes: Uint8Array): string {
  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23,
    4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    6, 10, 15, 21,
  ];

  // Pre-processing: pad message
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length % 64 < 56 ? 56 : 120) - (bytes.length % 64);
  const padded = new Uint8Array(bytes.length + padLen + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301 >>> 0;
  let b0 = 0xefcdab89 >>> 0;
  let c0 = 0x98badcfe >>> 0;
  let d0 = 0x10325476 >>> 0;

  for (let i = 0; i < padded.length; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(i + j * 4, true);
    }

    let A = a0,
      B = b0,
      C = c0,
      D = d0;

    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      F = (F + A + K[j] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  function toHex(n: number): string {
    const bytes = [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}
