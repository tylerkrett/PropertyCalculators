import {
    getLandlordIncomeSummary,
    LANDLORD_COSTS,
    LANDLORD_INCOME_DEFAULTS,
    LANDLORD_INCOME_NOTICE,
    LANDLORD_TAX_YEARS,
    LANDLORD_VAT_RATE,
    type LandlordIncomeInput,
} from '../../landlord-income/index';
import { RENT_PERIODS } from '../../rental-yield/index';
import { formatPounds, formatPoundsAndPence, formatRate } from '../../stamp-duty/format';
import { createPdf, type PdfOptions, rowsReport } from '../create';
import type { PdfReport } from '../layout';

/*
 * The landlord net income calculator as a report: what the landlord keeps, the inputs it was
 * worked out from, then every step of the sum.
 */

/** What the landlord income report is made from: the calculator's own input. */
export type LandlordIncomeReportInput = LandlordIncomeInput;

type Fact = PdfReport['facts'][number];

/** Whole pounds when there are no pence, pounds and pence otherwise. */
const money = (amount: number) => (Number.isInteger(amount) ? formatPounds(amount) : formatPoundsAndPence(amount));
/** A fact for an optional amount, left out when it is missing or zero. */
const optional = (label: string, value: number | undefined): Fact[] => (value ? [{ label, value: money(value) }] : []);

/** What the landlord income calculator shows, as a report; `null` when the input can't be calculated. */
export function landlordIncomeReport(input: LandlordIncomeReportInput): PdfReport | null {
    const { summary } = getLandlordIncomeSummary(input);
    if (!summary) return null;

    const rentPeriod = input.rentPeriod ?? LANDLORD_INCOME_DEFAULTS.rentPeriod;
    const period = RENT_PERIODS.find((option) => option.value === rentPeriod)?.label.toLowerCase() ?? '';
    const vat = input.feesIncludeVat ? 'including VAT' : `plus VAT at ${LANDLORD_VAT_RATE}%`;
    return rowsReport('Landlord net income', summary.rows, {
        facts: [
            { label: 'Tax year', value: LANDLORD_TAX_YEARS[summary.taxYear].label },
            { label: 'Rent', value: `${money(input.rent)} ${period}`.trim() },
            ...(input.voidWeeks ? [{ label: 'Empty weeks per year', value: String(input.voidWeeks) }] : []),
            ...(input.managementFeePercent
                ? [{ label: 'Management fee rate', value: `${formatRate(input.managementFeePercent)} of rent, ${vat}` }]
                : []),
            ...LANDLORD_COSTS.flatMap(({ key, label }) => optional(label, input[key])),
            ...optional('Other income', input.otherIncome),
        ],
        notes: [...summary.notes, LANDLORD_INCOME_NOTICE],
    });
}

/**
 * A landlord's net income as a PDF, in your brand. Rejects when the input can't be calculated.
 * The report carries its own small print (`LANDLORD_INCOME_NOTICE`), so the default notice about
 * buying a property is left out unless you pass a `notice` of your own.
 */
export async function landlordIncomePdf(input: LandlordIncomeReportInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = landlordIncomeReport(input);
    if (!report) throw new RangeError(getLandlordIncomeSummary(input).error ?? 'That income cannot be calculated.');
    return createPdf(report, { ...options, notice: options?.notice ?? false });
}
