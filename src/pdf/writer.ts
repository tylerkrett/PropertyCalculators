/*
 * The smallest PDF writer that will do: one A4 page of text, lines and one image, in the two
 * Helvetica faces every PDF reader has built in. No font is embedded and nothing is imported, so
 * a finished estimate is a few kilobytes and this file is most of the cost of the feature.
 */

export type Rgb = readonly [number, number, number];

/** An image ready to embed. Make one with `pdfImage`. */
export interface PdfImage {
    width: number;
    height: number;
    /** The pixel data as the PDF stores it: a whole JPEG file, or deflated samples. */
    data: Uint8Array;
    filter: 'DCTDecode' | 'FlateDecode';
    colourSpace: 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK';
    /** Deflated 8-bit transparency, one sample per pixel, when the image has any. */
    alpha?: Uint8Array;
}

export const PAGE = { width: 595.28, height: 841.89, margin: 56 } as const;

/** `#1f5f5b` or `#abc` as 0 to 1 components; anything else gives `fallback`. */
export function parseColour(value: string | undefined, fallback: Rgb): Rgb {
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value?.trim() ?? '')?.[1];
    if (!hex) return fallback;
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}

/** Characters outside Latin-1 that the built-in encoding (WinAnsi) still has. */
const WIN_ANSI: Record<string, number> = {
    '–': 0x96,
    '—': 0x97,
    '‘': 0x91,
    '’': 0x92,
    '“': 0x93,
    '”': 0x94,
    '…': 0x85,
};

const byteOf = (char: string) => WIN_ANSI[char] ?? char.codePointAt(0)!;
const printable = (code: number) => (code >= 32 && code < 127) || (code >= 160 && code <= 255) || code in REVERSE;
const REVERSE = Object.fromEntries(Object.values(WIN_ANSI).map((code) => [code, true]));

/** A PDF string literal in plain ASCII: other characters become octal escapes, or `?` if the font lacks them. */
export function literal(text: string): string {
    let out = '';
    for (const char of text) {
        const code = byteOf(char);
        if (char === '(' || char === ')' || char === '\\') out += `\\${char}`;
        else if (code >= 32 && code < 127) out += char;
        else out += printable(code) ? `\\${code.toString(8)}` : '?';
    }
    return `(${out})`;
}

// Advance widths per 1000 units for ASCII 32 to 126, from Adobe's metrics for the two faces.
const REGULAR =
    '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584';
const BOLD =
    '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584';
const WIDTHS = [REGULAR, BOLD].map((table) => table.split(' ').map(Number));
const OTHER: Record<string, number> = { '—': 1000, '…': 1000, '·': 278, '’': 250, '‘': 250 };

/** How wide `text` prints at `size` points. */
export function textWidth(text: string, size: number, bold = false): number {
    let units = 0;
    for (const char of text) units += WIDTHS[bold ? 1 : 0]![char.charCodeAt(0) - 32] ?? OTHER[char] ?? 556;
    return (units * size) / 1000;
}

/** Breaks prose at spaces so no line is wider than `maxWidth` points. */
export function wrapText(text: string, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && textWidth(next, size) > maxWidth) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    return line ? [...lines, line] : lines;
}

export interface TextStyle {
    size?: number;
    bold?: boolean;
    colour?: Rgb;
    align?: 'left' | 'right';
}

const n = (value: number) => String(Math.round(value * 100) / 100);
const rgb = (colour: Rgb) => colour.map((part) => n(part)).join(' ');

/** Collects drawing instructions for the page. Coordinates are points from the bottom-left corner. */
export function createPage() {
    const ops: string[] = [];
    return {
        ops,
        /** `x` is the left edge, or the right edge when `align` is `"right"`; `y` is the baseline. */
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

/** Assembles the file: the page's instructions, the optional image, and the index of where each object starts. */
export function buildPdf({
    ops,
    image,
    title,
    author,
}: {
    ops: string[];
    image?: PdfImage;
    title: string;
    author?: string;
}): Uint8Array {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const write = (part: string | Uint8Array) => {
        const bytes = typeof part === 'string' ? encoder.encode(part) : part;
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
    const content = encoder.encode(ops.join('\n'));
    const xobject = image ? ' /XObject << /Im1 8 0 R >>' : '';

    write('%PDF-1.4\n');
    object('<< /Type /Catalog /Pages 2 0 R >>');
    object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >>${xobject} >> /Contents 6 0 R >>`,
    );
    object(font('Helvetica'));
    object(font('Helvetica-Bold'));
    object(`<< /Length ${content.length} >>`, content);
    object(
        `<< /Title ${literal(title)}${author ? ` /Author ${literal(author)}` : ''} /Producer (property-calculators) >>`,
    );
    if (image) {
        const shared = `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /BitsPerComponent 8`;
        // Adobe's CMYK JPEGs store their inks inverted.
        const decode = image.colourSpace === 'DeviceCMYK' ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
        const mask = image.alpha ? ' /SMask 9 0 R' : '';
        object(
            `<< ${shared} /ColorSpace /${image.colourSpace}${decode} /Filter /${image.filter}${mask} /Length ${image.data.length} >>`,
            image.data,
        );
        if (image.alpha)
            object(
                `<< ${shared} /ColorSpace /DeviceGray /Filter /FlateDecode /Length ${image.alpha.length} >>`,
                image.alpha,
            );
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
