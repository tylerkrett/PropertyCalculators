import { createFlow, INK, MUTED } from './pages';
import { drawTable, type PdfTable } from './table';
import { clampLines, textWidth, wrapText } from './text';
import { assertPdfImage, buildPdf, parseColour, type PdfImage, type Rgb } from './writer';

/*
 * The page every calculator prints: the brand across the top, the answer in large type, the
 * inputs that produced it, then the working as tables. A calculator only describes its content
 * (`PdfReport`); the brand (`PdfBrand`) is the same object whichever calculator made it.
 *
 * Nothing is cut off: text wraps inside the page (a newline in it starts a new line), and a
 * report too long for one page carries on over as many as it needs.
 */

export type { PdfTable } from './table';

/**
 * Whose document this is. Everything is optional: with nothing set the page is plain and unbranded.
 * Text prints in a built-in font, which has Latin-1 and the common typographic characters only.
 */
export interface PdfBrand {
    /** Shown top-left when there is no logo, and saved as the document's author. */
    name?: string;
    /** Accent colour as hex (`#1f5f5b`): the rule under the header and the headline figure. */
    colour?: string;
    /** A prepared logo, drawn top-left. JPEG or PNG; transparency is kept. */
    logo?: PdfImage;
    /** A line at the foot of every page: a web address, phone number or reference. */
    footer?: string;
    /** The small print under the figures. Pass `false` to leave it out. */
    notice?: string | false;
    /** Printed top-right as "18 November 2026". Defaults to today; `false` leaves it out. */
    date?: Date | false;
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

const ACCENT: Rgb = [0.12, 0.37, 0.36];
const LOGO = { width: 180, height: 44 };
const MONTHS = 'January February March April May June July August September October November December'.split(' ');

/**
 * "18 November 2026", built by hand so no locale data is needed. The day is the one in the local
 * time zone of wherever this runs, so a server and a browser in different zones can print
 * different days for the same instant. Throws a `RangeError` for an invalid date.
 */
export const formatPdfDate = (date: Date): string => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime()))
        throw new RangeError('The PDF date is not a valid date.');
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** Lays the whole report out, with or without page numbers, and returns each page's instructions. */
function compose(report: PdfReport, brand: PdfBrand, date: string | null, numbered: boolean): string[][] {
    const accent = parseColour(brand.colour, ACCENT);
    const flow = createFlow({ footer: brand.footer, colour: accent, numbered });
    const { left, right, top } = flow;
    const width = right - left;

    // Header: the logo scaled to fit its box (else the name), with the date opposite.
    let headerHeight = 16;
    if (brand.logo) {
        const scale = Math.min(LOGO.width / brand.logo.width, LOGO.height / brand.logo.height);
        headerHeight = brand.logo.height * scale;
        flow.page.image(left, top - headerHeight, brand.logo.width * scale, headerHeight);
    } else if (brand.name) {
        const beside = date ? textWidth(date, 9) + 24 : 0;
        const lines = clampLines(wrapText(brand.name, 15, width - beside, true), 3);
        flow.y = top - 13;
        flow.column(lines, left, 18, { size: 15, bold: true, colour: accent });
        headerHeight += Math.max(0, lines.length - 1) * 18;
    }
    if (date) flow.page.text(date, right, top - 11, { size: 9, colour: MUTED, align: 'right' });
    flow.y = top - headerHeight - 14;
    flow.page.rect(left, flow.y, width, 2, accent);

    flow.y -= 40;
    flow.block(wrapText(report.title, 21, width, true), left, 25, { size: 21, bold: true, colour: INK });
    if (report.subtitle) {
        flow.y -= 18;
        flow.block(wrapText(report.subtitle, 10.5, width), left, 14, { size: 10.5, colour: MUTED });
    }

    flow.y -= 36;
    flow.block(wrapText(report.headline.label, 10, width), left, 13, { colour: MUTED });
    flow.y -= 31;
    flow.block(wrapText(report.headline.value, 30, width, true), left, 34, { size: 30, bold: true, colour: accent });

    // Facts: labels in one column as wide as the longest (up to 45% of the page), values beside them.
    flow.y -= 32;
    const labels = report.facts.map((fact) => wrapText(fact.label, 10, width * 0.45));
    const labelWidth = Math.max(0, ...labels.flat().map((line) => textWidth(line, 10)));
    report.facts.forEach((fact, index) => {
        const values = wrapText(fact.value, 10, width - labelWidth - 28, true);
        const extra = (Math.max(1, labels[index]!.length, values.length) - 1) * 13;
        flow.fit(extra);
        flow.column(labels[index]!, left, 13, { colour: MUTED });
        flow.column(values, left + labelWidth + 28, 13, { bold: true, colour: INK });
        flow.y -= extra + 18;
    });

    for (const table of report.tables ?? []) drawTable(flow, table);

    flow.y -= 38;
    const notice = brand.notice === false ? [] : [brand.notice ?? DEFAULT_NOTICE];
    for (const paragraph of [...(report.notes ?? []), ...notice]) {
        for (const line of wrapText(paragraph, 8.5, width)) {
            flow.fit();
            flow.page.text(line, left, flow.y, { size: 8.5, colour: MUTED });
            flow.y -= 12;
        }
        flow.y -= 4;
    }
    return flow.finish();
}

/**
 * Lays a report out on A4 in the brand given, and returns the PDF's bytes. Most reports fill one
 * page; a longer one continues on further pages, each numbered "Page 1 of 2" in the footer.
 * Throws a `RangeError` for an invalid `date` or a `logo` that is not a well-formed `PdfImage`.
 */
export function renderPdf(report: PdfReport, brand: PdfBrand = {}): Uint8Array {
    if (brand.logo) assertPdfImage(brand.logo);
    const date = brand.date === false ? null : formatPdfDate(brand.date ?? new Date());
    let pages = compose(report, brand, date, false);
    // Page numbers need room in the footer, so a report that runs over is laid out again with it.
    if (pages.length > 1) pages = compose(report, brand, date, true);
    return buildPdf({
        pages,
        image: brand.logo ?? undefined,
        title: [report.title, report.subtitle].filter(Boolean).join(': '),
        author: brand.name,
    });
}
