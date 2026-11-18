import { BUYING_COSTS_DEFAULTS, type BuyingCostsInput, getBuyingCostsSummary } from '../../buying-costs/index';
import {
    FEE_PAYMENTS,
    formatDuration,
    getOverpaymentSummary,
    getRemortgageSummary,
    OVERPAYMENT_DEFAULTS,
    type OverpaymentInput,
    REMORTGAGE_DEFAULTS,
    type RemortgageInput,
} from '../../overpayment/index';
import { toTermMonths } from '../../overpayment/loan';
import { BUYER_TYPES } from '../../stamp-duty/estimate';
import { formatPounds, formatRate } from '../../stamp-duty/format';
import { createPdf, type PdfOptions, rowsReport } from '../create';
import type { PdfReport } from '../layout';

/*
 * The reports for the calculators that sit beside the mortgage one: overpayments, remortgaging
 * and the cost of buying. Each prints the calculator's headline, the inputs that produced it,
 * then the rest of its rows.
 */

/** What the overpayment calculator shows, as a report; `null` when the input can't be calculated. */
export function overpaymentReport(input: OverpaymentInput): PdfReport | null {
    const { summary } = getOverpaymentSummary(input);
    if (!summary) return null;
    return rowsReport('Mortgage overpayment estimate', summary.rows, {
        facts: [
            { label: 'Mortgage balance', value: formatPounds(input.balance) },
            { label: 'Interest rate', value: formatRate(input.rate) },
            { label: 'Time left', value: formatDuration(toTermMonths(input)) },
            {
                label: 'Monthly overpayment',
                value: formatPounds(input.monthlyOverpayment ?? OVERPAYMENT_DEFAULTS.monthlyOverpayment),
            },
            { label: 'Lump sum paid today', value: formatPounds(input.lumpSum ?? OVERPAYMENT_DEFAULTS.lumpSum) },
        ],
        notes: [
            'This assumes the interest rate stays the same for the whole term and that your lender makes no charge for overpaying.',
        ],
    });
}

/** What the remortgage calculator shows, as a report; `null` when the input can't be calculated. */
export function remortgageReport(input: RemortgageInput): PdfReport | null {
    const { summary } = getRemortgageSummary(input);
    if (!summary) return null;
    const feePayment = input.feePayment ?? REMORTGAGE_DEFAULTS.feePayment;
    const fixedYears = input.fixedYears ?? REMORTGAGE_DEFAULTS.fixedYears;
    return rowsReport('Remortgage comparison', summary.rows, {
        facts: [
            { label: 'Mortgage balance', value: formatPounds(input.balance) },
            { label: 'Current rate', value: formatRate(input.currentRate) },
            { label: 'New rate', value: formatRate(input.newRate) },
            { label: 'Time left', value: formatDuration(toTermMonths(input)) },
            { label: 'Product fee', value: formatPounds(input.productFee ?? REMORTGAGE_DEFAULTS.productFee) },
            {
                label: 'Product fee is',
                value: FEE_PAYMENTS.find((option) => option.value === feePayment)?.label ?? feePayment,
            },
            {
                label: 'Early repayment charge',
                value: formatPounds(input.earlyRepaymentCharge ?? REMORTGAGE_DEFAULTS.earlyRepaymentCharge),
            },
            { label: 'Fixed period', value: formatDuration(fixedYears * 12) },
        ],
        notes: ['This assumes both deals are repaid over the same remaining term and that each rate stays the same.'],
    });
}

/** What the buying costs calculator shows, as a report; `null` when the input can't be calculated. */
export function buyingCostsReport(input: BuyingCostsInput): PdfReport | null {
    const { summary } = getBuyingCostsSummary(input);
    if (!summary) return null;
    const buyer = input.buyer ?? BUYING_COSTS_DEFAULTS.buyer;
    return rowsReport('Cost of buying estimate', summary.rows, {
        facts: [
            { label: 'Property price', value: formatPounds(input.price) },
            { label: 'Buyer', value: BUYER_TYPES.find((option) => option.value === buyer)?.label ?? buyer },
        ],
        tables: [
            {
                title: 'Where the cash goes',
                columns: ['Item', 'Amount', 'Share of cash upfront'],
                rows: summary.items
                    .filter((item) => item.value > 0)
                    .map((item) => [item.label, item.formatted, item.formattedShare]),
            },
        ],
        notes: [
            'The fees are the figures you entered, assumed to be paid in cash on or before completion; the stamp duty is worked out from the price and buyer type.',
        ],
    });
}

/** A mortgage overpayment calculation as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function overpaymentPdf(input: OverpaymentInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = overpaymentReport(input);
    if (!report) throw new RangeError(getOverpaymentSummary(input).error ?? 'That overpayment cannot be calculated.');
    return createPdf(report, options);
}

/** A remortgage comparison as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function remortgagePdf(input: RemortgageInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = remortgageReport(input);
    if (!report) throw new RangeError(getRemortgageSummary(input).error ?? 'That remortgage cannot be calculated.');
    return createPdf(report, options);
}

/** The cost of buying as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function buyingCostsPdf(input: BuyingCostsInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = buyingCostsReport(input);
    if (!report) throw new RangeError(getBuyingCostsSummary(input).error ?? 'Those costs cannot be calculated.');
    return createPdf(report, options);
}
