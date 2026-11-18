import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { formatNumber, formatPounds, formatPoundsAndPence, formatRate } from '../stamp-duty/format';

/*
 * Price per area: what a property costs for each square foot and each square metre of floor.
 * For a sale it is the price over the area. For a letting it is a year's rent over the area,
 * the "£ per sq ft per year" figure that commercial and prime lettings are quoted in. Both
 * units are always returned, whichever one the area was measured in. One square metre is taken
 * as 10.7639 square feet, the same figure the desk calculator uses (src/calculator/conversions.ts).
 * No legal rule is involved: this is arithmetic.
 */

/** Square feet in one square metre. */
export const SQFT_PER_SQM = 10.7639;

export const AREA_UNITS = [
    { value: 'sqft', label: 'Square feet', short: 'sq ft' },
    { value: 'sqm', label: 'Square metres', short: 'sq m' },
] as const;

export type AreaUnit = (typeof AREA_UNITS)[number]['value'];

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

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isAreaUnit = (unit: unknown): unit is AreaUnit => AREA_UNITS.some((option) => option.value === unit);
const toTwoDecimals = (value: number) => Math.round(value * 100) / 100;
const shortUnit = (unit: AreaUnit) => (unit === 'sqft' ? 'sq ft' : 'sq m');

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function pricePerAreaInputError(input: PricePerAreaInput): string | null {
    const isRent = input.rentPeriod !== undefined;
    if (isRent && !RENT_PERIODS.some((option) => option.value === input.rentPeriod)) {
        return 'Choose whether the rent is per week, month or year.';
    }
    if (!positive(input.amount)) return isRent ? 'Enter the rent.' : 'Enter the property price.';
    if (!positive(input.area)) return 'Enter the floor area.';
    if (!isAreaUnit(input.areaUnit)) return 'Choose square feet or square metres.';
    return null;
}

/** Unrounded figures, shared by the calculator and the comparison so percentages don't compound rounding. */
function exact(input: PricePerAreaInput) {
    if (pricePerAreaInputError(input)) return null;
    const period = RENT_PERIODS.find((option) => option.value === input.rentPeriod);
    const amount = period ? input.amount * period.perYear : input.amount;
    const areaSqFt = input.areaUnit === 'sqft' ? input.area : input.area * SQFT_PER_SQM;
    const areaSqM = input.areaUnit === 'sqm' ? input.area : input.area / SQFT_PER_SQM;
    return { basis: period ? ('rent' as const) : ('sale' as const), amount, areaSqFt, areaSqM };
}

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
 * pounds), `"£45.50 per sq ft per year"` for a rent (pounds and pence). Either the summary or the
 * reason the input can't be calculated, never both.
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
        `${isRent ? formatPoundsAndPence(value) : formatPounds(value)} per ${shortUnit(unit)}${isRent ? ' per year' : ''}`;
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

export interface PricePerAreaComparison {
    /** The unit both figures are per: the one the comparable average was given in. */
    unit: AreaUnit;
    /** The property's pounds per `unit`. */
    subject: number;
    /** The comparable average's pounds per `unit`, as given. */
    comparable: number;
    /** Subject less comparable, in pounds per `unit`: negative when the property is cheaper. */
    difference: number;
    /** The difference as a percentage of the comparable, to two decimals. */
    differencePercent: number;
    position: 'above' | 'below' | 'same';
    formatted: Record<'subject' | 'comparable' | 'difference' | 'differencePercent', string> & {
        /** `"8.7% above the comparable average"`. */
        sentence: string;
    };
}

/**
 * How a property's price per area sits against a comparable average, such as the street's or the
 * postcode's. The average is pounds per `unit` (per year, for a rent). `null` for invalid input.
 */
export function comparePricePerArea(
    input: PricePerAreaInput,
    comparable: { perArea: number; unit: AreaUnit },
): PricePerAreaComparison | null {
    const figures = exact(input);
    if (!figures || !positive(comparable.perArea) || !isAreaUnit(comparable.unit)) return null;

    const { unit } = comparable;
    const exactSubject = figures.amount / (unit === 'sqft' ? figures.areaSqFt : figures.areaSqM);
    const subject = toTwoDecimals(exactSubject);
    const difference = toTwoDecimals(subject - comparable.perArea);
    const differencePercent = toTwoDecimals(((exactSubject - comparable.perArea) / comparable.perArea) * 100);
    const position = difference > 0 ? 'above' : difference < 0 ? 'below' : 'same';

    const isRent = figures.basis === 'rent';
    const money = (value: number) => (isRent ? formatPoundsAndPence(value) : formatPounds(value));
    const suffix = ` per ${shortUnit(unit)}${isRent ? ' per year' : ''}`;
    const signed = (value: number, text: string) => (value > 0 ? `+${text}` : value < 0 ? `-${text}` : text);

    return {
        unit,
        subject,
        comparable: comparable.perArea,
        difference,
        differencePercent,
        position,
        formatted: {
            subject: `${money(subject)}${suffix}`,
            comparable: `${money(comparable.perArea)}${suffix}`,
            difference: `${signed(difference, money(Math.abs(difference)))}${suffix}`,
            differencePercent: signed(differencePercent, formatRate(Math.abs(differencePercent))),
            sentence:
                position === 'same'
                    ? 'In line with the comparable average'
                    : `${formatRate(Math.abs(differencePercent))} ${position} the comparable average`,
        },
    };
}
