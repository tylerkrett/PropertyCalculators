import { utf8Encode } from '../bytes';
import { infoString, literal, textWidth } from './text';

/*
 * The smallest PDF writer that will do: A4 pages of text, lines and one image, in the two
 * Helvetica faces every PDF reader has built in. No font is embedded and nothing is imported, so
 * a finished estimate is a few kilobytes and this file is most of the cost of the feature.
 *
 * Because no font is embedded, printed text is limited to Latin-1 and the few extra characters
 * of WinAnsi: see `text.ts` for what happens to the rest.
 */

export { literal, textWidth, wrapText } from './text';

export type Rgb = readonly [number, number, number];

/** An image ready to embed. Make one with `pdfImage`. */
export interface PdfImage {
    /** Size in pixels: whole numbers above zero. */
    width: number;
    height: number;
    /** The pixel data as the PDF stores it: a whole JPEG file, or deflated samples. */
    data: Uint8Array;
    filter: 'DCTDecode' | 'FlateDecode';
    colourSpace: 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK';
    /** Bits per colour sample: 1, 2, 4, 8 or 16. Defaults to 8. */
    bitsPerComponent?: number;
    /** Deflated 8-bit transparency, one sample per pixel, when the image has any. */
    alpha?: Uint8Array;
}

export const PAGE = { width: 595.28, height: 841.89, margin: 56 } as const;

const FILTERS: readonly unknown[] = ['DCTDecode', 'FlateDecode'];
const COLOUR_SPACES: readonly unknown[] = ['DeviceRGB', 'DeviceGray', 'DeviceCMYK'];
const DEPTHS: readonly unknown[] = [1, 2, 4, 8, 16];
const isSize = (value: unknown) => Number.isInteger(value) && (value as number) > 0;

/**
 * Throws a `RangeError` unless `image` is safe to write into a PDF. Its fields go into the file
 * as they are, so each one is checked against what a PDF allows instead of being trusted.
 */
export function assertPdfImage(image: PdfImage): void {
    const fail = (problem: string) => {
        throw new RangeError(`The logo cannot be used: ${problem}.`);
    };
    if (!image || typeof image !== 'object') fail('it is not an image prepared with pdfImage');
    if (!isSize(image.width) || !isSize(image.height)) fail('its width and height must be whole numbers above zero');
    if (!FILTERS.includes(image.filter)) fail('its filter must be DCTDecode or FlateDecode');
    if (!COLOUR_SPACES.includes(image.colourSpace))
        fail('its colour space must be DeviceRGB, DeviceGray or DeviceCMYK');
    if (!DEPTHS.includes(image.bitsPerComponent ?? 8)) fail('its bits per component must be 1, 2, 4, 8 or 16');
    if (!(image.data instanceof Uint8Array) || !image.data.length) fail('it has no pixel data');
    if (image.alpha !== undefined && !(image.alpha instanceof Uint8Array))
        fail('its transparency must be a Uint8Array');
}

/** `#1f5f5b` or `#abc` as 0 to 1 components; anything else gives `fallback`. */
export function parseColour(value: string | undefined, fallback: Rgb): Rgb {
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value?.trim() ?? '')?.[1];
    if (!hex) return fallback;
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}

export interface TextStyle {
    size?: number;
    bold?: boolean;
    colour?: Rgb;
    align?: 'left' | 'right';
}

const n = (value: number) => String(Math.round(value * 100) / 100);
const rgb = (colour: Rgb) => colour.map((part) => n(part)).join(' ');

/** Collects drawing instructions for one page. Coordinates are points from the bottom-left corner. */
export function createPage() {
    const ops: string[] = [];
    return {
        ops,
        /** One line of text. `x` is the left edge, or the right edge when `align` is `"right"`; `y` is the baseline. */
        text(
            value: string,
            x: number,
            y: number,
            { size = 10, bold = false, colour = [0, 0, 0], align }: TextStyle = {},
        ) {
            const left = align === 'right' ? x - textWidth(value, size, bold) : x;
            ops.push(
                `BT /F${bold ? 2 : 1} ${n(size)} Tf ${rgb(colour)} rg ${n(left)} ${n(y)} Td ${literal(value)} Tj ET`,
            );
        },
        line(x1: number, x2: number, y: number, colour: Rgb, width = 0.75) {
            ops.push(`${rgb(colour)} RG ${n(width)} w ${n(x1)} ${n(y)} m ${n(x2)} ${n(y)} l S`);
        },
        rect(x: number, y: number, width: number, height: number, colour: Rgb) {
            ops.push(`${rgb(colour)} rg ${n(x)} ${n(y)} ${n(width)} ${n(height)} re f`);
        },
        /** Draws the document's image with its bottom-left corner at `x`, `y`. */
        image(x: number, y: number, width: number, height: number) {
            ops.push(`q ${n(width)} 0 0 ${n(height)} ${n(x)} ${n(y)} cm /Im1 Do Q`);
        },
    };
}

/** One page's drawing surface. */
export type Page = ReturnType<typeof createPage>;

/**
 * Assembles the file: each page's instructions, the optional image, and the index of where each
 * object starts. A one-page document numbers its objects as it always has; further pages follow.
 */
export function buildPdf({
    pages,
    image,
    title,
    author,
}: {
    /** The instructions for each page, in order. At least one page is written. */
    pages: string[][];
    image?: PdfImage;
    title: string;
    author?: string;
}): Uint8Array {
    if (image) assertPdfImage(image);
    const chunks: Uint8Array[] = [];
    let length = 0;
    const write = (part: string | Uint8Array) => {
        const bytes = typeof part === 'string' ? utf8Encode(part) : part;
        chunks.push(bytes);
        length += bytes.length;
    };
    const offsets: number[] = [];
    const object = (dictionary: string, stream?: Uint8Array) => {
        offsets.push(length);
        write(`${offsets.length} 0 obj\n${dictionary}\n`);
        if (stream) {
            write('stream\n');
            write(stream);
            write('\nendstream\n');
        }
        write('endobj\n');
    };
    const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
    const contents = (pages.length ? pages : [[]]).map((ops) => utf8Encode(ops.join('\n')));
    const xobject = image ? ' /XObject << /Im1 8 0 R >>' : '';
    // Objects 1 to 7 are fixed, then the image and its mask; each later page is a pair after those.
    const later = 8 + (image ? 1 : 0) + (image?.alpha ? 1 : 0);
    const pageObject = (index: number) => (index ? later + (index - 1) * 2 : 3);
    const page = (index: number) =>
        object(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >>${xobject} >> /Contents ${index ? pageObject(index) + 1 : 6} 0 R >>`,
        );
    const content = (index: number) => object(`<< /Length ${contents[index]!.length} >>`, contents[index]);
    const kids = contents.map((_, index) => `${pageObject(index)} 0 R`).join(' ');

    write('%PDF-1.4\n');
    object('<< /Type /Catalog /Pages 2 0 R >>');
    object(`<< /Type /Pages /Kids [${kids}] /Count ${contents.length} >>`);
    page(0);
    object(font('Helvetica'));
    object(font('Helvetica-Bold'));
    content(0);
    object(
        `<< /Title ${infoString(title)}${author ? ` /Author ${infoString(author)}` : ''} /Producer (property-calculators) >>`,
    );
    if (image) {
        const shared = `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}`;
        // Adobe's CMYK JPEGs store their inks inverted.
        const decode = image.colourSpace === 'DeviceCMYK' ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
        const mask = image.alpha ? ' /SMask 9 0 R' : '';
        object(
            `<< ${shared} /BitsPerComponent ${image.bitsPerComponent ?? 8} /ColorSpace /${image.colourSpace}${decode} /Filter /${image.filter}${mask} /Length ${image.data.length} >>`,
            image.data,
        );
        if (image.alpha)
            object(
                `<< ${shared} /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length ${image.alpha.length} >>`,
                image.alpha,
            );
    }
    for (let index = 1; index < contents.length; index++) {
        page(index);
        content(index);
    }

    const xref = length;
    write(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
    for (const offset of offsets) write(`${String(offset).padStart(10, '0')} 00000 n \n`);
    write(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const pdf = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
        pdf.set(chunk, at);
        at += chunk.length;
    }
    return pdf;
}
