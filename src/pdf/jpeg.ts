import type { PdfImage } from './writer';

/*
 * A JPEG goes into a PDF as it is: only its size, depth and colour model are read, from the
 * frame header. EXIF orientation is not applied, so a photo saved sideways with a "rotate me"
 * tag prints sideways: export the logo upright.
 */

const bad = (message: string) => new RangeError(message);
const u16 = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!;
const COLOUR_SPACES = { 1: 'DeviceGray', 3: 'DeviceRGB', 4: 'DeviceCMYK' } as const;

/**
 * Reads a JPEG's frame header into a `PdfImage` that holds the file untouched. Throws a
 * `RangeError` for one a PDF cannot show.
 */
export function jpeg(bytes: Uint8Array): PdfImage {
    for (let at = 2; at + 3 < bytes.length;) {
        if (bytes[at] !== 0xff) break;
        const marker = bytes[at + 1]!;
        if (marker === 0xff) {
            // A fill byte: any number of these may come before a marker.
            at++;
            continue;
        }
        // Markers that stand alone, with no length after them.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
            at += 2;
            continue;
        }
        // The picture itself, or the end of the file: any frame header would have come before.
        if (marker === 0xda || marker === 0xd9) break;
        // Start-of-frame markers, less the three in that range that are something else.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            if (at + 9 >= bytes.length) break;
            if (marker > 0xc2)
                throw bad('Only baseline and progressive JPEGs are supported: save the logo as a standard JPEG.');
            const bits = bytes[at + 4]!;
            const [height, width, components] = [u16(bytes, at + 5), u16(bytes, at + 7), bytes[at + 9]!];
            if (bits !== 8) throw bad(`${bits}-bit JPEGs are not supported: save the logo as a standard 8-bit JPEG.`);
            if (!width || !height) throw bad('That JPEG has no size: its width or height is zero.');
            const colourSpace = COLOUR_SPACES[components as 1 | 3 | 4];
            if (!colourSpace) throw bad(`That JPEG has ${components} colour components: only 1, 3 or 4 can be used.`);
            return { width, height, data: bytes, filter: 'DCTDecode', colourSpace, bitsPerComponent: bits };
        }
        const length = u16(bytes, at + 2);
        if (length < 2) break;
        at += 2 + length;
    }
    throw bad('That JPEG has no readable size.');
}
