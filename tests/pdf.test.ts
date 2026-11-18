import { describe, expect, it } from 'vitest';

import {
    createPdf,
    leaseStampDutyPdf,
    mortgagePdf,
    mortgageReport,
    pdfImage,
    stampDutyPdf,
    stampDutyReport,
} from '../src/pdf/index';
import { literal, parseColour, textWidth, wrapText } from '../src/pdf/writer';
import { calculateLeaseStampDuty, calculateStampDuty } from '../src/stamp-duty/index';

const DATE = new Date(2026, 10, 18);
const text = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);

/** Every entry in the index must point at the object it names, and the trailer at the index. */
function expectWellFormed(pdf: Uint8Array) {
    const body = text(pdf);
    expect(body.startsWith('%PDF-1.4\n')).toBe(true);
    expect(body.endsWith('%%EOF\n')).toBe(true);
    const xref = Number(/startxref\n(\d+)\n%%EOF/.exec(body)![1]);
    expect(body.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...body.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    offsets.forEach((offset, index) => expect(body.slice(offset, offset + 12)).toContain(`${index + 1} 0 obj\n`));
    for (const [, length, stream] of body.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g))
        expect(stream!.length).toBe(Number(length));
    return offsets.length;
}

/** A PNG built by hand: `pixels` are rows of samples, each row prefixed here with filter 0. */
async function png(width: number, height: number, type: number, pixels: number[][], extra: [string, number[]][] = []) {
    const chunk = (name: string, data: number[] | Uint8Array) => {
        const size = new Uint8Array(4);
        new DataView(size.buffer).setUint32(0, data.length);
        return [...size, ...[...name].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    };
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header.set([8, type, 0, 0, 0], 8);
    const raw = new Blob([new Uint8Array(pixels.flatMap((row) => [0, ...row]))]);
    const packed = await new Response(raw.stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    return new Uint8Array([
        ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        ...chunk('IHDR', header),
        ...extra.flatMap(([name, data]) => chunk(name, data)),
        ...chunk('IDAT', new Uint8Array(packed)),
        ...chunk('IEND', []),
    ]);
}

describe('the writer', () => {
    it('escapes strings and keeps the file ASCII', () => {
        expect(literal('£1,250 (est.) – ok\\')).toBe('(\\2431,250 \\(est.\\) \\226 ok\\\\)');
        expect(literal('日本')).toBe('(??)');
    });

    it('measures and wraps text with the real font metrics', () => {
        expect(textWidth('£1,250,000', 10)).toBeCloseTo(50.04);
        expect(textWidth('Total', 10, true)).toBeGreaterThan(textWidth('Total', 10));
        const lines = wrapText('one two three four five six seven eight nine ten', 10, 60);
        expect(lines.length).toBeGreaterThan(2);
        for (const line of lines) expect(textWidth(line, 10)).toBeLessThanOrEqual(60);
    });

    it('reads hex colours and falls back on anything else', () => {
        expect(parseColour('#ff0000', [0, 0, 0])).toEqual([1, 0, 0]);
        expect(parseColour('0f0', [0, 0, 0])).toEqual([0, 1, 0]);
        expect(parseColour('teal', [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    });
});

describe('stampDutyPdf', () => {
    const estimate = calculateStampDuty({ price: 1_250_000, buyer: 'additional-property', nonUkResident: true });

    it('prints the estimate the calculator shows', async () => {
        const pdf = await stampDutyPdf(estimate, { date: DATE, subtitle: '14 Elgin Avenue (W9)' });
        expect(expectWellFormed(pdf)).toBe(7);
        const body = text(pdf);
        expect(body).toContain('(Stamp duty estimate)');
        expect(body).toContain('(14 Elgin Avenue \\(W9\\))');
        expect(body).toContain('(\\243156,250)');
        expect(body).toContain('(Additional property)');
        expect(body).toContain('(Not UK resident)');
        expect(body).toContain('(18 November 2026)');
        for (const band of estimate.bands) expect(body).toContain(band.formatted.tax.replace('£', '\\243'));
        expect(pdf.length).toBeLessThan(6000);
    });

    it('takes a name, a colour, a footer and its own small print', async () => {
        const body = text(
            await stampDutyPdf(estimate, { name: 'Acme', colour: '#ff0000', footer: 'acme.example', notice: 'Ours.' }),
        );
        expect(body).toContain('/Author (Acme)');
        expect(body).toContain('1 0 0 rg');
        expect(body).toContain('(acme.example)');
        expect(body).toContain('(Ours.)');
        expect(text(await stampDutyPdf(estimate, { notice: false, date: false }))).not.toContain('not tax or');
    });

    it('describes non-residential property without a buyer type', () => {
        const report = stampDutyReport(calculateStampDuty({ price: 400_000, propertyType: 'non-residential' }));
        expect(report.facts.map((fact) => fact.label)).not.toContain('Buyer');
        expect(report.facts).toContainEqual({ label: 'Property type', value: 'Non-residential or mixed use' });
    });
});

describe('the other calculators', () => {
    it('prints a mortgage, and refuses one that cannot be calculated', async () => {
        const input = { price: 850_000, deposit: 212_500, rate: 4.5, termYears: 25, type: 'repayment' as const };
        const body = text(await mortgagePdf(input, { date: DATE }));
        expect(body).toContain('(Mortgage estimate)');
        expect(body).toContain('(\\2433,543.43)');
        expect(body).toContain('(\\243245,000)');
        expect(mortgageReport({ ...input, deposit: 900_000 })).toBeNull();
        await expect(mortgagePdf({ ...input, deposit: 900_000 })).rejects.toThrow(RangeError);
    });

    it('prints a new lease with both breakdowns and its notes', async () => {
        const lease = calculateLeaseStampDuty({
            premium: 300_000,
            rent: 24_000,
            termYears: 15,
            buyer: 'first-time-buyer',
        });
        const pdf = await leaseStampDutyPdf(lease, { date: DATE });
        expectWellFormed(pdf);
        const body = text(pdf);
        expect(body).toContain('(How the premium was taxed)');
        expect(body).toContain('(How the rent was taxed)');
        expect(body).toContain(`(${lease.notes[0]})`);
    });

    it('prints a report of your own', async () => {
        const body = text(
            await createPdf({ title: 'Yield', headline: { label: 'Gross yield', value: '5.2%' }, facts: [] }),
        );
        expect(body).toContain('(Gross yield)');
    });
});

describe('logos', () => {
    it('embeds a JPEG untouched', async () => {
        // Start of image, then a baseline frame header: 8-bit, 20 high, 60 wide, 3 components.
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 60, 3, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const image = await pdfImage(jpeg);
        expect(image).toMatchObject({ width: 60, height: 20, filter: 'DCTDecode', colourSpace: 'DeviceRGB' });
        const pdf = await createPdf({ title: 'T', headline: { label: 'L', value: 'V' }, facts: [] }, { logo: image });
        expect(expectWellFormed(pdf)).toBe(8);
        expect(text(pdf)).toContain('/Im1 Do');
    });

    it('splits a transparent PNG into colour and a mask', async () => {
        const source = await png(2, 1, 6, [[255, 0, 0, 255, 0, 0, 255, 128]]);
        const image = await pdfImage(source);
        expect(image).toMatchObject({ width: 2, height: 1, filter: 'FlateDecode', colourSpace: 'DeviceRGB' });
        expect(image.alpha).toBeDefined();
        const pdf = await stampDutyPdf(calculateStampDuty({ price: 500_000 }), { logo: source.buffer });
        expect(expectWellFormed(pdf)).toBe(9);
        expect(text(pdf)).toContain('/SMask 9 0 R');
    });

    it('reads opaque, greyscale and palette PNGs, undoing the row filters', async () => {
        expect((await pdfImage(await png(1, 1, 2, [[1, 2, 3]]))).alpha).toBeUndefined();
        expect((await pdfImage(await png(2, 1, 0, [[10, 200]]))).width).toBe(2);
        const palette = await png(
            2,
            1,
            3,
            [[0, 1]],
            [
                ['PLTE', [255, 0, 0, 0, 0, 255]],
                ['tRNS', [255, 0]],
            ],
        );
        expect((await pdfImage(palette)).alpha).toBeDefined();
    });

    it('says what is wrong with a file it cannot use', async () => {
        await expect(pdfImage(new Uint8Array([71, 73, 70, 56]))).rejects.toThrow('JPEG or a PNG');
        const interlaced = await png(1, 1, 2, [[1, 2, 3]]);
        interlaced[28] = 1;
        await expect(pdfImage(interlaced)).rejects.toThrow('Interlaced');
    });
});
