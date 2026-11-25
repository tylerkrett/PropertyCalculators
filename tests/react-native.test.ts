import { afterEach, describe, expect, it, vi } from 'vitest';

import { base64Decode, base64Encode, utf8Decode, utf8Encode } from '../src/bytes';
import { downloadPdf, mortgagePdf, pdfBase64, pdfImage, stampDutyPdf } from '../src/pdf/index';
import { deflateZlib, inflateZlib } from '../src/pdf/zlib';
import { calculateStampDuty, decodeStampDutyHash, encodeStampDutyHash } from '../src/stamp-duty/index';
import { DATE, deflate, expectWellFormed, inflate, makeJpeg, makePng } from './pdf.helpers';

/*
 * React Native runs on Hermes, which has none of the browser's streams, no `document`, and for
 * a long time no `TextDecoder`. These tests take those globals away and expect the same answers.
 */

const MISSING = [
    'DecompressionStream',
    'CompressionStream',
    'TextEncoder',
    'TextDecoder',
    'atob',
    'btoa',
    'document',
    'window',
];
/** Makes the globals React Native lacks disappear until the test ends. */
const likeReactNative = () => MISSING.forEach((name) => vi.stubGlobal(name, undefined));
afterEach(() => vi.unstubAllGlobals());

/** Bytes with long repeats, short repeats and noise, so every kind of deflate block turns up. */
function sample(length: number, seed = 1): Uint8Array {
    const out = new Uint8Array(length);
    let state = seed;
    for (let i = 0; i < length; i++) {
        state = (state * 1103515245 + 12345) >>> 0;
        const mode = (i >> 9) % 3;
        out[i] = mode === 0 ? 200 : mode === 1 ? (i % 7) * 30 : state >>> 24;
    }
    return out;
}

/** A 6 x 4 RGBA PNG with a see-through corner, and the same picture as rows. */
async function logo() {
    const rows = Array.from({ length: 4 }, (_, y) =>
        Array.from({ length: 6 }, (_, x) => [x * 40, y * 60, 128, x + y ? 255 : 0]).flat(),
    );
    return { rows, png: await makePng(6, 4, 6, rows, { filters: [0, 1, 2, 4] }) };
}

describe('UTF-8 and base64 without the platform', () => {
    const TEXTS = ['', 'a', 'ab', 'abc', '£750,000', 'Zoë – “quoted” €', '日本語 🏠 text', '\ud800 lone'];

    it('encodes and decodes UTF-8 as TextEncoder and TextDecoder do', () => {
        for (const text of TEXTS) {
            const expected = new TextEncoder().encode(text);
            expect(utf8Encode(text)).toEqual(expected);
            expect(utf8Decode(expected)).toBe(new TextDecoder().decode(expected));
        }
        // Broken input, and a byte order mark, come out exactly as the platform reads them.
        const broken = [[0xff], [0xc3], [0xe2, 0x82], [0xc0, 0x80], [0xed, 0xa0, 0x80], [0x41, 0x80, 0x42]];
        for (const bytes of [...broken, [0xf4, 0x9f], [0xe0, 0x9f, 0x41], [0xef, 0xbb, 0xbf, 0x41]]) {
            expect(utf8Decode(new Uint8Array(bytes))).toBe(new TextDecoder().decode(new Uint8Array(bytes)));
        }
        for (let seed = 1; seed <= 300; seed++) {
            const bytes = sample(24, seed).map((byte) => [0x41, 0xc3, 0xa9, 0xe2, 0x82, 0xf0, 0x9f, 0xed][byte % 8]!);
            expect(utf8Decode(bytes)).toBe(new TextDecoder().decode(bytes));
        }
    });

    it('encodes and decodes base64 as btoa and atob do', () => {
        for (const length of [0, 1, 2, 3, 4, 5, 255, 1000]) {
            const bytes = sample(length, length + 1);
            const expected = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
            expect(base64Encode(bytes)).toBe(expected);
            expect(base64Decode(expected)).toEqual(bytes);
            expect(base64Decode(expected.replace(/=+$/, ''))).toEqual(bytes);
        }
        expect(base64Decode(' YW\nJj ')).toEqual(utf8Encode('abc'));
        for (const text of ['!!!', 'a', 'ab=c', 'a===', 'YWJj=']) {
            expect(() => atob(text)).toThrow();
            expect(() => base64Decode(text)).toThrow(TypeError);
        }
    });
});

describe('inflate and deflate without the platform', () => {
    it('inflates what the platform deflated, and the other way round', async () => {
        for (const length of [0, 1, 2, 3, 10, 300, 5000, 70_000, 400_000]) {
            const data = sample(length, length + 7);
            expect(inflateZlib(await deflate(data), length)).toEqual(data);
            const packed = deflateZlib(data);
            expect(await inflate(packed)).toEqual(data);
            expect(inflateZlib(packed, length)).toEqual(data);
        }
    });

    it('packs flat colour down small', () => {
        expect(deflateZlib(new Uint8Array(300_000).fill(255)).length).toBeLessThan(3000);
    });

    it('reads a stored block', () => {
        // zlib header, one final stored block of "abc", then its Adler-32.
        const stored = [0x78, 0x01, 0x01, 3, 0, 0xfc, 0xff, 0x61, 0x62, 0x63, 0x02, 0x4d, 0x01, 0x27];
        expect(inflateZlib(new Uint8Array(stored), 3)).toEqual(utf8Encode('abc'));
    });

    it('rejects data that is longer, shorter, cut off, altered or not deflate at all', async () => {
        const data = sample(4000);
        const packed = await deflate(data);
        expect(() => inflateZlib(packed, 3999)).toThrow(RangeError);
        expect(() => inflateZlib(packed, 4001)).toThrow(RangeError);
        expect(() => inflateZlib(packed.subarray(0, packed.length - 5), 4000)).toThrow(RangeError);
        const altered = packed.slice();
        altered[altered.length - 1]! ^= 1;
        expect(() => inflateZlib(altered, 4000)).toThrow(RangeError);
        expect(() => inflateZlib(sample(4000, 9), 4000)).toThrow(RangeError);
        expect(() => inflateZlib(new Uint8Array(0), 0)).toThrow(RangeError);
        expect(() => inflateZlib(new Uint8Array([...packed, 0]), 4000)).toThrow(RangeError);
        for (let seed = 1; seed <= 200; seed++) {
            const noise = sample(64, seed).map((byte, index) => (index < 2 ? [0x78, 0x9c][index]! : byte ^ seed));
            expect(() => inflateZlib(noise, 100_000)).toThrow(RangeError);
        }
    });
});

describe('in React Native', () => {
    it('packs and reads the stamp duty hash', () => {
        const model = { price: 750_000, address: '1 Zoë’s Mews, 東京' };
        const withPlatform = encodeStampDutyHash(model);
        likeReactNative();
        expect(encodeStampDutyHash(model)).toBe(withPlatform);
        expect(decodeStampDutyHash(withPlatform)).toEqual(model);
        expect(() => decodeStampDutyHash('!!!')).toThrow(TypeError);
    });

    it('makes the same PDF as anywhere else', async () => {
        const estimate = calculateStampDuty({ price: 750_000 });
        const input = { price: 400_000, deposit: 100_000, rate: 4.5, termYears: 25, type: 'repayment' as const };
        const expected = [await stampDutyPdf(estimate, { date: DATE }), await mortgagePdf(input, { date: DATE })];
        likeReactNative();
        expect(await stampDutyPdf(estimate, { date: DATE })).toEqual(expected[0]);
        expect(await mortgagePdf(input, { date: DATE })).toEqual(expected[1]);
    });

    it('prints a PNG logo with the same pixels', async () => {
        const { png } = await logo();
        const expected = await pdfImage(png);
        const pixels = [await inflate(expected.data), await inflate(expected.alpha!)];
        likeReactNative();
        const image = await pdfImage(png);
        expect(image).toMatchObject({ width: 6, height: 4, filter: 'FlateDecode', colourSpace: 'DeviceRGB' });
        expect(inflateZlib(image.data, 6 * 4 * 3)).toEqual(pixels[0]);
        expect(inflateZlib(image.alpha!, 6 * 4)).toEqual(pixels[1]);
        const pdf = await stampDutyPdf(calculateStampDuty({ price: 750_000 }), { logo: png, date: DATE });
        await expect(pdfImage(png.slice(0, png.length - 20))).rejects.toThrow(RangeError);
        // The checker itself reads the file with the platform's decoder.
        vi.unstubAllGlobals();
        expectWellFormed(pdf);
    });

    it('reads a logo from a fetch with no stream and a Blob with no arrayBuffer()', async () => {
        const jpeg = makeJpeg(16, 8);
        const dataUrl = `data:image/jpeg;base64,${base64Encode(jpeg)}`;
        // React Native's Blob: opaque, read only through a FileReader.
        const blob = {} as Blob;
        class Reader {
            result: string | null = null;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            readAsDataURL(source: Blob) {
                expect(source).toBe(blob);
                this.result = dataUrl;
                queueMicrotask(() => this.onload?.());
            }
        }
        likeReactNative();
        vi.stubGlobal('FileReader', Reader);
        const response = { ok: true, status: 200, headers: new Headers(), body: undefined, blob: async () => blob };
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response),
        );
        expect(await pdfImage('https://cdn.example/logo.jpg')).toMatchObject({ width: 16, height: 8 });
        expect(await pdfImage(blob)).toMatchObject({ width: 16, height: 8 });
    });

    it('reads a data: URL that fetch refuses, and passes on any other failure', async () => {
        const refused = new TypeError('Network request failed');
        likeReactNative();
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Promise.reject(refused)),
        );
        const jpeg = makeJpeg(16, 8);
        expect(await pdfImage(`data:image/jpeg;base64,${base64Encode(jpeg)}`)).toMatchObject({ width: 16, height: 8 });
        await expect(pdfImage('https://cdn.example/logo.jpg')).rejects.toBe(refused);
        await expect(pdfImage('data:image/jpeg;base64,***')).rejects.toBe(refused);
    });

    it('hands the PDF over as base64 instead of a download', async () => {
        const pdf = await stampDutyPdf(calculateStampDuty({ price: 750_000 }), { date: DATE });
        likeReactNative();
        expect(() => downloadPdf(pdf)).toThrow(/React Native.*pdfBase64/);
        expect(base64Decode(pdfBase64(pdf))).toEqual(pdf);
        expect(pdfBase64(pdf).startsWith('JVBERi0xLjQ')).toBe(true);
    });
});
