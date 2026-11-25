import { describe, expect, it } from 'vitest';

import {
    createPdf,
    leaseStampDutyPdf,
    mortgagePdf,
    mortgageReport,
    stampDutyPdf,
    stampDutyReport,
} from '../src/pdf/index';
import { literal, parseColour, textWidth, wrapText } from '../src/pdf/writer';
import { calculateLeaseStampDuty, calculateStampDuty } from '../src/stamp-duty/index';
import { DATE, expectWellFormed, latin1, readPages, readText } from './pdf.helpers';

const text = latin1;

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

    it('prints one page with every line in its usual place and order', async () => {
        const pages = readPages(await stampDutyPdf(estimate, { date: DATE, name: 'Acme', footer: 'acme.example' }));
        expect(pages).toHaveLength(1);
        const printed = pages[0]!.map((item) => item.text);
        expect(printed.slice(0, 7)).toEqual([
            'Acme',
            '18 November 2026',
            'Stamp duty estimate',
            'Stamp duty to pay',
            '£156,250',
            'Property price',
            '£1,250,000',
        ]);
        expect(printed.slice(-2)).toEqual([expect.stringContaining('This is an estimate'), 'acme.example']);
        expect(printed).not.toContain(expect.stringMatching(/^Page /));
        // The title sits 54 points under the header rule and the footer on the bottom margin.
        expect(pages[0]![2]).toMatchObject({ x: 56, y: 715.89, size: 21, bold: true });
        expect(pages[0]!.at(-1)).toMatchObject({ x: 56, y: 56, size: 8.5 });
        expect(readText(await stampDutyPdf(estimate, { date: DATE }))).toEqual(printed.slice(1, -1));
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
