import { formatPounds, formatPoundsAndPence, formatRate } from '../stamp-duty/format';
import {
    addUpCosts,
    type SellingCostItem,
    type SellingCosts,
    SELLING_COSTS_LABELS,
    type SellingCostsInput,
    sellingCostsInputError,
} from './costs';

/* The cost of selling with its display strings and labelled rows. */

type SellingCostsKey = keyof typeof SELLING_COSTS_LABELS;

export interface SellingCostsSummary extends Omit<SellingCosts, 'items'> {
    formatted: Record<SellingCostsKey, string>;
    /** The headline figures as labelled rows, in display order: the money left leads. */
    rows: { key: SellingCostsKey; label: string; value: number; formatted: string }[];
    /** Where the price goes line by line, each with its amount (`formatted`) and share (`formattedShare`). */
    items: (SellingCostItem & { formatted: string; formattedShare: string })[];
}

/** Whole pounds, with the pence only when there are some, and the sign before the £: `£1,500`, `-£1,499.50`. */
function pounds(value: number): string {
    const amount = Math.abs(value);
    const text = Number.isInteger(amount) ? formatPounds(amount) : formatPoundsAndPence(amount);
    return value < 0 ? `-${text}` : text;
}

/**
 * The cost of selling with every figure and its display string. Either the summary or the reason
 * the input can't be calculated, never both.
 */
export function getSellingCostsSummary(
    input: SellingCostsInput,
): { summary: SellingCostsSummary; error: null } | { summary: null; error: string } {
    const error = sellingCostsInputError(input);
    if (error) return { summary: null, error };
    const result = addUpCosts(input);

    const keys = Object.keys(SELLING_COSTS_LABELS) as SellingCostsKey[];
    const formatted = Object.fromEntries(keys.map((key) => [key, pounds(result[key])])) as Record<
        SellingCostsKey,
        string
    >;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: SELLING_COSTS_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
            items: result.items.map((item) => ({
                ...item,
                formatted: pounds(item.value),
                formattedShare: formatRate(item.share),
            })),
        },
        error: null,
    };
}
