import type { PdfImage } from './writer';

/*
 * Turns a logo file into what a PDF stores. A JPEG goes in untouched. A PNG is unpacked into
 * colour and transparency, using the inflate and deflate built into browsers and Node 18+
 * (`DecompressionStream`), which is why this is async and still pulls in no library.
 */

/** Where a logo can come from: its bytes, a `File` or `Blob`, or a URL (a `data:` URL included). */
export type PdfImageSource = Uint8Array | ArrayBuffer | Blob | string;

async function toBytes(source: PdfImageSource): Promise<Uint8Array> {
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    if (typeof source !== 'string') return new Uint8Array(await source.arrayBuffer());
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not load the image (${response.status}): ${source.slice(0, 80)}`);
    return new Uint8Array(await response.arrayBuffer());
}

const through = async (data: Uint8Array, stream: { readable: ReadableStream; writable: WritableStream }) =>
    new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
const inflate = (data: Uint8Array) => through(data, new DecompressionStream('deflate'));
const deflate = (data: Uint8Array) => through(data, new CompressionStream('deflate'));

const u16 = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!;
const u32 = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | u16(bytes, at + 2)) >>> 0;

/** A JPEG is stored as it is: only its size and colour model are read, from the frame header. */
function jpeg(bytes: Uint8Array): PdfImage {
    for (let at = 2; at + 9 < bytes.length;) {
        if (bytes[at] !== 0xff) break;
        const marker = bytes[at + 1]!;
        // Start-of-frame markers, less the three in that range that are something else.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const components = bytes[at + 9]!;
            return {
                width: u16(bytes, at + 7),
                height: u16(bytes, at + 5),
                data: bytes,
                filter: 'DCTDecode',
                colourSpace: components === 1 ? 'DeviceGray' : components === 4 ? 'DeviceCMYK' : 'DeviceRGB',
            };
        }
        at += 2 + u16(bytes, at + 2);
    }
    throw new Error('That JPEG has no readable size.');
}

/** Undoes PNG's per-row filters in place and returns the rows without their filter bytes. */
function unfilter(raw: Uint8Array, stride: number, bpp: number, height: number): Uint8Array {
    const out = new Uint8Array(stride * height);
    for (let row = 0; row < height; row++) {
        const type = raw[row * (stride + 1)];
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

async function png(bytes: Uint8Array): Promise<PdfImage> {
    let header: { width: number; height: number; depth: number; type: number } | undefined;
    let palette: Uint8Array | undefined;
    let transparency: Uint8Array | undefined;
    const data: Uint8Array[] = [];
    for (let at = 8; at + 8 <= bytes.length;) {
        const size = u32(bytes, at);
        const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        const body = bytes.subarray(at + 8, at + 8 + size);
        if (name === 'IHDR') {
            header = { width: u32(body, 0), height: u32(body, 4), depth: body[8]!, type: body[9]! };
            if (body[12]) throw new Error('Interlaced PNGs are not supported: save the logo without interlacing.');
        } else if (name === 'PLTE') palette = body;
        else if (name === 'tRNS') transparency = body;
        else if (name === 'IDAT') data.push(body);
        at += size + 12;
    }
    if (!header || !data.length) throw new Error('That PNG is incomplete.');
    const { width, height, depth, type } = header;
    if (depth === 16 || (depth < 8 && type !== 3))
        throw new Error('Only 8-bit PNGs are supported: save the logo as an 8-bit PNG.');

    const joined = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0));
    data.reduce((at, part) => (joined.set(part, at), at + part.length), 0);
    // Samples per pixel: grey 1, RGB 3, palette index 1, grey + alpha 2, RGBA 4.
    const channels = [1, 0, 3, 1, 2, 0, 4][type] ?? 0;
    if (!channels) throw new Error('That PNG has an unknown colour type.');
    const stride = Math.ceil((width * channels * depth) / 8);
    const rows = unfilter(await inflate(joined), stride, Math.max(1, (channels * depth) >> 3), height);

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
                [r, g, b] = [palette?.[index * 3] ?? 0, palette?.[index * 3 + 1] ?? 0, palette?.[index * 3 + 2] ?? 0];
                alpha[pixel] = transparency?.[index] ?? 255;
            } else if (channels <= 2) {
                r = g = b = rows[at]!;
                if (channels === 2) alpha[pixel] = rows[at + 1]!;
            } else {
                [r, g, b] = [rows[at]!, rows[at + 1]!, rows[at + 2]!];
                if (channels === 4) alpha[pixel] = rows[at + 3]!;
            }
            colour.set([r, g, b], pixel * 3);
        }
    }
    return {
        width,
        height,
        data: await deflate(colour),
        filter: 'FlateDecode',
        colourSpace: 'DeviceRGB',
        ...(alpha.some((value) => value < 255) && { alpha: await deflate(alpha) }),
    };
}

/**
 * Reads a JPEG or PNG logo into the form the PDF functions embed. They call this for you; call
 * it yourself to prepare a logo once and reuse it across many documents.
 */
export async function pdfImage(source: PdfImageSource): Promise<PdfImage> {
    const bytes = await toBytes(source);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
    if (u32(bytes, 0) === 0x89504e47) return png(bytes);
    throw new Error('The logo must be a JPEG or a PNG.');
}
