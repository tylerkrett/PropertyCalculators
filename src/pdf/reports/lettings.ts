import {
    AREA_UNITS,
    type AreaUnit,
    comparePricePerArea,
    getPricePerAreaSummary,
    type PricePerAreaInput,
} from '../../price-per-area/index';
import { RENT_PERIODS, type RentPeriod } from '../../rental-yield/index';
import { formatNumber, formatPounds, formatPoundsAndPence } from '../../stamp-duty/format';
import {
    checkTenantDeposit,
    getTenantDepositSummary,
    TENANT_DEPOSIT_DEFAULTS,
    TENANT_DEPOSIT_JURISDICTION,
    type TenantDepositInput,
} from '../../tenant-deposit/index';
import { createPdf, type PdfOptions, rowsReport } from '../create';
import type { PdfReport } from '../layout';

/*
 * Reports for the lettings calculators: price per area and the tenant deposit caps. Each takes the
 * calculator's input, plus the optional figure its form compares the result with.
 */

/** A price-per-area input, optionally with the comparable average the result is set against. */
export type PricePerAreaReportInput = PricePerAreaInput & {
    /** A comparable average in pounds per `unit` (per year, for a rent), such as the street's. */
    comparable?: { perArea: number; unit: AreaUnit };
};

/** A tenant deposit input, optionally with the tenancy deposit being asked for. */
export type TenantDepositReportInput = TenantDepositInput & {
    /** The tenancy deposit proposed, in pounds: the report says whether it is within the cap. */
    proposedDeposit?: number;
};

/** The small print for the deposit caps: which law they are, where it applies, and what this is not. */
export const TENANT_DEPOSIT_NOTICE = `These are the caps set by the Tenant Fees Act 2019, which applies in ${TENANT_DEPOSIT_JURISDICTION}. Wales, Scotland and Northern Ireland have their own rules. This is a guide, not legal advice.`;

/** Whole pounds when there are no pence, pounds and pence otherwise. */
const money = (amount: number) => (Number.isInteger(amount) ? formatPounds(amount) : formatPoundsAndPence(amount));

/** `"£1,200 per month"`. */
const rentText = (rent: number, rentPeriod: RentPeriod) => {
    const period = RENT_PERIODS.find((option) => option.value === rentPeriod);
    return `${money(rent)} ${period?.label.toLowerCase() ?? ''}`.trim();
};

/** What the price per area calculator shows, as a report; `null` when the input can't be calculated. */
export function pricePerAreaReport(input: PricePerAreaReportInput): PdfReport | null {
    const { summary } = getPricePerAreaSummary(input);
    if (!summary) return null;

    const unit = AREA_UNITS.find((option) => option.value === input.areaUnit);
    const comparison = input.comparable ? comparePricePerArea(input, input.comparable) : null;
    const report = rowsReport(input.rentPeriod ? 'Rent per area' : 'Price per area', summary.rows, {
        facts: [
            { label: 'Listing', value: input.rentPeriod ? 'To let' : 'For sale' },
            ...(input.rentPeriod ? [{ label: 'Rent', value: rentText(input.amount, input.rentPeriod) }] : []),
            { label: 'Floor area', value: `${formatNumber(input.area, 2).replace(/\.?0+$/, '')} ${unit?.short}` },
        ],
        notes: ['One square metre is taken as 10.7639 square feet.'],
    });
    if (!comparison) return report;

    return {
        ...report,
        facts: [
            ...report.facts,
            { label: 'Comparable average', value: comparison.formatted.comparable },
            { label: 'Difference', value: comparison.formatted.difference },
            { label: 'Comparison', value: comparison.formatted.sentence },
        ],
    };
}

/** What the tenant deposit calculator shows, as a report; `null` when the input can't be calculated. */
export function tenantDepositReport(input: TenantDepositReportInput): PdfReport | null {
    const { summary } = getTenantDepositSummary(input);
    if (!summary) return null;

    const check = input.proposedDeposit === undefined ? null : checkTenantDeposit(input, input.proposedDeposit);
    return rowsReport('Tenant deposit caps', summary.rows, {
        facts: [
            { label: 'Rent', value: rentText(input.rent, input.rentPeriod ?? TENANT_DEPOSIT_DEFAULTS.rentPeriod) },
            ...(check ? [{ label: 'Proposed deposit', value: check.formatted.sentence }] : []),
        ],
        notes: [
            'Each maximum is rounded down to the penny, so it is always safe to charge. Joint tenants share one cap.',
            TENANT_DEPOSIT_NOTICE,
        ],
    });
}

/** A price-per-area calculation as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function pricePerAreaPdf(input: PricePerAreaReportInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = pricePerAreaReport(input);
    if (!report) {
        throw new RangeError(getPricePerAreaSummary(input).error ?? 'That price per area cannot be calculated.');
    }
    return createPdf(report, options);
}

/**
 * The tenant deposit caps as a PDF, in your brand. Rejects when the input can't be calculated.
 * The report carries its own small print (`TENANT_DEPOSIT_NOTICE`), so the default notice about
 * buying a property is left out unless you pass a `notice` of your own.
 */
export async function tenantDepositPdf(input: TenantDepositReportInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = tenantDepositReport(input);
    if (!report) throw new RangeError(getTenantDepositSummary(input).error ?? 'Those caps cannot be calculated.');
    return createPdf(report, { ...options, notice: options?.notice ?? false });
}
