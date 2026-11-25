import { describe, expect, it } from 'vitest';

import { createPdf, formatPdfDate, type PdfReport, renderPdf } from '../src/pdf/index';
import { PAGE, textWidth } from '../src/pdf/writer';
import { BASE, DATE, expectWellFormed, latin1, type PrintedText, readPages, readText } from './pdf.helpers';

const RIGHT = PAGE.width - PAGE.margin;
const SUBTITLE =
    'Flat 12, The Old Brewery Apartments, 145-147 Upper Richmond Road West, East Sheen, London SW14 8DU, United Kingdom';
const NAME = 'Hamptons International Sales and Lettings Limited (Kensington and Chelsea)';

/** Every printed line starts on the page and ends before the right-hand margin. */
function expectInsideThePage(pages: PrintedText[][]) {
    for (const item of pages.flat()) {
        expect(item.x).toBeGreaterThanOrEqual(PAGE.margin - 0.01);
        expect(item.x + textWidth(item.text, item.size, item.bold)).toBeLessThanOrEqual(RIGHT + 0.01);
        expect(item.y).toBeGreaterThanOrEqual(PAGE.margin);
        expect(item.y).toBeLessThan(PAGE.height - PAGE.margin);
    }
}

const schedule = (rows: number): PdfReport => ({
    ...BASE,
    facts: Array.from({ length: 12 }, (_, i) => ({ label: `F${i}`, value: 'v' })),
    tables: [
        {
            title: 'Schedule',
            columns: ['Year', 'Balance'],
            rows: Array.from({ length: rows }, (_, i) => [`Year ${i + 1}`, `£${1000 + i}`]),
            totals: ['Total', '£99'],
        },
    ],
});

describe('a report too long for one page', () => {
    it('carries on over a second page with every row present', async () => {
        const pdf = await createPdf(schedule(25), { date: DATE, footer: 'acme.example' });
        expect(expectWellFormed(pdf)).toBe(9);
        expect(latin1(pdf)).toContain('/Kids [3 0 R 8 0 R] /Count 2');
        const pages = readPages(pdf);
        expect(pages).toHaveLength(2);
        expectInsideThePage(pages);
        const printed = pages.flat().map((item) => item.text);
        for (let year = 1; year <= 25; year++) {
            expect(printed.filter((value) => value === `Year ${year}`)).toHaveLength(1);
            expect(printed).toContain(`£${999 + year}`);
        }
        expect(printed.indexOf('Year 25')).toBeGreaterThan(printed.indexOf('Year 24'));
        expect(printed).toContain('Total');
    });

    it('repeats the table header and puts the footer and page number on each page', async () => {
        const pages = readPages(await createPdf(schedule(25), { date: DATE, footer: 'acme.example' }));
        pages.forEach((page, index) => {
            const printed = page.map((item) => item.text);
            expect(printed.filter((value) => value === 'Balance')).toHaveLength(1);
            expect(printed.slice(-2)).toEqual(['acme.example', `Page ${index + 1} of 2`]);
            // Nothing but the footer is printed in the footer's zone.
            for (const item of page.slice(0, -2)) expect(item.y).toBeGreaterThanOrEqual(PAGE.margin + 26);
        });
        // The second page opens with the header row, then the next row of the table.
        expect(pages[1]!.slice(0, 3).map((item) => item.text)).toEqual([
            'Year',
            'Balance',
            expect.stringMatching(/^Year \d+$/),
        ]);
        expect(pages[1]![0]!.y).toBeCloseTo(PAGE.height - PAGE.margin - 12);
        // The title and date are printed once only.
        expect(pages[1]!.map((item) => item.text)).not.toContain('T');
    });

    it('numbers pages when there is no footer text, and never numbers a single page', async () => {
        const pages = readPages(await createPdf(schedule(40), { date: DATE }));
        expect(pages.length).toBeGreaterThan(1);
        pages.forEach((page, index) => expect(page.at(-1)!.text).toBe(`Page ${index + 1} of ${pages.length}`));
        expectInsideThePage(pages);
        expect(readText(await createPdf(schedule(3), { date: DATE })).join(' ')).not.toMatch(/Page \d/);
    });

    it('runs to as many pages as the content needs, with a logo and its mask', async () => {
        const report = { ...schedule(120), notes: [`${'A long note about the working. '.repeat(400)}`] };
        const logo = { width: 4, height: 2, data: new Uint8Array(3), filter: 'FlateDecode', colourSpace: 'DeviceRGB' };
        const pdf = renderPdf(report, { date: DATE, logo: { ...logo, alpha: new Uint8Array(2) } as never });
        const pages = readPages(pdf);
        expect(pages.length).toBeGreaterThan(4);
        expect(expectWellFormed(pdf)).toBe(9 + (pages.length - 1) * 2);
        expect(latin1(pdf)).toContain(`/Kids [3 0 R 10 0 R 12 0 R`);
        expectInsideThePage(pages);
        const printed = pages.flat().map((item) => item.text);
        for (let year = 1; year <= 120; year++) expect(printed).toContain(`Year ${year}`);
        expect(printed.join(' ').match(/\bnote\b/g)).toHaveLength(400);
    });
});

describe('long and multi-line strings', () => {
    it('wraps a long subtitle and a long brand name inside the page', async () => {
        const pdf = await createPdf(BASE, {
            date: DATE,
            name: NAME,
            subtitle: SUBTITLE,
            footer: `${SUBTITLE} ${SUBTITLE}`,
        });
        const pages = readPages(pdf);
        expectInsideThePage(pages);
        const [page] = pages;
        const date = page!.find((item) => item.text === '18 November 2026')!;
        const name = page!.filter((item) => item.size === 15);
        expect(name.length).toBeGreaterThan(1);
        expect(name.map((item) => item.text).join(' ')).toBe(NAME);
        // The name stops short of the date instead of running into it.
        for (const line of name) expect(line.x + textWidth(line.text, 15, true)).toBeLessThan(date.x);
        const subtitle = page!.filter((item) => item.size === 10.5);
        expect(subtitle.length).toBe(2);
        expect(subtitle.map((item) => item.text).join(' ')).toBe(SUBTITLE);
        // The header rule and everything under it moved down to make room: nothing overlaps.
        const ys = page!.filter((item) => item.x === PAGE.margin).map((item) => item.y);
        expect(new Set(ys).size).toBe(ys.length);
        const footer = page!.filter((item) => item.size === 8.5 && item.y < PAGE.margin + 30);
        expect(footer.map((item) => item.text).join(' ')).toBe(`${SUBTITLE} ${SUBTITLE}`);
        expect(latin1(pdf)).toContain('/Author (Hamptons International Sales and Lettings Limited \\(Kensington');
    });

    it('starts a new line at a newline and prints other control characters as a space', async () => {
        const report: PdfReport = {
            title: 'Deposit\ncheck',
            headline: { label: 'L', value: 'V' },
            facts: [{ label: 'Address', value: '1 High St\r\nLondon\tW9' }],
            notes: ['First line.\nSecond line.'],
        };
        const pdf = await createPdf(report, { date: DATE, subtitle: '1 High St\nLondon', notice: false });
        const pages = readPages(pdf);
        const printed = pages[0]!.map((item) => item.text);
        expect(printed).toEqual(
            expect.arrayContaining([
                'Deposit',
                'check',
                '1 High St',
                'London',
                'London W9',
                'First line.',
                'Second line.',
            ]),
        );
        expect(printed.join('')).not.toContain('?');
        // The two lines of the address sit one under the other, and the next thing clears them.
        const [first, second] = pages[0]!.filter((item) => item.bold && item.size === 10);
        expect(first).toMatchObject({ text: '1 High St' });
        expect(second).toMatchObject({ text: 'London W9', x: first!.x, y: first!.y - 13 });
        expect(latin1(pdf)).toContain('/Title (Deposit check: 1 High St London)');
    });

    it('breaks a word too long for the line, such as a web address', async () => {
        const url = `https://example.com/${'a'.repeat(200)}`;
        const report = { ...BASE, facts: [{ label: url, value: url }], notes: [`${url} tail`] };
        const pages = readPages(await createPdf(report, { date: DATE, notice: false }));
        expectInsideThePage(pages);
        const small = pages[0]!.filter((item) => item.size === 8.5).map((item) => item.text);
        expect(small.length).toBeGreaterThan(2);
        expect(small.join('')).toBe(`${url} tail`);
        const value = pages[0]!.filter((item) => item.bold && item.size === 10);
        expect(value.map((item) => item.text).join('')).toBe(url);
    });

    it('wraps table cells so a wide first column cannot overprint the figures', async () => {
        const wide = 'Rent for the first five years of the term, as set out in the lease, before any review '.repeat(2);
        const table = { title: 'Working', columns: ['Band', 'Rate', 'Tax'], rows: [[wide.trim(), '2%', '£1,000']] };
        const pages = readPages(
            await createPdf({
                ...BASE,
                tables: [table, { ...table, rows: [['Short', '5%', '£123,456,789,012,345']] }],
            }),
        );
        expectInsideThePage(pages);
        const page = pages[0]!;
        const rate = page.find((item) => item.text === '2%')!;
        const cell = page.filter(
            (item) => item.size === 10 && !item.bold && item.x === PAGE.margin && item.text !== 'L',
        );
        expect(cell.map((item) => item.text).join(' ')).toContain(wide.trim());
        expect(cell.length).toBeGreaterThan(2);
        for (const line of cell) expect(line.x + textWidth(line.text, 10)).toBeLessThan(rate.x);
        // A figure too wide for the usual column widens it instead of running into its neighbour.
        const big = page.find((item) => item.text === '£123,456,789,012,345')!;
        const five = page.find((item) => item.text === '5%')!;
        expect(five.x + textWidth('5%', 10)).toBeLessThan(big.x);
    });
});

describe('dates and document properties', () => {
    it('refuses a date that is not a date', async () => {
        await expect(createPdf(BASE, { date: new Date('nope') })).rejects.toThrow(RangeError);
        expect(() => renderPdf(BASE, { date: new Date(Number.NaN) })).toThrow('not a valid date');
        expect(() => formatPdfDate(new Date('nope'))).toThrow(RangeError);
        expect(formatPdfDate(DATE)).toBe('18 November 2026');
    });

    it('writes a title and author with characters past ASCII as UTF-16', async () => {
        const body = latin1(await createPdf({ ...BASE, title: 'Café – costs' }, { name: 'Smith’s – Co', date: DATE }));
        const hex = (value: string) =>
            `<FEFF${[...value].map((char) => char.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join('')}>`;
        expect(body).toContain(`/Title ${hex('Café – costs')}`);
        expect(body).toContain(`/Author ${hex('Smith’s – Co')}`);
        expect(hex('’')).toBe('<FEFF2019>');
        // Plain ASCII stays readable, with its brackets escaped.
        expect(latin1(await createPdf({ ...BASE, title: 'A (b)' }, { name: 'Acme) /X (y' }))).toContain(
            '/Title (A \\(b\\)) /Author (Acme\\) /X \\(y)',
        );
    });
});
