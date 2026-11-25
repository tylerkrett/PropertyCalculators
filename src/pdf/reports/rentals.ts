import { RENT_PERIODS, type RentPeriod } from '../../rental-yield/index';
import { getRentConversionSummary, RENT_CONVERTER_DEFAULTS, type RentConverterInput } from '../../rent-converter/index';
import { formatPounds, formatPoundsAndPence } from '../../stamp-duty/format';
import {
    getTenantAffordabilitySummary,
    TENANT_AFFORDABILITY_DEFAULTS,
    TENANT_AFFORDABILITY_NOTICE,
    type TenantAffordabilityInput,
} from '../../tenant-affordability/index';
import { createPdf, type PdfOptions, rowsReport } from '../create';
import type { PdfReport } from '../layout';

/*
 * Reports for the rentals calculators: the rent converter and the tenant affordability check.
 * Each takes the calculator's own input. Neither is about buying a property, so both leave out the
 * default notice and carry their own small print, unless you pass a `notice` of your own.
 */

export type RentConverterReportInput = RentConverterInput;
export type TenantAffordabilityReportInput = TenantAffordabilityInput;

/** The small print for a rent conversion: how the periods relate. */
export const RENT_CONVERTER_NOTICE =
    'A year is taken as 52 weeks or 12 months, so a month’s rent is the weekly rent times 52, divided by 12. A day’s rent is the year’s rent divided by 365. Each figure is rounded to the nearest penny.';

/** Whole pounds when there are no pence, pounds and pence otherwise. */
const money = (amount: number) => (Number.isInteger(amount) ? formatPounds(amount) : formatPoundsAndPence(amount));

/** `"£650 per week"`. */
const rentText = (rent: number, rentPeriod: RentPeriod) => {
    const period = RENT_PERIODS.find((option) => option.value === rentPeriod);
    return `${money(rent)} ${period?.label.toLowerCase() ?? ''}`.trim();
};

/** What the rent converter shows, as a report; `null` when the input can't be calculated. */
export function rentConverterReport(input: RentConverterReportInput): PdfReport | null {
    const { summary } = getRentConversionSummary(input);
    if (!summary) return null;

    return rowsReport('Rent conversion', summary.rows, {
        facts: [
            { label: 'Rent', value: rentText(input.rent, input.period ?? RENT_CONVERTER_DEFAULTS.period) },
            ...(summary.tenants > 1 ? [{ label: 'Tenants', value: String(summary.tenants) }] : []),
        ],
        notes: [RENT_CONVERTER_NOTICE],
    });
}

/** What the tenant affordability calculator shows, as a report; `null` when the input can't be calculated. */
export function tenantAffordabilityReport(input: TenantAffordabilityReportInput): PdfReport | null {
    const { summary } = getTenantAffordabilitySummary(input);
    if (!summary) return null;

    const period = input.rentPeriod ?? TENANT_AFFORDABILITY_DEFAULTS.rentPeriod;
    return rowsReport('Tenant affordability check', summary.rows, {
        facts: [
            { label: 'Rent', value: rentText(input.rent, period) },
            { label: 'Income test', value: summary.formatted.multiple },
            { label: 'Guarantor test', value: summary.formatted.guarantorMultiple },
            ...(summary.tenants > 1 ? [{ label: 'Tenants', value: String(summary.tenants) }] : []),
            ...(summary.income === null ? [] : [{ label: 'Combined annual income', value: money(summary.income) }]),
        ],
        notes: [TENANT_AFFORDABILITY_NOTICE],
    });
}

/** A rent conversion as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function rentConverterPdf(input: RentConverterReportInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = rentConverterReport(input);
    if (!report) throw new RangeError(getRentConversionSummary(input).error ?? 'That rent cannot be converted.');
    return createPdf(report, { ...options, notice: options?.notice ?? false });
}

/**
 * A tenant affordability check as a PDF, in your brand. Rejects when the input can't be calculated.
 * The report carries its own small print (`TENANT_AFFORDABILITY_NOTICE`).
 */
export async function tenantAffordabilityPdf(
    input: TenantAffordabilityReportInput,
    options?: PdfOptions,
): Promise<Uint8Array> {
    const report = tenantAffordabilityReport(input);
    if (!report) {
        throw new RangeError(getTenantAffordabilitySummary(input).error ?? 'That check cannot be calculated.');
    }
    return createPdf(report, { ...options, notice: options?.notice ?? false });
}
