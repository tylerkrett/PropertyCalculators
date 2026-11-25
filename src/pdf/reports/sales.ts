import {
    CAPITAL_GAINS_DEFAULTS,
    CAPITAL_GAINS_NOTICE,
    CAPITAL_GAINS_TAX_YEARS,
    type CapitalGainsInput,
    getCapitalGainsSummary,
} from '../../capital-gains/index';
import { getSellingCostsSummary, type SellingCostsInput } from '../../selling-costs/index';
import { formatPounds, formatPoundsAndPence, formatRate } from '../../stamp-duty/format';
import { createPdf, type PdfOptions, rowsReport } from '../create';
import type { PdfReport } from '../layout';

/*
 * Reports for the calculators a seller uses: the cost of selling with the money left after it,
 * and capital gains tax on a property that is not the seller's only home.
 */

/** What the selling costs report takes: the calculator's input. */
export type SellingCostsReportInput = SellingCostsInput;

/** What the capital gains report takes: the calculator's input. */
export type CapitalGainsReportInput = CapitalGainsInput;

/** The small print for the cost of selling, in place of the default notice, which is worded for a purchase. */
export const SELLING_COSTS_NOTICE =
    'This is an estimate to help you plan, not tax or financial advice. Your solicitor, agent and lender confirm the figures for your sale.';

/** Whole pounds when there are no pence, pounds and pence otherwise. */
const money = (amount: number) => (Number.isInteger(amount) ? formatPounds(amount) : formatPoundsAndPence(amount));

/** What the selling costs calculator shows, as a report; `null` when the input can't be calculated. */
export function sellingCostsReport(input: SellingCostsReportInput): PdfReport | null {
    const { summary } = getSellingCostsSummary(input);
    if (!summary) return null;
    return rowsReport('Cost of selling estimate', summary.rows, {
        tables: [
            {
                title: 'Where the sale price goes',
                columns: ['Item', 'Amount', 'Share of sale price'],
                rows: summary.items
                    .filter((item) => item.value > 0)
                    .map((item) => [item.label, item.formatted, item.formattedShare]),
            },
        ],
        notes: [
            ...(summary.shortfall
                ? [
                      `The sale does not cover the costs and the mortgage: ${money(-summary.netProceeds)} would have to be found from elsewhere.`,
                  ]
                : []),
            'The fees are the figures you entered. Tax on the sale, if any is due, and the cost of your next purchase are not included.',
        ],
    });
}

/** What the capital gains calculator shows, as a report; `null` when the input can't be calculated. */
export function capitalGainsReport(input: CapitalGainsReportInput): PdfReport | null {
    const { summary } = getCapitalGainsSummary(input);
    if (!summary) return null;
    const share = input.share ?? CAPITAL_GAINS_DEFAULTS.share;
    const costs =
        (input.buyingCosts ?? CAPITAL_GAINS_DEFAULTS.cost) +
        (input.sellingCosts ?? CAPITAL_GAINS_DEFAULTS.cost) +
        (input.improvements ?? CAPITAL_GAINS_DEFAULTS.cost);
    const taxYear = CAPITAL_GAINS_TAX_YEARS.find((option) => option.value === summary.taxYear);
    return rowsReport('Capital gains tax estimate', summary.rows, {
        facts: [
            { label: 'Tax year', value: taxYear?.label ?? summary.taxYear },
            { label: 'Sale price', value: money(input.salePrice) },
            { label: 'Purchase price', value: money(input.purchasePrice) },
            { label: 'Buying, selling and improvement costs', value: money(costs) },
            ...(share < 100 ? [{ label: 'Share owned', value: formatRate(share) }] : []),
            { label: 'Income', value: money(input.income ?? CAPITAL_GAINS_DEFAULTS.income) },
            {
                label: 'Lower and higher rate',
                value: `${summary.formatted.lowerRate} and ${summary.formatted.higherRate}`,
            },
            ...(summary.formatted.reportBy ? [{ label: 'Report and pay by', value: summary.formatted.reportBy }] : []),
        ],
        notes: [...summary.notes, CAPITAL_GAINS_NOTICE],
    });
}

/**
 * The cost of selling as a PDF, in your brand. Rejects when the input can't be calculated. The
 * notice is `SELLING_COSTS_NOTICE` unless you pass one of your own.
 */
export async function sellingCostsPdf(input: SellingCostsReportInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = sellingCostsReport(input);
    if (!report) throw new RangeError(getSellingCostsSummary(input).error ?? 'Those costs cannot be calculated.');
    return createPdf(report, { ...options, notice: options?.notice ?? SELLING_COSTS_NOTICE });
}

/**
 * A capital gains tax estimate as a PDF, in your brand. Rejects when the input can't be calculated.
 * The report carries its own small print (`CAPITAL_GAINS_NOTICE`), so the default notice about
 * buying a property is left out unless you pass a `notice` of your own.
 */
export async function capitalGainsPdf(input: CapitalGainsReportInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = capitalGainsReport(input);
    if (!report) throw new RangeError(getCapitalGainsSummary(input).error ?? 'That tax cannot be calculated.');
    return createPdf(report, { ...options, notice: options?.notice ?? false });
}
