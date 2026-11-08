import type { ImageExt, Photo } from '../types/inventory';
import { uid } from '../utils/ids';

export type DetectedFormat = ImageExt | 'bmp' | 'webp' | 'tiff' | 'emf' | 'wmf' | 'svg' | 'unknown';

/** Detects an image format from its bytes (file extensions inside workbooks are not trustworthy). */
export function detectImageFormat(b: Uint8Array): DetectedFormat {
  if (b.length < 12) return 'unknown';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return 'webp';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'tiff';
  if (b[0] === 0xd7 && b[1] === 0xcd && b[2] === 0xc6 && b[3] === 0x9a) return 'wmf';
  if (b[0] === 0x01 && b[1] === 0x00 && b[2] === 0x00 && b[3] === 0x00 && b[40] === 0x20 && b[41] === 0x45 && b[42] === 0x4d && b[43] === 0x46)
    return 'emf';
  const head = new TextDecoder().decode(b.slice(0, 256)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return 'unknown';
}

export const MIME: Record<ImageExt, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };

/** Formats that can be embedded in the exported workbook as-is. */
export function isEmbeddable(f: DetectedFormat): f is ImageExt {
  return f === 'png' || f === 'jpeg' || f === 'gif';
}

function makeObjectUrl(bytes: Uint8Array, mime: string): string {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
      return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    }
  } catch {
    /* non-browser environment */
  }
  return '';
}

/** Reads the pixel size from PNG / JPEG / GIF headers without decoding the image. */
export function readImageSize(b: Uint8Array, ext: ImageExt): { width: number; height: number } | undefined {
  try {
    if (ext === 'png') {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return { width: dv.getUint32(16), height: dv.getUint32(20) };
    }
    if (ext === 'gif') return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
    if (ext === 'jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = b[i + 1];
        const len = (b[i + 2] << 8) | b[i + 3];
        // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
        }
        i += 2 + len;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function createPhoto(bytes: Uint8Array, ext: ImageExt, origin: Photo['origin']): Photo {
  const mime = MIME[ext];
  const size = readImageSize(bytes, ext);
  return { key: uid('ph'), bytes, ext, mime, url: makeObjectUrl(bytes, mime), width: size?.width, height: size?.height, origin };
}

export function releasePhoto(photo: Photo | null | undefined) {
  if (photo?.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(photo.url);
    } catch {
      /* ignore */
    }
  }
}

// ---------- Browser-only helpers (canvas) ----------

async function decodeToCanvas(blob: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  if (typeof createImageBitmap === 'function') {
    // "from-image" applies the phone's EXIF rotation.
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    source = bmp;
    w = bmp.width;
    h = bmp.height;
  } else {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('The image could not be decoded.'));
        el.src = url;
      });
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source && typeof source.close === 'function') source.close();
  return canvas;
}

function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('Could not encode the image.'));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      type,
      quality,
    );
  });
}

const MAX_SIDE = 1600;

/**
 * Prepares a camera/gallery photo for embedding: fixes rotation, limits the size
 * to keep the workbook small, and converts to JPEG.
 */
export async function processPhotoFile(file: Blob): Promise<Photo> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const fmt = detectImageFormat(head.length >= 12 ? head : new Uint8Array(12));
  // Small PNG/GIF files (e.g. screenshots, logos with transparency) are kept untouched.
  if ((fmt === 'png' || fmt === 'gif') && file.size < 1024 * 1024) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = readImageSize(bytes, fmt);
    if (size && Math.max(size.width, size.height) <= MAX_SIDE) return createPhoto(bytes, fmt, 'new');
  }
  let canvas: HTMLCanvasElement;
  try {
    canvas = await decodeToCanvas(file, MAX_SIDE);
  } catch {
    throw new Error('This image format cannot be read by your browser. Please use a JPG or PNG photo.');
  }
  const bytes = await canvasToBytes(canvas, 'image/jpeg', 0.85);
  return createPhoto(bytes, 'jpeg', 'new');
}

/** Converts browser-decodable but non-embeddable formats (BMP, WebP) to PNG. */
export async function convertToPng(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = await decodeToCanvas(new Blob([bytes as BlobPart], { type: mime }), 4096);
    return await canvasToBytes(canvas, 'image/png');
  } catch {
    return null;
  }
}
