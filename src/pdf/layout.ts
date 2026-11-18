import { buildPdf, createPage, PAGE, parseColour, type PdfImage, type Rgb, textWidth, wrapText } from './writer';

/*
 * The page every calculator prints: the brand across the top, the answer in large type, the
 * inputs that produced it, then the working as tables. A calculator only describes its content
 * (`PdfReport`); the brand (`PdfBrand`) is the same object whichever calculator made it.
 */

/** Whose document this is. Everything is optional: with nothing set the page is plain and unbranded. */
export interface PdfBrand {
    /** Shown top-left when there is no logo, and saved as the document's author. */
    name?: string;
    /** Accent colour as hex (`#1f5f5b`): the rule under the header and the headline figure. */
    colour?: string;
    /** A prepared logo, drawn top-left. JPEG or PNG; transparency is kept. */
    logo?: PdfImage;
    /** One line at the foot of the page: a web address, phone number or reference. */
    footer?: string;
    /** The small print under the figures. Pass `false` to leave it out. */
    notice?: string | false;
    /** Printed top-right as "18 November 2026". Defaults to today; `false` leaves it out. */
    date?: Date | false;
}

export interface PdfTable {
    title: string;
    /** The first column is left-aligned; the rest are figures, right-aligned. */
    columns: string[];
    rows: string[][];
    totals?: string[];
    /** Rows to print in the muted colour, by index: bands the price never reaches. */
    muted?: number[];
}

/** What one calculator has to say, as strings ready to print. */
export interface PdfReport {
    title: string;
    /** A line under the title, such as the property's address. */
    subtitle?: string;
    headline: { label: string; value: string };
    facts: { label: string; value: string }[];
    tables?: PdfTable[];
    /** Extra sentences printed before the notice, such as why a relief was not applied. */
    notes?: string[];
}

export const DEFAULT_NOTICE =
    'This is an estimate to help you plan, not tax or financial advice. Your solicitor and lender confirm the figures for your purchase.';

const INK: Rgb = [0.11, 0.14, 0.19];
const MUTED: Rgb = [0.4, 0.43, 0.48];
const LINE: Rgb = [0.86, 0.87, 0.89];
const ACCENT: Rgb = [0.12, 0.37, 0.36];
const LOGO = { width: 180, height: 44 };
const MONTHS = 'January February March April May June July August September October November December'.split(' ');

/** "18 November 2026", built by hand so the server and the browser print the same string. */
export const formatPdfDate = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

/** Lays a report out on one A4 page in the brand given, and returns the PDF's bytes. */
export function renderPdf(report: PdfReport, brand: PdfBrand = {}): Uint8Array {
    const page = createPage();
    const accent = parseColour(brand.colour, ACCENT);
    const left = PAGE.margin;
    const right = PAGE.width - PAGE.margin;
    const top = PAGE.height - PAGE.margin;

    // Header: the logo scaled to fit its box (else the name), with the date opposite.
    let headerHeight = 16;
    if (brand.logo) {
        const scale = Math.min(LOGO.width / brand.logo.width, LOGO.height / brand.logo.height);
        headerHeight = brand.logo.height * scale;
        page.image(left, top - headerHeight, brand.logo.width * scale, headerHeight);
    } else if (brand.name) page.text(brand.name, left, top - 13, { size: 15, bold: true, colour: accent });
    const date = brand.date === false ? null : formatPdfDate(brand.date ?? new Date());
    if (date) page.text(date, right, top - 11, { size: 9, colour: MUTED, align: 'right' });
    let y = top - headerHeight - 14;
    page.rect(left, y, right - left, 2, accent);

    y -= 40;
    page.text(report.title, left, y, { size: 21, bold: true, colour: INK });
    if (report.subtitle) {
        y -= 18;
        page.text(report.subtitle, left, y, { size: 10.5, colour: MUTED });
    }

    y -= 36;
    page.text(report.headline.label, left, y, { colour: MUTED });
    y -= 31;
    page.text(report.headline.value, left, y, { size: 30, bold: true, colour: accent });

    y -= 32;
    const labelWidth = Math.max(...report.facts.map((fact) => textWidth(fact.label, 10)), 0);
    for (const fact of report.facts) {
        page.text(fact.label, left, y, { colour: MUTED });
        page.text(fact.value, left + labelWidth + 28, y, { bold: true, colour: INK });
        y -= 18;
    }

    for (const table of report.tables ?? []) {
        y -= 22;
        page.text(table.title, left, y, { size: 12.5, bold: true, colour: INK });
        y -= 24;
        // Figures share the right-hand side: the last column ends at the margin, the others step left.
        const step = Math.min(110, (right - left - 190) / Math.max(1, table.columns.length - 1));
        const edge = (column: number) => right - (table.columns.length - 1 - column) * step;
        const cells = (values: string[], style: { bold?: boolean; size?: number; colour: Rgb }) =>
            values.forEach((value, column) =>
                column === 0
                    ? page.text(value, left, y, style)
                    : page.text(value, edge(column), y, { ...style, align: 'right' }),
            );
        cells(table.columns, { size: 9, colour: MUTED });
        y -= 8;
        page.line(left, right, y, LINE);
        table.rows.forEach((row, index) => {
            y -= 17;
            cells(row, { colour: table.muted?.includes(index) ? MUTED : INK });
            y -= 8;
            page.line(left, right, y, LINE);
        });
        if (table.totals) {
            y -= 19;
            cells(table.totals, { bold: true, colour: INK });
            y -= 10;
        }
    }

    y -= 38;
    const notice = brand.notice === false ? [] : [brand.notice ?? DEFAULT_NOTICE];
    for (const paragraph of [...(report.notes ?? []), ...notice]) {
        for (const line of wrapText(paragraph, 8.5, right - left)) {
            page.text(line, left, y, { size: 8.5, colour: MUTED });
            y -= 12;
        }
        y -= 4;
    }

    if (brand.footer) {
        page.line(left, right, PAGE.margin + 14, LINE);
        page.text(brand.footer, left, PAGE.margin, { size: 8.5, colour: accent });
    }

    return buildPdf({
        ops: page.ops,
        image: brand.logo,
        title: [report.title, report.subtitle].filter(Boolean).join(': '),
        author: brand.name,
    });
}
