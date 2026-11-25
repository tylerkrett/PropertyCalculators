import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createPdf,
    PDF_IMAGE_MAX_BYTES,
    PDF_IMAGE_MAX_PIXELS,
    PDF_IMAGE_MAX_SIDE,
    type PdfImage,
    pdfImage,
    renderPdf,
    stampDutyPdf,
} from '../src/pdf/index';
import { calculateStampDuty } from '../src/stamp-duty/index';
import { BASE, DATE, expectWellFormed, inflate, jpegFrame, latin1, makeJpeg, makePng } from './pdf.helpers';

/** Rejects with a `RangeError` matching `message`, and quickly: no hostile file may tie the process up. */
async function expectFastRejection(source: Uint8Array, message: string | RegExp) {
    const started = performance.now();
    const error: unknown = await pdfImage(source).then(
        () => undefined,
        (reason: unknown) => reason,
    );
    expect(performance.now() - started).toBeLessThan(250);
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).toMatch(message);
}

const jpegWith = (...frame: number[]) => new Uint8Array([0xff, 0xd8, ...frame, 0xff, 0xd9]);
const prepared = (changes: object) =>
    ({
        width: 10,
        height: 10,
        data: new Uint8Array(4),
        filter: 'DCTDecode',
        colourSpace: 'DeviceRGB',
        ...changes,
    }) as PdfImage;

describe('JPEG logos', () => {
    it('embeds a real JPEG untouched', async () => {
        const source = makeJpeg(60, 20);
        const image = await pdfImage(source);
        expect(image).toMatchObject({ width: 60, height: 20, filter: 'DCTDecode', colourSpace: 'DeviceGray' });
        expect(image.bitsPerComponent).toBe(8);
        expect(image.data).toBe(source);
        const pdf = await createPdf(BASE, { logo: image, date: DATE });
        expect(expectWellFormed(pdf)).toBe(8);
        const body = latin1(pdf);
        expect(body).toContain('/Im1 Do');
        expect(body).toContain(
            `/Width 60 /Height 20 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /DCTDecode /Length ${source.length} >>`,
        );
        // Scaled to the 44 point logo box, keeping its shape.
        expect(body).toContain('q 132 0 0 44 56 741.89 cm /Im1 Do Q');
    });

    it('labels the colour model from the number of components', async () => {
        expect((await pdfImage(jpegWith(...jpegFrame(60, 20, 3)))).colourSpace).toBe('DeviceRGB');
        const cmyk = await pdfImage(jpegWith(...jpegFrame(8, 8, 4, 8, 0xc2)));
        expect(cmyk.colourSpace).toBe('DeviceCMYK');
        expect(latin1(await createPdf(BASE, { logo: cmyk }))).toContain('/Decode [1 0 1 0 1 0 1 0]');
        await expect(pdfImage(jpegWith(...jpegFrame(8, 8, 2)))).rejects.toThrow('2 colour components');
    });

    it('skips fill bytes and other segments on the way to the frame header', async () => {
        const comment = [0xff, 0xfe, 0, 4, 1, 2];
        const image = await pdfImage(jpegWith(...comment, 0xff, 0xff, 0xff, ...jpegFrame(300, 200, 3)));
        expect(image).toMatchObject({ width: 300, height: 200 });
    });

    it('refuses a JPEG a PDF cannot show', async () => {
        await expect(pdfImage(jpegWith(...jpegFrame(60, 20, 3, 12)))).rejects.toThrow('12-bit JPEGs are not supported');
        await expect(pdfImage(jpegWith(...jpegFrame(0, 0, 3)))).rejects.toThrow('no size');
        await expect(pdfImage(jpegWith(...jpegFrame(8, 8, 3, 8, 0xc3)))).rejects.toThrow('baseline and progressive');
        await expect(pdfImage(new Uint8Array([0xff, 0xd8]))).rejects.toThrow(RangeError);
        // Five megabytes of markers and no frame header: must give up, not spin.
        const noise = new Uint8Array(5e6).map((_, index) => (index % 2 ? (index === 1 ? 0xd8 : 0xe0) : 0xff));
        await expectFastRejection(noise, 'no readable size');
    });
});

describe('PNG logos', () => {
    it('splits a transparent PNG into colour and a mask', async () => {
        const source = await makePng(2, 1, 6, [[255, 0, 0, 255, 0, 0, 255, 128]]);
        const image = await pdfImage(source);
        expect(image).toMatchObject({ width: 2, height: 1, filter: 'FlateDecode', colourSpace: 'DeviceRGB' });
        expect([...(await inflate(image.alpha!))]).toEqual([255, 128]);
        const pdf = await stampDutyPdf(calculateStampDuty({ price: 500_000 }), { logo: source.buffer as ArrayBuffer });
        expect(expectWellFormed(pdf)).toBe(9);
        expect(latin1(pdf)).toContain('/SMask 9 0 R');
    });

    it('undoes every row filter: none, sub, up, average and Paeth', async () => {
        const [width, height] = [5, 6];
        const rows = Array.from({ length: height }, (_, y) =>
            Array.from({ length: width * 4 }, (_, i) => ((y * width * 4 + i) * 37 + 11) & 255),
        );
        const image = await pdfImage(await makePng(width, height, 6, rows, { filters: [1, 2, 3, 4, 0, 4] }));
        const pixels = rows.flat();
        expect([...(await inflate(image.data))]).toEqual(pixels.filter((_, i) => i % 4 !== 3));
        expect([...(await inflate(image.alpha!))]).toEqual(pixels.filter((_, i) => i % 4 === 3));
        // The same for three bytes a pixel, where "left" is three bytes back.
        const rgb = rows.map((row) => row.slice(0, width * 3));
        const opaque = await pdfImage(await makePng(width, height, 2, rgb, { filters: [4, 3, 2, 1, 4, 3] }));
        expect([...(await inflate(opaque.data))]).toEqual(rgb.flat());
        expect(opaque.alpha).toBeUndefined();
    });

    it('reads greyscale and palette PNGs, down to two bits a pixel', async () => {
        const grey = await pdfImage(await makePng(2, 1, 0, [[10, 200]]));
        expect([...(await inflate(grey.data))]).toEqual([10, 10, 10, 200, 200, 200]);
        const extra: [string, number[]][] = [
            ['PLTE', [10, 0, 0, 20, 0, 0, 30, 0, 0, 40, 0, 0]],
            ['tRNS', [255, 0]],
        ];
        const palette = await pdfImage(await makePng(5, 1, 3, [[0b00011011, 0b01000000]], { depth: 2, extra }));
        expect([...(await inflate(palette.data))].filter((_, i) => i % 3 === 0)).toEqual([10, 20, 30, 40, 20]);
        expect([...(await inflate(palette.alpha!))]).toEqual([255, 0, 255, 255, 0]);
    });

    it('makes the colour named in tRNS transparent for RGB and greyscale', async () => {
        const rgb = await makePng(2, 1, 2, [[255, 255, 255, 1, 2, 3]], { extra: [['tRNS', [0, 255, 0, 255, 0, 255]]] });
        expect([...(await inflate((await pdfImage(rgb)).alpha!))]).toEqual([0, 255]);
        const grey = await makePng(2, 1, 0, [[255, 3]], { extra: [['tRNS', [0, 255]]] });
        expect([...(await inflate((await pdfImage(grey)).alpha!))]).toEqual([0, 255]);
    });

    it('rejects a PNG that claims a huge size before reading its pixels', async () => {
        const empty = { raw: new Uint8Array(0) };
        expect(PDF_IMAGE_MAX_SIDE).toBe(4096);
        expect(PDF_IMAGE_MAX_PIXELS).toBe(16_000_000);
        await expectFastRejection(await makePng(65535, 65535, 6, [], empty), /too large \(65535 x 65535\)/);
        await expectFastRejection(await makePng(0x7fffffff, 1, 6, [], empty), 'too large');
        await expectFastRejection(await makePng(6000, 6000, 6, [], empty), 'too large');
        await expectFastRejection(await makePng(4097, 1, 6, [], empty), 'too large');
        // Inside 4096 a side, but over 16 megapixels.
        await expectFastRejection(await makePng(4096, 4000, 6, [], empty), 'too large');
        await expectFastRejection(await makePng(0, 0, 2, [], empty), 'no size');
        await expectFastRejection(await makePng(0, 5, 2, [], empty), 'no size');
    });

    it('stops inflating as soon as the pixel data is longer than the size allows', async () => {
        // 1 x 1 in the header; 300 MB once inflated, from about 290 KB.
        const bomb = await makePng(1, 1, 2, [], { raw: new Uint8Array(300e6) });
        expect(bomb.length).toBeLessThan(400_000);
        await expectFastRejection(bomb, 'damaged');
    }, 30_000);

    it('rejects pixel data that is short, cut off, or not deflate data at all', async () => {
        await expectFastRejection(await makePng(100, 100, 2, [], { raw: new Uint8Array(301) }), 'damaged');
        await expectFastRejection(await makePng(1, 1, 2, [], { raw: new Uint8Array(5) }), 'damaged');
        const whole = await makePng(2, 2, 2, [new Array<number>(6).fill(7), new Array<number>(6).fill(9)]);
        expect((await pdfImage(whole)).width).toBe(2);
        const idat = whole.subarray(8 + 25 + 8, whole.length - 12 - 4);
        await expectFastRejection(await makePng(2, 2, 2, [], { idat: idat.subarray(0, 5) }), 'damaged');
        await expectFastRejection(await makePng(2, 2, 2, [], { idat: new Uint8Array([1, 2, 3, 4, 5, 6]) }), 'damaged');
        await expectFastRejection(whole.subarray(0, 40), /incomplete|damaged/);
        await expectFastRejection(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'incomplete');
        await expectFastRejection(await makePng(1, 1, 2, [], { raw: new Uint8Array([9, 1, 2, 3]) }), 'damaged');
        await expectFastRejection(await makePng(2, 1, 3, [[200, 201]]), 'no palette');
        await expectFastRejection(await makePng(2, 1, 3, [[0, 9]], { extra: [['PLTE', [1, 2, 3]]] }), 'palette');
    });

    it('says what is wrong with a file it cannot use', async () => {
        await expect(pdfImage(new Uint8Array([71, 73, 70, 56]))).rejects.toThrow('JPEG or a PNG');
        const interlaced = await makePng(1, 1, 2, [[1, 2, 3]]);
        interlaced[28] = 1;
        await expect(pdfImage(interlaced)).rejects.toThrow('Interlaced');
        await expect(pdfImage(await makePng(1, 1, 2, [[0, 0, 0, 0, 0, 0]], { depth: 16 }))).rejects.toThrow('8-bit');
        await expect(pdfImage(await makePng(8, 1, 0, [[0]], { depth: 1 }))).rejects.toThrow('8-bit');
    });
});

describe('prepared logos', () => {
    it('treats a null logo as no logo', async () => {
        const pdf = await createPdf(BASE, { date: DATE, logo: null as never });
        expect(expectWellFormed(pdf)).toBe(7);
        expect(latin1(pdf)).not.toContain('/Im1');
    });

    it('refuses a prepared image whose fields could not go into a PDF as they are', async () => {
        const injected = prepared({ filter: 'DCTDecode >> /AA << /O 5 0 R' });
        await expect(createPdf(BASE, { logo: injected })).rejects.toThrow('filter must be');
        expect(() => renderPdf(BASE, { logo: injected })).toThrow(RangeError);
        expect(() => renderPdf(BASE, { logo: prepared({ colourSpace: 'DeviceRGB /X 1' }) })).toThrow('colour space');
        for (const size of [0, -4, 2.5, Number.NaN, Infinity, '10 /X 1'])
            for (const side of ['width', 'height'])
                expect(() => renderPdf(BASE, { logo: prepared({ [side]: size }) })).toThrow('whole numbers above zero');
        expect(() => renderPdf(BASE, { logo: prepared({ bitsPerComponent: 12 }) })).toThrow('bits per component');
        expect(() => renderPdf(BASE, { logo: prepared({ data: [1, 2] }) })).toThrow('no pixel data');
        expect(() => renderPdf(BASE, { logo: prepared({ alpha: 'x' }) })).toThrow('transparency');
        expectWellFormed(renderPdf(BASE, { logo: prepared({}) }));
    });
});

describe('a logo given as a URL', () => {
    afterEach(() => vi.unstubAllGlobals());
    const serve = (response: Response) =>
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response),
        );

    it('downloads the file', async () => {
        serve(new Response(makeJpeg(16, 8) as BodyInit));
        expect(await pdfImage('https://cdn.example/logo.jpg')).toMatchObject({ width: 16, height: 8 });
    });

    it('refuses a download over the limit, whether or not its length is declared', async () => {
        expect(PDF_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
        const url = 'https://cdn.example/logo.png?token=secret#frag';
        serve(new Response('x', { headers: { 'content-length': String(PDF_IMAGE_MAX_BYTES + 1) } }));
        await expect(pdfImage(url)).rejects.toThrow('larger than 5 MB: https://cdn.example/logo.png');
        let sent = 0;
        const endless = new ReadableStream<Uint8Array>({
            pull(controller) {
                sent += 1 << 20;
                controller.enqueue(new Uint8Array(1 << 20));
            },
        });
        serve(new Response(endless));
        await expect(pdfImage(url)).rejects.toThrow(RangeError);
        expect(sent).toBeLessThan(PDF_IMAGE_MAX_BYTES * 2);
    });

    it('keeps query strings out of its error messages', async () => {
        serve(new Response('', { status: 404 }));
        const error = await pdfImage('https://cdn.example/logo.png?token=secret').catch((reason: Error) => reason);
        expect((error as Error).message).toBe('Could not load the image (404): https://cdn.example/logo.png');
        serve(new Response('', { status: 500 }));
        await expect(pdfImage('data:image/png;base64,AAAA')).rejects.toThrow('(500): a data: URL');
    });
});
