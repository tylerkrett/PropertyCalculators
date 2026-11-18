import { getMortgageSummary, type MortgageSummaryInput, REPAYMENT_TYPES } from '../mortgage/index';
import {
    getRentalYieldSummary,
    RENT_PERIODS,
    RENTAL_YIELD_DEFAULTS,
    type RentalYieldInput,
} from '../rental-yield/index';
import { BUYER_TYPES, type StampDutyEstimate } from '../stamp-duty/estimate';
import { formatPounds, formatRate } from '../stamp-duty/format';
import { getLeaseStampDutyTable, getStampDutyTable, STAMP_DUTY_COLUMNS } from '../stamp-duty/labels';
import type { LeaseStampDuty } from '../stamp-duty/lease';
import { pdfImage, type PdfImageSource } from './image';
import { type PdfBrand, type PdfReport, renderPdf } from './layout';
import type { PdfImage } from './writer';

/*
 * A branded PDF of whatever a calculator worked out. Give it the result you already have and,
 * optionally, a name, a colour and a logo:
 *
 *   const pdf = await stampDutyPdf(calculateStampDuty({ price: 750_000 }), { name: 'Acme', colour: '#b3261e', logo: '/logo.png' });
 *   downloadPdf(pdf, 'stamp-duty.pdf');
 */

export { pdfImage, type PdfImageSource } from './image';
export { DEFAULT_NOTICE, formatPdfDate, type PdfBrand, type PdfReport, type PdfTable, renderPdf } from './layout';
export type { PdfImage } from './writer';

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

const headers = STAMP_DUTY_COLUMNS.map((column) => column.label);
type BandRow = Record<(typeof STAMP_DUTY_COLUMNS)[number]['key'], string>;
const cells = (row: BandRow) => STAMP_DUTY_COLUMNS.map((column) => row[column.key]);
const buyerLabel = (estimate: Pick<StampDutyEstimate, 'buyer'>) =>
    BUYER_TYPES.find((buyer) => buyer.value === estimate.buyer)?.label ?? estimate.buyer;
const residence = (nonUkResident: boolean) => (nonUkResident ? 'Not UK resident' : 'UK resident');

/** What the stamp duty calculator shows, as a report. */
export function stampDutyReport(estimate: StampDutyEstimate): PdfReport {
    const table = getStampDutyTable(estimate);
    const residential = estimate.propertyType === 'residential';
    return {
        title: 'Stamp duty estimate',
        headline: { label: 'Stamp duty to pay', value: estimate.formatted.stampDuty },
        facts: [
            { label: 'Property price', value: estimate.formatted.price },
            ...(residential
                ? [
                      { label: 'Buyer', value: buyerLabel(estimate) },
                      { label: 'Residence', value: residence(estimate.nonUkResident) },
                  ]
                : [{ label: 'Property type', value: 'Non-residential or mixed use' }]),
            { label: 'Effective rate', value: estimate.formatted.effectiveRate },
            { label: 'Price plus stamp duty', value: formatPounds(estimate.price + estimate.stampDuty) },
        ],
        tables: [
            {
                title: 'How this result was calculated',
                columns: headers,
                rows: table.rows.map(cells),
                totals: cells(table.totals),
                muted: estimate.bands.flatMap((band, index) => (band.taxable > 0 ? [] : [index])),
            },
        ],
    };
}

/** What the mortgage calculator shows, as a report; `null` when the input can't be calculated. */
export function mortgageReport(input: MortgageSummaryInput): PdfReport | null {
    const { summary } = getMortgageSummary(input);
    if (!summary) return null;
    const [lead, ...rows] = summary.rows;
    const type = REPAYMENT_TYPES.find((option) => option.value === input.type)?.label ?? input.type;
    return {
        title: 'Mortgage estimate',
        headline: { label: lead!.label, value: lead!.formatted },
        facts: [
            { label: 'Property price', value: formatPounds(input.price) },
            { label: 'Interest rate', value: formatRate(input.rate) },
            { label: 'Term', value: `${input.termYears} years` },
            { label: 'Type', value: type },
            ...rows.map((row) => ({ label: row.label, value: row.formatted })),
        ],
        notes: ['Cash needed upfront is the deposit plus stamp duty. Legal, survey and lender fees are extra.'],
    };
}

/** What a new-lease calculation shows, as a report: the premium and the rent, each with its working. */
export function leaseStampDutyReport(lease: LeaseStampDuty): PdfReport {
    const table = getLeaseStampDutyTable(lease);
    const [total] = table.summary.slice(-1);
    return {
        title: 'Stamp duty on a new lease',
        headline: { label: total!.label, value: total!.formatted },
        facts: [
            ...table.summary.slice(0, -1).map((item) => ({ label: item.label, value: item.formatted })),
            { label: 'Lease length', value: `${lease.termYears} years` },
        ],
        tables: [table.premium, table.rent].map((part) => ({
            title: part.label,
            columns: headers,
            rows: part.rows.map(cells),
            totals: cells(part.totals),
        })),
        notes: lease.notes,
    };
}

/** What the rental yield calculator shows, as a report; `null` when the input can't be calculated. */
export function rentalYieldReport(input: RentalYieldInput): PdfReport | null {
    const { summary } = getRentalYieldSummary(input);
    if (!summary) return null;
    const [lead, ...rows] = summary.rows;
    const period = RENT_PERIODS.find(
        (option) => option.value === (input.rentPeriod ?? RENTAL_YIELD_DEFAULTS.rentPeriod),
    );
    return {
        title: 'Rental yield estimate',
        headline: { label: lead!.label, value: lead!.formatted },
        facts: [
            { label: 'Property price', value: formatPounds(input.price) },
            { label: 'Rent', value: `${formatPounds(input.rent)} ${period?.label.toLowerCase() ?? ''}`.trim() },
            ...(input.voidWeeks ? [{ label: 'Empty weeks per year', value: String(input.voidWeeks) }] : []),
            ...rows.map((row) => ({ label: row.label, value: row.formatted })),
        ],
        notes: [
            'Gross yield is a full year of rent as a share of the price. Net yield is the rent after empty weeks and running costs, as a share of the price plus stamp duty and other purchase costs.',
        ],
    };
}

/** A stamp duty estimate as a PDF, in your brand. */
export const stampDutyPdf = (estimate: StampDutyEstimate, options?: PdfOptions) =>
    createPdf(stampDutyReport(estimate), options);

/** A mortgage calculation as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function mortgagePdf(input: MortgageSummaryInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = mortgageReport(input);
    if (!report) throw new RangeError(getMortgageSummary(input).error ?? 'That mortgage cannot be calculated.');
    return createPdf(report, options);
}

/** A rental yield calculation as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function rentalYieldPdf(input: RentalYieldInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = rentalYieldReport(input);
    if (!report) throw new RangeError(getRentalYieldSummary(input).error ?? 'That yield cannot be calculated.');
    return createPdf(report, options);
}

/** A new-lease stamp duty calculation as a PDF, in your brand. */
export const leaseStampDutyPdf = (lease: LeaseStampDuty, options?: PdfOptions) =>
    createPdf(leaseStampDutyReport(lease), options);

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
