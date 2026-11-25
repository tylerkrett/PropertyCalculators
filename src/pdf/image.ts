import { base64Decode, utf8Encode } from '../bytes';
import { jpeg } from './jpeg';
import { png } from './png';
import type { PdfImage } from './writer';

/*
 * Turns a logo file into what a PDF stores. A JPEG goes in untouched (`jpeg.ts`); a PNG is
 * unpacked into colour and transparency (`png.ts`), which is why this is async. A logo given as
 * a URL is downloaded here, up to a fixed size.
 *
 * React Native's `fetch` has no streaming body, its `Blob` has had no `arrayBuffer()` and it may
 * refuse a `data:` URL, so each of those has a second route here that needs none of them.
 */

export { PDF_IMAGE_MAX_PIXELS, PDF_IMAGE_MAX_SIDE } from './png';

/** Where a logo can come from: its bytes, a `File` or `Blob`, or a URL (a `data:` URL included). */
export type PdfImageSource = Uint8Array | ArrayBuffer | Blob | string;

/** The most a logo given as a URL may weigh once downloaded: 5 MB. */
export const PDF_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** A URL as it is safe to show in an error: no query string or fragment, and no `data:` payload. */
const describe = (url: string) => (/^data:/i.test(url) ? 'a data: URL' : url.split(/[?#]/)[0]!.slice(0, 80));

/** The bytes a `data:` URL holds, base64 or percent-encoded, or `null` when it is not one that can be read. */
function dataUrlBytes(url: string): Uint8Array | null {
    const [, base64, payload] = /^data:[^,]*?(;base64)?,(.*)$/is.exec(url) ?? [];
    if (payload === undefined) return null;
    try {
        return base64 ? base64Decode(decodeURIComponent(payload)) : utf8Encode(decodeURIComponent(payload));
    } catch {
        return null;
    }
}

/** A `Blob`'s bytes. Without `arrayBuffer()` it is read as a `data:` URL, which every engine can do. */
async function blobBytes(blob: Blob): Promise<Uint8Array> {
    if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
    const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
        reader.readAsDataURL(blob);
    });
    const bytes = dataUrlBytes(url);
    if (!bytes) throw new Error('Could not read the image.');
    return bytes;
}

/** Downloads a logo, giving up as soon as it is known to be over the size limit. */
async function download(url: string): Promise<Uint8Array> {
    const tooLarge = () =>
        new RangeError(`The image is larger than ${PDF_IMAGE_MAX_BYTES / 1024 / 1024} MB: ${describe(url)}`);
    let response: Response;
    try {
        response = await fetch(url);
    } catch (error) {
        // Not every `fetch` takes a `data:` URL, and that one needs no network to read.
        const bytes = dataUrlBytes(url);
        if (!bytes) throw error;
        if (bytes.length > PDF_IMAGE_MAX_BYTES) throw tooLarge();
        return bytes;
    }
    if (!response.ok) throw new Error(`Could not load the image (${response.status}): ${describe(url)}`);
    if (Number(response.headers.get('content-length')) > PDF_IMAGE_MAX_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        throw tooLarge();
    }
    // The declared length can be missing or wrong, so the body is counted as it arrives.
    const reader = response.body?.getReader();
    if (!reader) {
        // No stream to count, as in React Native: take the body whole, by whichever way works.
        const whole = typeof response.blob === 'function' && typeof Blob === 'function';
        const bytes = whole ? await blobBytes(await response.blob()) : new Uint8Array(await response.arrayBuffer());
        if (bytes.length > PDF_IMAGE_MAX_BYTES) throw tooLarge();
        return bytes;
    }
    const parts: Uint8Array[] = [];
    let length = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > PDF_IMAGE_MAX_BYTES) {
            await reader.cancel().catch(() => undefined);
            throw tooLarge();
        }
        parts.push(value);
    }
    const bytes = new Uint8Array(length);
    parts.reduce((at, part) => (bytes.set(part, at), at + part.length), 0);
    return bytes;
}

async function toBytes(source: PdfImageSource): Promise<Uint8Array> {
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    if (typeof source === 'string') return download(source);
    return blobBytes(source);
}

/**
 * Reads a JPEG or PNG logo into the form the PDF functions embed. They call this for you; call
 * it yourself to prepare a logo once and reuse it across many documents.
 *
 * A PNG may be up to `PDF_IMAGE_MAX_SIDE` pixels a side and `PDF_IMAGE_MAX_PIXELS` in all, and a
 * logo given as a URL up to `PDF_IMAGE_MAX_BYTES`; a file that is larger, damaged or of a kind a
 * PDF cannot hold is rejected with a `RangeError`.
 *
 * **On a server, never pass a URL that came from a user.** A string is fetched from wherever it
 * points, which would let anyone make your server request addresses inside your network. Fetch
 * logos yourself from places you trust and pass the bytes.
 */
export async function pdfImage(source: PdfImageSource): Promise<PdfImage> {
    const bytes = await toBytes(source);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return png(bytes);
    throw new RangeError('The logo must be a JPEG or a PNG.');
}
