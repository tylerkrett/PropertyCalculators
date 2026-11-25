import type { PdfImage } from './writer';
import { deflateZlib, inflateZlib } from './zlib';

/*
 * Unpacks a PNG into the colour and transparency a PDF stores, using the inflate and deflate
 * built into browsers and Node 18+ (`DecompressionStream`), so no library is pulled in. Where
 * those are missing, as in React Native, the plain JavaScript ones in `zlib.ts` do the same job.
 *
 * A logo can come from anyone, so nothing in the file is trusted: the size it claims is checked
 * against a budget before any memory is set aside, and its pixel data must inflate to exactly
 * the size that goes with those dimensions.
 */

/** The longest side, in pixels, a PNG logo may have. */
export const PDF_IMAGE_MAX_SIDE = 4096;
/** The most pixels a PNG logo may have: 16 megapixels. */
export const PDF_IMAGE_MAX_PIXELS = 16_000_000;

const bad = (message: string) => new RangeError(message);
const DAMAGED = 'That PNG is damaged: its pixel data does not match its size.';

const u16 = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!;
const u32 = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | u16(bytes, at + 2)) >>> 0;

/** Whether the engine can inflate and deflate by itself: browsers and Node can, React Native cannot. */
const hasStreams = () =>
    typeof DecompressionStream === 'function' &&
    typeof CompressionStream === 'function' &&
    typeof Response === 'function' &&
    typeof Blob === 'function' &&
    typeof Blob.prototype.stream === 'function';

/** Inflates `data`, which must come to exactly `size` bytes; reading stops as soon as it is longer. */
async function inflate(data: Uint8Array, size: number): Promise<Uint8Array> {
    if (!hasStreams()) {
        try {
            return inflateZlib(data, size);
        } catch {
            throw bad(DAMAGED);
        }
    }
    const out = new Uint8Array(size);
    const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    let at = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (at + value.length > size) throw bad(DAMAGED);
            out.set(value, at);
            at += value.length;
        }
    } catch {
        // Too long, cut short or not deflate data at all: stop the stream and say so.
        await reader.cancel().catch(() => undefined);
        throw bad(DAMAGED);
    }
    if (at !== size) throw bad(DAMAGED);
    return out;
}

const deflate = async (data: Uint8Array) =>
    hasStreams()
        ? new Uint8Array(
              await new Response(
                  new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate')),
              ).arrayBuffer(),
          )
        : deflateZlib(data);

/** Undoes PNG's per-row filters and returns the rows without their filter bytes. */
function unfilter(raw: Uint8Array, stride: number, bpp: number, height: number): Uint8Array {
    const out = new Uint8Array(stride * height);
    for (let row = 0; row < height; row++) {
        const type = raw[row * (stride + 1)]!;
        if (type > 4) throw bad(DAMAGED);
        const from = row * (stride + 1) + 1;
        const to = row * stride;
        for (let i = 0; i < stride; i++) {
            const left = i >= bpp ? out[to + i - bpp]! : 0;
            const up = row ? out[to + i - stride]! : 0;
            const corner = row && i >= bpp ? out[to + i - stride - bpp]! : 0;
            let predicted = 0;
            if (type === 1) predicted = left;
            else if (type === 2) predicted = up;
            else if (type === 3) predicted = (left + up) >> 1;
            else if (type === 4) {
                const [a, b, c] = [Math.abs(up - corner), Math.abs(left - corner), Math.abs(left + up - 2 * corner)];
                predicted = a <= b && a <= c ? left : b <= c ? up : corner;
            }
            out[to + i] = (raw[from + i]! + predicted) & 0xff;
        }
    }
    return out;
}

interface Chunks {
    width: number;
    height: number;
    depth: number;
    type: number;
    palette?: Uint8Array;
    transparency?: Uint8Array;
    data: Uint8Array;
}

/** Walks the file's chunks, checking the header against the pixel budget as soon as it is read. */
function readChunks(bytes: Uint8Array): Chunks {
    let header: Pick<Chunks, 'width' | 'height' | 'depth' | 'type'> | undefined;
    let palette: Uint8Array | undefined;
    let transparency: Uint8Array | undefined;
    const data: Uint8Array[] = [];
    for (let at = 8; at + 8 <= bytes.length;) {
        const size = u32(bytes, at);
        const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        const body = bytes.subarray(at + 8, at + 8 + size);
        if (name === 'IHDR') {
            if (body.length < 13) throw bad('That PNG is incomplete.');
            header = { width: u32(body, 0), height: u32(body, 4), depth: body[8]!, type: body[9]! };
            if (body[12]) throw bad('Interlaced PNGs are not supported: save the logo without interlacing.');
        } else if (name === 'PLTE') palette = body;
        else if (name === 'tRNS') transparency = body;
        else if (name === 'IDAT') data.push(body);
        at += size + 12;
    }
    if (!header || !data.length) throw bad('That PNG is incomplete.');
    const { width, height } = header;
    if (!width || !height) throw bad('That PNG has no size: its width or height is zero.');
    if (width > PDF_IMAGE_MAX_SIDE || height > PDF_IMAGE_MAX_SIDE || width * height > PDF_IMAGE_MAX_PIXELS)
        throw bad(
            `That PNG is too large (${width} x ${height}): a logo can be up to ${PDF_IMAGE_MAX_SIDE} pixels a side and ${PDF_IMAGE_MAX_PIXELS / 1e6} megapixels.`,
        );
    const joined = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0));
    data.reduce((at, part) => (joined.set(part, at), at + part.length), 0);
    return { ...header, palette, transparency, data: joined };
}

/** Reads a PNG's bytes into a `PdfImage`. Rejects with a `RangeError` for a file it cannot use. */
export async function png(bytes: Uint8Array): Promise<PdfImage> {
    const { width, height, depth, type, palette, transparency, data } = readChunks(bytes);
    // Samples per pixel: grey 1, RGB 3, palette index 1, grey + alpha 2, RGBA 4.
    const channels = [1, 0, 3, 1, 2, 0, 4][type] ?? 0;
    if (!channels) throw bad('That PNG has an unknown colour type.');
    if (type === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8)
        throw bad('Only 8-bit PNGs are supported: save the logo as an 8-bit PNG.');
    if (type === 3 && !palette) throw bad('That PNG is damaged: it has no palette.');

    const stride = Math.ceil((width * channels * depth) / 8);
    const raw = await inflate(data, (stride + 1) * height);
    const rows = unfilter(raw, stride, Math.max(1, (channels * depth) >> 3), height);
    // Without an alpha channel, one colour can be named as fully transparent (16 bits a sample).
    const key =
        type === 0 && transparency && transparency.length >= 2
            ? [transparency[1]!, transparency[1]!, transparency[1]!]
            : type === 2 && transparency && transparency.length >= 6
              ? [transparency[1]!, transparency[3]!, transparency[5]!]
              : undefined;

    const colour = new Uint8Array(width * height * 3);
    const alpha = new Uint8Array(width * height).fill(255);
    for (let y = 0, pixel = 0; y < height; y++) {
        for (let x = 0; x < width; x++, pixel++) {
            const at = y * stride + x * channels;
            let r: number, g: number, b: number;
            if (type === 3) {
                // A palette index, packed `depth` bits at a time from the top of each byte.
                const bit = x * depth;
                const index = (rows[y * stride + (bit >> 3)]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
                if (index * 3 + 2 >= palette!.length) throw bad('That PNG is damaged: a pixel is not in its palette.');
                [r, g, b] = [palette![index * 3]!, palette![index * 3 + 1]!, palette![index * 3 + 2]!];
                alpha[pixel] = transparency?.[index] ?? 255;
            } else if (channels <= 2) {
                r = g = b = rows[at]!;
                if (channels === 2) alpha[pixel] = rows[at + 1]!;
            } else {
                [r, g, b] = [rows[at]!, rows[at + 1]!, rows[at + 2]!];
                if (channels === 4) alpha[pixel] = rows[at + 3]!;
            }
            if (key && r === key[0] && g === key[1] && b === key[2]) alpha[pixel] = 0;
            colour[pixel * 3] = r;
            colour[pixel * 3 + 1] = g;
            colour[pixel * 3 + 2] = b;
        }
    }
    return {
        width,
        height,
        data: await deflate(colour),
        filter: 'FlateDecode',
        colourSpace: 'DeviceRGB',
        bitsPerComponent: 8,
        ...(alpha.some((value) => value < 255) && { alpha: await deflate(alpha) }),
    };
}
