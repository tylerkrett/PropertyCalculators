import { base64Encode } from '../bytes';
import { pdfImage, type PdfImageSource } from './image';
import { type PdfBrand, type PdfReport, renderPdf } from './layout';
import type { PdfImage } from './writer';

/*
 * Turning a report into a PDF in a brand, and the helpers every calculator's report shares.
 */

/**
 * The brand, plus what is particular to one document.
 *
 * Text is printed in a font built into every PDF reader, which has Latin-1 (English and western
 * European letters) and the common typographic characters: the euro, curly quotes, dashes and
 * the bullet. Other accented letters print as their base letter, and anything else (other
 * scripts, emoji) prints as `?`.
 */
export type PdfOptions = Omit<PdfBrand, 'logo'> & {
    /**
     * A JPEG or PNG: its URL, bytes, a `File`, or one prepared earlier with `pdfImage`. A `null`
     * from untyped code is treated as leaving it out. On a server, never pass a URL that came
     * from a user: it is fetched from wherever it points.
     */
    logo?: PdfImageSource | PdfImage;
    /** Printed under the title, such as the property's address. */
    subtitle?: string;
};

const isPrepared = (logo: PdfImageSource | PdfImage): logo is PdfImage =>
    typeof logo === 'object' && 'filter' in logo && 'data' in logo;
/** A logo as `renderPdf` takes it; a prepared one is passed on to be checked there. */
const prepare = async (logo: PdfOptions['logo'] | null) =>
    logo === undefined || logo === null ? undefined : isPrepared(logo) ? logo : pdfImage(logo);

/**
 * Prints any report in a brand: the route for a calculator of your own. Rejects with a
 * `RangeError` for a logo that cannot be used or a `date` that is not a valid date.
 */
export async function createPdf(report: PdfReport, { logo, subtitle, ...brand }: PdfOptions = {}): Promise<Uint8Array> {
    return renderPdf({ ...report, subtitle: subtitle ?? report.subtitle }, { ...brand, logo: await prepare(logo) });
}

/**
 * A report from a summary's labelled rows: the first row is the headline, the rest follow the
 * `facts` given (the inputs, usually) as more facts.
 */
export function rowsReport(
    title: string,
    rows: readonly { label: string; formatted: string }[],
    extra: Partial<Omit<PdfReport, 'title' | 'headline'>> = {},
): PdfReport {
    const [lead, ...rest] = rows;
    if (!lead) throw new RangeError('A report needs at least one row.');
    return {
        ...extra,
        title,
        headline: { label: lead.label, value: lead.formatted },
        facts: [...(extra.facts ?? []), ...rest.map((row) => ({ label: row.label, value: row.formatted }))],
    };
}

/**
 * In a browser, saves the bytes as a file. On a server, send them as `application/pdf` instead.
 * In React Native there is no page to download from, so this throws: write `pdfBase64(pdf)` to a
 * file with the app's file-system module and open or share that.
 */
export function downloadPdf(pdf: Uint8Array, filename = 'estimate.pdf'): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function')
        throw new Error(
            'downloadPdf needs a browser. In React Native, save pdfBase64(pdf) with your file-system module; on a server, send the bytes as application/pdf.',
        );
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // Once the click has been handed to the browser's downloader.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The PDF as base64 text: what React Native's file-system and sharing modules take, and the body
 * of a `data:application/pdf;base64,` URL.
 */
export const pdfBase64 = (pdf: Uint8Array): string => base64Encode(pdf);
