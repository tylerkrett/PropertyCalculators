import { AFFORDABILITY_DEFAULTS, type AffordabilityInput, getAffordabilitySummary } from '../../affordability/index';
import { BORROWER_TYPES, BUY_TO_LET_DEFAULTS, type BuyToLetInput, getBuyToLetSummary } from '../../buy-to-let/index';
import { RENT_PERIODS } from '../../rental-yield/index';
import { BUYER_TYPES } from '../../stamp-duty/estimate';
import { formatPounds, formatRate } from '../../stamp-duty/format';
import { createPdf, type PdfOptions, rowsReport } from '../create';
import type { PdfReport } from '../layout';

/*
 * The borrowing calculators as reports: how much a buyer could borrow, and whether a rent
 * supports a buy-to-let loan. Each prints its headline, the inputs, then the rest of its rows.
 */

type Fact = PdfReport['facts'][number];

const labelOf = (options: readonly { value: string; label: string }[], value: string) =>
    options.find((option) => option.value === value)?.label ?? value;
/** A fact for an optional amount, left out when it is missing or zero. */
const optional = (label: string, value: number | undefined): Fact[] =>
    value ? [{ label, value: formatPounds(value) }] : [];

/** What the affordability calculator shows, as a report; `null` when the input can't be calculated. */
export function affordabilityReport(input: AffordabilityInput): PdfReport | null {
    const { summary } = getAffordabilitySummary(input);
    if (!summary) return null;
    return rowsReport('Borrowing estimate', summary.rows, {
        facts: [
            { label: 'Yearly income', value: formatPounds(input.income) },
            ...optional("Second applicant's income", input.secondIncome),
            ...optional('Monthly commitments', input.monthlyCommitments),
            {
                label: 'Income multiple',
                value: `${input.incomeMultiple ?? AFFORDABILITY_DEFAULTS.incomeMultiple} times`,
            },
            { label: 'Interest rate', value: formatRate(input.rate) },
            { label: 'Term', value: `${input.termYears} years` },
            { label: 'Buyer', value: labelOf(BUYER_TYPES, input.buyer ?? AFFORDABILITY_DEFAULTS.buyer) },
        ],
        notes: [
            'This is an illustration from a multiple of income, not a mortgage offer: lenders set their own criteria, and look at spending, credit history and age.',
        ],
    });
}

/** What the buy-to-let calculator shows, as a report; `null` when the input can't be calculated. */
export function buyToLetReport(input: BuyToLetInput): PdfReport | null {
    const { summary } = getBuyToLetSummary(input);
    if (!summary) return null;
    const period = labelOf(RENT_PERIODS, input.rentPeriod ?? BUY_TO_LET_DEFAULTS.rentPeriod).toLowerCase();
    const borrower = labelOf(BORROWER_TYPES, input.borrower ?? BUY_TO_LET_DEFAULTS.borrower);
    return rowsReport('Buy-to-let mortgage check', summary.rows, {
        facts: [
            { label: 'Result', value: summary.verdict },
            { label: 'Rent', value: `${formatPounds(input.rent)} ${period}` },
            ...optional('Property price', input.price),
            // With a loan given the deposit plays no part; a cover ratio given overrides the borrower's.
            ...(input.loan === undefined ? optional('Deposit', input.deposit) : []),
            ...(input.coverRatio === undefined ? [{ label: 'Borrower', value: borrower }] : []),
        ],
        notes: [
            'This is an illustration, not a mortgage offer: the cover required and the stress rate are lender conventions, and each lender sets its own criteria.',
        ],
    });
}

/** An affordability calculation as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function affordabilityPdf(input: AffordabilityInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = affordabilityReport(input);
    if (!report) throw new RangeError(getAffordabilitySummary(input).error ?? 'That cannot be calculated.');
    return createPdf(report, options);
}

/** A buy-to-let check as a PDF, in your brand. Rejects when the input can't be calculated. */
export async function buyToLetPdf(input: BuyToLetInput, options?: PdfOptions): Promise<Uint8Array> {
    const report = buyToLetReport(input);
    if (!report) throw new RangeError(getBuyToLetSummary(input).error ?? 'That check cannot be calculated.');
    return createPdf(report, options);
}
