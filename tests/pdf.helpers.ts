import { expect } from 'vitest';

/*
 * What the PDF tests share: a strict structural check, a reader that turns a PDF's pages back
 * into the text printed on them, and builders for PNG and JPEG files made by hand.
 */

export const DATE = new Date(2026, 10, 18);
export const BASE = { title: 'T', headline: { label: 'L', value: 'V' }, facts: [] };
export const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

/**
 * Checks the file the way a reader opens it: the trailer points at the index, every index entry
 * is 20 bytes and points at the object it names, `/Size` counts them, and every stream is as
 * long as its `/Length` says. Returns the number of objects.
 */
export function expectWellFormed(pdf: Uint8Array): number {
    const body = latin1(pdf);
    expect(body.startsWith('%PDF-1.4\n')).toBe(true);
    const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(body)![1]);
    const head = /^xref\n0 (\d+)\n/.exec(body.slice(xref))!;
    const size = Number(head[1]);
    const table = xref + head[0].length;
    expect(body.slice(table, table + 20)).toBe('0000000000 65535 f \n');
    for (let index = 1; index < size; index++) {
        const entry = body.slice(table + index * 20, table + index * 20 + 20);
        expect(entry).toMatch(/^\d{10} 00000 n \n$/);
        expect(body.startsWith(`${index} 0 obj\n`, Number(entry.slice(0, 10)))).toBe(true);
    }
    expect(body.slice(table + size * 20)).toMatch(
        new RegExp(`^trailer\\n<< /Size ${size} /Root 1 0 R /Info \\d+ 0 R >>\\n`),
    );
    expect(body.match(/^\d+ 0 obj$/gm)).toHaveLength(size - 1);
    const streams = [...body.matchAll(/\/Length (\d+) >>\nstream\n/g)];
    expect(streams.length).toBeGreaterThan(0);
    for (const match of streams) {
        const end = match.index + match[0].length + Number(match[1]);
        expect(body.slice(end, end + 18)).toBe('\nendstream\nendobj\n');
    }
    expect(body.slice(0, xref)).not.toMatch(/NaN|Infinity|undefined/);
    return size - 1;
}

/** The bytes of object `id`, from its dictionary to `endobj`. */
function objectBody(body: string, id: number): string {
    const start = body.indexOf(`\n${id} 0 obj\n`) + 1;
    return body.slice(start, body.indexOf('\nendobj\n', start));
}

// WinAnsi's 0x80 to 0x9F, which is where it differs from Latin-1.
const HIGH = '€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ';
const decodeLiteral = (value: string) =>
    value
        .replace(/\\([0-7]{3})|\\(.)/g, (_, octal: string | undefined, char: string) =>
            octal ? String.fromCharCode(parseInt(octal, 8)) : char,
        )
        .replace(/[\x80-\x9f]/g, (char) => HIGH[char.charCodeAt(0) - 0x80]!);

export interface PrintedText {
    x: number;
    y: number;
    size: number;
    bold: boolean;
    text: string;
}

/** Every page of the PDF, in `/Kids` order, as the text printed on it in drawing order. */
export function readPages(pdf: Uint8Array): PrintedText[][] {
    const body = latin1(pdf);
    const pages = objectBody(body, 2);
    const kids = /\/Kids \[([^\]]*)\]/
        .exec(pages)![1]!
        .match(/\d+(?= 0 R)/g)!
        .map(Number);
    expect(Number(/\/Count (\d+)/.exec(pages)![1])).toBe(kids.length);
    return kids.map((kid) => {
        const page = objectBody(body, kid);
        expect(page).toContain('/Type /Page /Parent 2 0 R');
        const content = objectBody(body, Number(/\/Contents (\d+) 0 R/.exec(page)![1]));
        const ops = content.matchAll(
            /BT \/F([12]) ([\d.]+) Tf [\d. ]+ rg ([-\d.]+) ([-\d.]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g,
        );
        return [...ops].map((op) => ({
            x: Number(op[3]),
            y: Number(op[4]),
            size: Number(op[2]),
            bold: op[1] === '2',
            text: decodeLiteral(op[5]!),
        }));
    });
}

/** The printed strings of every page, in order. */
export const readText = (pdf: Uint8Array) => readPages(pdf).flatMap((page) => page.map((item) => item.text));

const pack = async (data: Uint8Array, stream: CompressionStream | DecompressionStream) =>
    new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
export const deflate = (data: Uint8Array) => pack(data, new CompressionStream('deflate'));
export const inflate = (data: Uint8Array) => pack(data, new DecompressionStream('deflate'));

/** Applies PNG row filter `type` (0 to 4) to one row, as an encoder would. */
function filterRow(type: number, row: number[], above: number[] | undefined, bpp: number): number[] {
    return row.map((value, i) => {
        const left = i >= bpp ? row[i - bpp]! : 0;
        const up = above?.[i] ?? 0;
        const corner = i >= bpp ? (above?.[i - bpp] ?? 0) : 0;
        const estimate = left + up - corner;
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - corner)];
        const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
        return (value - [0, left, up, (left + up) >> 1, paeth][type]!) & 0xff;
    });
}

export interface PngOptions {
    depth?: number;
    /** The filter for each row, by index; rows past the end use 0 (none). */
    filters?: number[];
    /** Chunks to put between the header and the pixel data, such as `PLTE` and `tRNS`. */
    extra?: [string, number[]][];
    /** The pixel data chunk as it is, in place of the deflated rows. */
    idat?: Uint8Array;
    /** The unfiltered-and-prefixed data to deflate as it is, in place of `rows`. */
    raw?: Uint8Array;
}

/** A PNG built by hand. `type` is the colour type; `rows` are rows of samples. */
export async function makePng(
    width: number,
    height: number,
    type: number,
    rows: number[][],
    { depth = 8, filters = [], extra = [], idat, raw }: PngOptions = {},
): Promise<Uint8Array> {
    const chunk = (name: string, data: number[] | Uint8Array) => {
        const size = new Uint8Array(4);
        new DataView(size.buffer).setUint32(0, data.length);
        return [...size, ...[...name].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    };
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header.set([depth, type, 0, 0, 0], 8);
    const bpp = Math.max(1, (([1, 0, 3, 1, 2, 0, 4][type] ?? 1) * depth) >> 3);
    const filtered = rows.flatMap((row, y) => [filters[y] ?? 0, ...filterRow(filters[y] ?? 0, row, rows[y - 1], bpp)]);
    return new Uint8Array([
        ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        ...chunk('IHDR', header),
        ...extra.flatMap(([name, data]) => chunk(name, data)),
        ...chunk('IDAT', idat ?? (await deflate(raw ?? new Uint8Array(filtered)))),
        ...chunk('IEND', []),
    ]);
}

/** The frame header of a JPEG: `marker` is 0xC0 for baseline. */
export const jpegFrame = (width: number, height: number, components: number, bits = 8, marker = 0xc0) => [
    ...[0xff, marker, 0, 8 + components * 3, bits, height >> 8, height & 255, width >> 8, width & 255, components],
    ...Array.from({ length: components }, (_, index) => [index + 1, 0x11, 0]).flat(),
];

/**
 * A real baseline JPEG that any decoder opens: a flat mid-grey image of the size given, with one
 * quantisation table, one-code Huffman tables and a scan that codes "no change" for every block.
 */
export function makeJpeg(width: number, height: number): Uint8Array {
    const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
    // Each block is two zero bits: a DC difference of nothing, then end-of-block. Pad with ones.
    const scan = Array.from({ length: Math.ceil(blocks / 4) }, (_, index) =>
        index === Math.ceil(blocks / 4) - 1 && blocks % 4 ? 0xff >> ((blocks % 4) * 2) : 0,
    );
    const huffman = (table: number) => [0xff, 0xc4, 0, 20, table, 1, ...new Array<number>(15).fill(0), 0];
    return new Uint8Array([
        ...[0xff, 0xd8],
        ...[0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
        ...[0xff, 0xdb, 0, 67, 0, ...new Array<number>(64).fill(1)],
        ...jpegFrame(width, height, 1),
        ...huffman(0x00),
        ...huffman(0x10),
        ...[0xff, 0xda, 0, 8, 1, 1, 0x00, 0, 63, 0],
        ...scan,
        ...[0xff, 0xd9],
    ]);
}
