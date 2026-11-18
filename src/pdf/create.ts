import { pdfImage, type PdfImageSource } from './image';
import { type PdfBrand, type PdfReport, renderPdf } from './layout';
import type { PdfImage } from './writer';

/*
 * Turning a report into a PDF in a brand, and the helpers every calculator's report shares.
 */

/** The brand, plus what is particular to one document. */
export type PdfOptions = Omit<PdfBrand, 'logo'> & {
    /** A JPEG or PNG: its URL, bytes, a `File`, or one prepared earlier with `pdfImage`. */
    logo?: PdfImageSource | PdfImage;
    /** Printed under the title, such as the property's address. */
    subtitle?: string;
};

const isPrepared = (logo: PdfImageSource | PdfImage): logo is PdfImage =>
    typeof logo === 'object' && 'filter' in logo && 'data' in logo;

/** Prints any report in a brand: the route for a calculator of your own. */
export async function createPdf(report: PdfReport, { logo, subtitle, ...brand }: PdfOptions = {}): Promise<Uint8Array> {
    return renderPdf(
        { ...report, subtitle: subtitle ?? report.subtitle },
        { ...brand, logo: logo === undefined ? undefined : isPrepared(logo) ? logo : await pdfImage(logo) },
    );
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

/** In a browser, saves the bytes as a file. On a server, send them as `application/pdf` instead. */
export function downloadPdf(pdf: Uint8Array, filename = 'estimate.pdf'): void {
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // Once the click has been handed to the browser's downloader.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
