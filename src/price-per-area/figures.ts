import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds, formatPoundsAndPence } from '../stamp-duty/format';

/*
 * Price per area: what a property costs for each square foot and each square metre of floor.
 * For a sale it is the price over the area. For a letting it is a year's rent over the area,
 * the "£ per sq ft per year" figure that commercial and prime lettings are quoted in. Both
 * units are always returned, whichever one the area was measured in. One square metre is taken
 * as 10.7639 square feet, the same figure the desk calculator uses (src/calculator/conversions.ts).
 * No legal rule is involved: this is arithmetic.
 *
 * Figures are in whole pounds for a sale and in pounds and pence for a rent, except that a figure
 * under £100 always shows its pence: "£0 per sq ft" for a £2,000 plot would say nothing.
 */

/** Square feet in one square metre. */
export const SQFT_PER_SQM = 10.7639;

export const AREA_UNITS = [
    { value: 'sqft', label: 'Square feet', short: 'sq ft' },
    { value: 'sqm', label: 'Square metres', short: 'sq m' },
] as const;

export type AreaUnit = (typeof AREA_UNITS)[number]['value'];

/**
 * What can be worked out: an amount up to the library's `MAX_PRICE`, and a floor area from 1 to
 * 100 million in either unit. Anything outside is a typing mistake, and far enough outside it
 * overflows into `Infinity`.
 */
export const PRICE_PER_AREA_LIMITS = {
    amount: { max: MAX_PRICE },
    area: { min: 1, max: 100_000_000 },
} as const;

export interface PricePerAreaInput {
    /** The sale price in pounds, or the rent in pounds per `rentPeriod` when that is given. */
    amount: number;
    /** Floor area, in `areaUnit`. */
    area: number;
    areaUnit: AreaUnit;
    /** Give this for a lettings listing: the amount is then a rent and the result is per year. Leave it out for a sale. */
    rentPeriod?: RentPeriod;
}

export interface PricePerArea {
    /** `"sale"` for a price, `"rent"` for a rent taken to a full year. */
    basis: 'sale' | 'rent';
    /** The price, or a full year's rent: the amount the per-area figures divide up. */
    amount: number;
    areaSqFt: number;
    areaSqM: number;
    /** Pounds per square foot (per year, for a rent). */
    perSqFt: number;
    /** Pounds per square metre (per year, for a rent). */
    perSqM: number;
}

export const positive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
export const isAreaUnit = (unit: unknown): unit is AreaUnit => AREA_UNITS.some((option) => option.value === unit);
export const shortUnit = (unit: AreaUnit) => AREA_UNITS.find((option) => option.value === unit)?.short ?? unit;

/**
 * Rounds half away from zero to two decimals. Shifting the decimal point in the number's text,
 * as `formatNumber` does, keeps 1.005 from becoming 1 (as a float, 1.005 * 100 is 100.49999999999999).
 */
export function toTwoDecimals(value: number): number {
    const shifted = Number(`${Math.abs(value)}e+2`);
    // A number already printed with an exponent (below 1e-6, above 1e21) can't be shifted this way.
    const rounded = Math.round(Number.isNaN(shifted) ? Math.abs(value) * 100 : shifted) / 100;
    return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** Whole pounds, or pounds and pence for a rent and for any figure under £100. */
export const money = (value: number, pence: boolean) =>
    pence || Math.abs(value) < 100 ? formatPoundsAndPence(value) : formatPounds(value);

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function pricePerAreaInputError(input: PricePerAreaInput): string | null {
    const { amount, area, areaUnit, rentPeriod } = input ?? ({} as Partial<PricePerAreaInput>);
    const isRent = rentPeriod !== undefined;
    if (isRent && !RENT_PERIODS.some((option) => option.value === rentPeriod)) {
        return 'Choose whether the rent is per week, month or year.';
    }
    if (!positive(amount)) return isRent ? 'Enter the rent.' : 'Enter the property price.';
    if (amount > PRICE_PER_AREA_LIMITS.amount.max) return isRent ? 'Enter a lower rent.' : 'Enter a lower price.';
    if (!positive(area)) return 'Enter the floor area.';
    if (area < PRICE_PER_AREA_LIMITS.area.min) return 'Enter a floor area of at least 1.';
    if (area > PRICE_PER_AREA_LIMITS.area.max) return 'Enter a smaller floor area.';
    if (!isAreaUnit(areaUnit)) return 'Choose square feet or square metres.';
    return null;
}

/** Unrounded figures, shared by the calculator and the comparison so percentages don't compound rounding. */
export function exact(input: PricePerAreaInput) {
    if (pricePerAreaInputError(input)) return null;
    const period = RENT_PERIODS.find((option) => option.value === input.rentPeriod);
    const amount = period ? input.amount * period.perYear : input.amount;
    const areaSqFt = input.areaUnit === 'sqft' ? input.area : input.area * SQFT_PER_SQM;
    const areaSqM = input.areaUnit === 'sqm' ? input.area : input.area / SQFT_PER_SQM;
    return { basis: period ? ('rent' as const) : ('sale' as const), amount, areaSqFt, areaSqM };
}
