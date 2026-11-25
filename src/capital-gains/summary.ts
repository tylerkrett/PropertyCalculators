import { formatPounds, formatPoundsAndPence, formatRate } from '../stamp-duty/format';
import { type CapitalGains, type CapitalGainsInput, capitalGainsInputError, workOutTax } from './calculate';
import { formatIsoDate } from './rates';

/* The capital gains result with its display strings and labelled rows. */

export const CAPITAL_GAINS_LABELS = {
    tax: 'Capital gains tax to pay',
    gain: 'Gain',
    allowance: 'Tax-free allowance used',
    taxableGain: 'Taxable gain',
    lowerRateAmount: 'Gain taxed at the lower rate',
    lowerRateTax: 'Tax at the lower rate',
    higherRateAmount: 'Gain taxed at the higher rate',
    higherRateTax: 'Tax at the higher rate',
    effectiveRate: 'Tax as a share of the gain',
    gainAfterTax: 'Gain after tax',
} as const;

type CapitalGainsKey = keyof typeof CAPITAL_GAINS_LABELS;

export interface CapitalGainsSummary extends CapitalGains {
    /** Every row's figure as text, the two rates (`"18%"`), and `reportBy` as `"24 January 2027"` when there is one. */
    formatted: Record<CapitalGainsKey | 'lowerRate' | 'higherRate', string> & { reportBy?: string };
    /** The figures as labelled rows, in display order: the tax leads. A loss is a negative gain. */
    rows: { key: CapitalGainsKey; label: string; value: number; formatted: string }[];
}

/** Whole pounds, with the pence only when there are some, and the sign before the £: `£1,500`, `-£1,499.50`. */
function pounds(value: number): string {
    const amount = Math.abs(value);
    const text = Number.isInteger(amount) ? formatPounds(amount) : formatPoundsAndPence(amount);
    return value < 0 ? `-${text}` : text;
}

/**
 * The capital gains tax with every figure and its display string. Either the summary or the
 * reason the input can't be calculated, never both.
 */
export function getCapitalGainsSummary(
    input: CapitalGainsInput,
): { summary: CapitalGainsSummary; error: null } | { summary: null; error: string } {
    const error = capitalGainsInputError(input);
    if (error) return { summary: null, error };
    const result = workOutTax(input);

    const keys = Object.keys(CAPITAL_GAINS_LABELS) as CapitalGainsKey[];
    const text = (key: CapitalGainsKey) =>
        key === 'effectiveRate' ? formatRate(result.effectiveRate) : pounds(result[key]);
    const formatted = {
        ...(Object.fromEntries(keys.map((key) => [key, text(key)])) as Record<CapitalGainsKey, string>),
        lowerRate: formatRate(result.lowerRate),
        higherRate: formatRate(result.higherRate),
        ...(result.reportBy ? { reportBy: formatIsoDate(result.reportBy) } : {}),
    };

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: CAPITAL_GAINS_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
