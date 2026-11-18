import { formatPounds, formatPoundsAndPence } from '../stamp-duty/format';
import { formatDuration } from './loan';
import { compareDeals, type RemortgageComparison, type RemortgageInput, remortgageInputError } from './remortgage';

/*
 * The remortgage comparison as display strings and labelled rows. The saving over the fixed
 * period is shown in parts that add up: the cash kept in payments, the lower balance owed, and
 * the two together.
 */

export const REMORTGAGE_LABELS = {
    monthlySaving: 'Monthly saving',
    currentMonthlyPayment: 'Current monthly payment',
    newMonthlyPayment: 'New monthly payment',
    switchingCost: 'Cost of switching',
    breakEvenMonths: 'Time until interest saved covers the cost',
    interestSaved: 'Interest saved over the fixed period',
    paymentSaving: 'Payments saved over the fixed period, less costs paid in cash',
    balanceDifference: 'Less owed when the fixed period ends',
    netSaving: 'Net saving including the lower balance owed',
    newLoan: 'New loan amount',
} as const;

type RemortgageKey = keyof typeof REMORTGAGE_LABELS;

export interface RemortgageSummary extends RemortgageComparison {
    /**
     * Payments and savings to the penny, so the savings add up as displayed; the switching cost and
     * the new loan to the pound. A break-even after the comparison period says so:
     * `"2 years 7 months (after the 2-year period)"`; `"Never"` when the cost is never covered.
     */
    formatted: Record<RemortgageKey, string>;
    /** The same figures as labelled rows, in display order. `value` is `null` when it never breaks even. */
    rows: { key: RemortgageKey; label: string; value: number | null; formatted: string }[];
}

// Shown to the pound; every other amount is shown to the penny.
const POUND_KEYS: readonly RemortgageKey[] = ['switchingCost', 'newLoan'];

/** The break-even as words, flagged when it comes after the period the savings are worked out over. */
function breakEvenText({ breakEvenMonths, breakEvenWithinPeriod, comparisonMonths }: RemortgageComparison): string {
    if (breakEvenMonths === null) return 'Never';
    const duration = formatDuration(breakEvenMonths);
    // Only a fixed period, a whole number of years, can end before the break-even: the search for
    // it stops with the remaining term.
    return breakEvenWithinPeriod ? duration : `${duration} (after the ${comparisonMonths / 12}-year period)`;
}

/**
 * A remortgage comparison with every figure and its display string. Either the summary or the
 * reason the input can't be calculated, never both.
 */
export function getRemortgageSummary(
    input: RemortgageInput,
): { summary: RemortgageSummary; error: null } | { summary: null; error: string } {
    const error = remortgageInputError(input);
    if (error) return { summary: null, error };
    const result = compareDeals(input);

    // A loss is written "-£1,200", with the sign ahead of the pound.
    const signed = (value: number, format: (n: number) => string) => (value < 0 ? `-${format(-value)}` : format(value));
    const keys = Object.keys(REMORTGAGE_LABELS) as RemortgageKey[];
    const display = (key: RemortgageKey) =>
        key === 'breakEvenMonths'
            ? breakEvenText(result)
            : signed(result[key], POUND_KEYS.includes(key) ? formatPounds : formatPoundsAndPence);
    const formatted = Object.fromEntries(keys.map((key) => [key, display(key)])) as Record<RemortgageKey, string>;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: REMORTGAGE_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
