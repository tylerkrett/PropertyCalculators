import type { PdfImage, PdfOptions } from '../pdf/index';

/*
 * What the "Download PDF" button does when clicked, kept apart from the button so it can be
 * tested without a DOM: fetch the PDF code, leave out a logo that can't be read, build the file,
 * save it, and report a failure instead of swallowing it.
 */

/** The PDF module, as the dynamic import gives it. */
export type PdfApi = typeof import('../pdf/index');

/** The parts of the PDF module the download itself uses. */
type DownloadApi = Pick<PdfApi, 'pdfImage' | 'downloadPdf'>;

/** Shown next to the button when the PDF can't be made. */
export const PDF_FAILED_MESSAGE = 'The PDF could not be created.';

const isPrepared = (logo: NonNullable<PdfOptions['logo']>): logo is PdfImage =>
    typeof logo === 'object' && 'filter' in logo && 'data' in logo;

/**
 * The options with the logo read and decoded up front. A logo that fails to load or decode is
 * left out, so a broken image URL costs the logo and not the whole file. Nothing else is caught.
 */
async function withUsableLogo(api: DownloadApi, options: PdfOptions): Promise<PdfOptions> {
    const { logo } = options;
    if (logo === undefined || isPrepared(logo)) return options;
    try {
        return { ...options, logo: await api.pdfImage(logo) };
    } catch {
        return { ...options, logo: undefined };
    }
}

/**
 * Builds the PDF and saves it. Resolves to `null` when the file was saved, or to the message to
 * show when it was not; it never rejects. A failure to fetch the PDF code, to build the file or
 * to save it is passed to `onError`. Only an unreadable logo is recovered from, by leaving it out.
 */
export async function downloadPdfFile<Api extends DownloadApi>({
    load,
    make,
    options,
    filename,
    onError,
}: {
    /** Fetches the PDF code: `() => import('../pdf/index')`. */
    load: () => Promise<Api>;
    /** Builds this calculator's PDF. */
    make: (api: Api, options: PdfOptions) => Promise<Uint8Array>;
    options: PdfOptions;
    filename: string;
    /** Told about any failure, with the error as thrown. */
    onError?: (error: unknown) => void;
}): Promise<string | null> {
    try {
        const api = await load();
        const bytes = await make(api, await withUsableLogo(api, options));
        api.downloadPdf(bytes, filename);
        return null;
    } catch (error) {
        try {
            onError?.(error);
        } catch {
            // A throwing callback must not turn into an unhandled rejection of the click.
        }
        return PDF_FAILED_MESSAGE;
    }
}
