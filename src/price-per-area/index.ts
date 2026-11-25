import type { RentPeriod } from '../rental-yield/index';
import { formatNumber, formatPounds } from '../stamp-duty/format';
import {
    type AreaUnit,
    exact,
    money,
    positive,
    type PricePerArea,
    type PricePerAreaInput,
    pricePerAreaInputError,
    shortUnit,
    toTwoDecimals,
} from './figures';

/*
 * Price per area: the calculator, its labelled summary and the one-number helper for listing
 * cards. The inputs, limits and shared arithmetic are in ./figures, the comparison against a
 * comparable average in ./compare; everything public is exported from here.
 */

export {
    AREA_UNITS,
    type AreaUnit,
    PRICE_PER_AREA_LIMITS,
    type PricePerArea,
    type PricePerAreaInput,
    pricePerAreaInputError,
    SQFT_PER_SQM,
} from './figures';
export { comparePricePerArea, type PricePerAreaComparison } from './compare';

/**
 * The maths alone; `null` for invalid input. Per-area figures and converted areas are rounded to
 * two decimals, the amount to the pound.
 */
export function calculatePricePerArea(input: PricePerAreaInput): PricePerArea | null {
    const figures = exact(input);
    if (!figures) return null;
    return {
        basis: figures.basis,
        amount: Math.round(figures.amount),
        areaSqFt: toTwoDecimals(figures.areaSqFt),
        areaSqM: toTwoDecimals(figures.areaSqM),
        perSqFt: toTwoDecimals(figures.amount / figures.areaSqFt),
        perSqM: toTwoDecimals(figures.amount / figures.areaSqM),
    };
}

/** Row labels, which differ for a sale and a letting. */
export const PRICE_PER_AREA_LABELS = {
    sale: {
        perSqFt: 'Price per sq ft',
        perSqM: 'Price per sq m',
        amount: 'Price',
        areaSqFt: 'Area in sq ft',
        areaSqM: 'Area in sq m',
    },
    rent: {
        perSqFt: 'Rent per sq ft per year',
        perSqM: 'Rent per sq m per year',
        amount: 'Rent per year',
        areaSqFt: 'Area in sq ft',
        areaSqM: 'Area in sq m',
    },
} as const;

type PricePerAreaKey = keyof (typeof PRICE_PER_AREA_LABELS)['sale'];

export interface PricePerAreaSummary extends PricePerArea {
    formatted: Record<PricePerAreaKey, string>;
    /** The same figures as labelled rows, in display order: price per square foot leads. */
    rows: { key: PricePerAreaKey; label: string; value: number; formatted: string }[];
}

/**
 * Price per area with every figure and its display string: `"£1,250 per sq ft"` for a sale (whole
 * pounds, or `"£0.40 per sq ft"` when under £100), `"£45.50 per sq ft per year"` for a rent
 * (pounds and pence). Either the summary or the reason the input can't be calculated, never both.
 */
export function getPricePerAreaSummary(
    input: PricePerAreaInput,
): { summary: PricePerAreaSummary; error: null } | { summary: null; error: string } {
    const error = pricePerAreaInputError(input);
    const result = error ? null : calculatePricePerArea(input);
    if (error || !result) return { summary: null, error: error ?? 'Enter the property price.' };

    const isRent = result.basis === 'rent';
    const labels = PRICE_PER_AREA_LABELS[result.basis];
    const perArea = (value: number, unit: AreaUnit) =>
        `${money(value, isRent)} per ${shortUnit(unit)}${isRent ? ' per year' : ''}`;
    const area = (value: number, unit: AreaUnit) =>
        `${formatNumber(value, 2).replace(/\.?0+$/, '')} ${shortUnit(unit)}`;
    const formatted: Record<PricePerAreaKey, string> = {
        perSqFt: perArea(result.perSqFt, 'sqft'),
        perSqM: perArea(result.perSqM, 'sqm'),
        amount: formatPounds(result.amount),
        areaSqFt: area(result.areaSqFt, 'sqft'),
        areaSqM: area(result.areaSqM, 'sqm'),
    };
    const keys = Object.keys(labels) as PricePerAreaKey[];

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({ key, label: labels[key], value: result[key], formatted: formatted[key] })),
        },
        error: null,
    };
}

/**
 * Just the pounds per square foot (or per square metre, with `per: "sqm"`), or `null` when the
 * price or area is missing or invalid: for listing cards. Give `rentPeriod` for a rent.
 */
export function pricePerAreaFor(
    amount: number | null | undefined,
    area: number | null | undefined,
    areaUnit: AreaUnit = 'sqft',
    options: { per?: AreaUnit; rentPeriod?: RentPeriod } = {},
): number | null {
    if (!positive(amount) || !positive(area)) return null;
    const result = calculatePricePerArea({ amount, area, areaUnit, rentPeriod: options.rentPeriod });
    if (!result) return null;
    return (options.per ?? 'sqft') === 'sqm' ? result.perSqM : result.perSqFt;
}
