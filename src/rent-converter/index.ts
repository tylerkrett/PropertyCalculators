import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { MAX_PRICE } from '../stamp-duty/estimate';
import { formatPoundsAndPence } from '../stamp-duty/format';

/*
 * Rent converter: the same rent per week, per month, per year and per day, and each tenant's
 * share. Agents quote weekly rents (pw) in prime London and monthly rents (pcm) elsewhere.
 *
 * The convention is the one every calculator in this package uses (`RENT_PERIODS`): a year is 52
 * weeks or 12 months, so a year's rent is the weekly rent times 52 or the monthly rent times 12,
 * a week is the year over 52 and a month the year over 12. It is also how the Tenant Fees Act
 * 2019 defines a week's rent (Schedule 1, paragraph 2(4): the annual rent divided by 52). A day is
 * the year over 365. Every figure is worked out from the unrounded annual rent and rounded to the
 * nearest penny, so converting never compounds a rounding.
 */

export const RENT_CONVERTER_DEFAULTS = {
    period: 'month',
    tenants: 1,
} as const satisfies { period: RentPeriod; tenants: number };

/** Bounds the form accepts. */
export const RENT_CONVERTER_LIMITS = {
    rent: { max: MAX_PRICE },
    tenants: { min: 1, max: 20 },
} as const;

/** Days the daily rent divides the year by. */
export const RENT_CONVERTER_DAYS_PER_YEAR = 365;

export interface RentConverterInput {
    /** The rent for the whole property, in pounds per `period`. */
    rent: number;
    /** The period the rent is quoted for. Defaults to `"month"`. */
    period?: RentPeriod;
    /** How many tenants split the rent equally: a whole number from 1 to 20. Defaults to 1. */
    tenants?: number;
}

export interface RentConversion {
    /** A year's rent over 52. */
    weekly: number;
    /** A year's rent over 12. */
    monthly: number;
    annual: number;
    /** A year's rent over 365. */
    daily: number;
    /** How many tenants `perPerson` is split between. */
    tenants: number;
    /** Each tenant's equal share. With one tenant it is the whole rent. */
    perPerson: { weekly: number; monthly: number; annual: number };
}

// A plain object, an array or a function all read as records; anything else has no fields to read.
const fieldsOf = (input: unknown): Partial<Record<keyof RentConverterInput, unknown>> =>
    typeof input === 'object' && input !== null ? input : {};
const periodOf = (input: RentConverterInput) =>
    RENT_PERIODS.find((option) => option.value === (fieldsOf(input).period ?? RENT_CONVERTER_DEFAULTS.period));
/** The tiny nudge only undoes floating-point error, so £1.005 rounds up to £1.01 as written. */
const toPenny = (pounds: number) => Math.round(pounds * 100 + 1e-6) / 100;

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function rentConverterInputError(input: RentConverterInput): string | null {
    const { rent } = fieldsOf(input);
    const tenants = fieldsOf(input).tenants ?? RENT_CONVERTER_DEFAULTS.tenants;
    if (typeof rent !== 'number' || !Number.isFinite(rent) || rent <= 0) return 'Enter the rent.';
    if (rent > RENT_CONVERTER_LIMITS.rent.max) return 'Enter a lower rent.';
    if (!periodOf(input)) return 'Choose whether the rent is per week, month or year.';
    const { min, max } = RENT_CONVERTER_LIMITS.tenants;
    if (typeof tenants !== 'number' || !Number.isInteger(tenants) || tenants < min || tenants > max) {
        return `Enter the number of tenants, from ${min} to ${max}.`;
    }
    return null;
}

/** The maths alone; `null` for invalid input. Every figure is rounded to the nearest penny. */
export function convertRent(input: RentConverterInput): RentConversion | null {
    const period = periodOf(input);
    if (!period || rentConverterInputError(input)) return null;

    const tenants = input.tenants ?? RENT_CONVERTER_DEFAULTS.tenants;
    // Everything comes from the unrounded annual rent; only the figures returned are rounded.
    const annual = input.rent * period.perYear;
    return {
        weekly: toPenny(annual / 52),
        monthly: toPenny(annual / 12),
        annual: toPenny(annual),
        daily: toPenny(annual / RENT_CONVERTER_DAYS_PER_YEAR),
        tenants,
        perPerson: {
            weekly: toPenny(annual / 52 / tenants),
            monthly: toPenny(annual / 12 / tenants),
            annual: toPenny(annual / tenants),
        },
    };
}

export const RENT_CONVERTER_LABELS = {
    weekly: 'Rent per week',
    monthly: 'Rent per month',
    annual: 'Rent per year',
    daily: 'Rent per day',
    perPersonWeekly: 'Per person per week',
    perPersonMonthly: 'Per person per month',
    perPersonAnnual: 'Per person per year',
} as const;

export type RentConverterKey = keyof typeof RENT_CONVERTER_LABELS;

export interface RentConversionSummary extends RentConversion {
    /** The period the rent was entered in. */
    period: RentPeriod;
    /** Every figure as pounds and pence: `"£2,816.67"`. */
    formatted: Record<RentConverterKey, string>;
    /**
     * The figures as labelled rows. The headline is the conversion asked for: the monthly rent for
     * a weekly one, the weekly rent otherwise. The per-person rows are left out for one tenant.
     */
    rows: { key: RentConverterKey; label: string; value: number; formatted: string }[];
}

/**
 * A rent in every period, with each figure's display string. Either the summary or the reason the
 * input can't be calculated, never both.
 */
export function getRentConversionSummary(
    input: RentConverterInput,
): { summary: RentConversionSummary; error: null } | { summary: null; error: string } {
    const error = rentConverterInputError(input);
    const period = periodOf(input);
    const result = error ? null : convertRent(input);
    if (error || !period || !result) return { summary: null, error: error ?? 'Enter the rent.' };

    const values: Record<RentConverterKey, number> = {
        weekly: result.weekly,
        monthly: result.monthly,
        annual: result.annual,
        daily: result.daily,
        perPersonWeekly: result.perPerson.weekly,
        perPersonMonthly: result.perPerson.monthly,
        perPersonAnnual: result.perPerson.annual,
    };
    const keys = Object.keys(RENT_CONVERTER_LABELS) as RentConverterKey[];
    const formatted = Object.fromEntries(keys.map((key) => [key, formatPoundsAndPence(values[key])])) as Record<
        RentConverterKey,
        string
    >;

    const lead: RentConverterKey = period.value === 'week' ? 'monthly' : 'weekly';
    const shown = keys.filter((key) => result.tenants > 1 || !key.startsWith('perPerson'));
    const ordered = [lead, ...shown.filter((key) => key !== lead)];

    return {
        summary: {
            ...result,
            period: period.value,
            formatted,
            rows: ordered.map((key) => ({
                key,
                label: RENT_CONVERTER_LABELS[key],
                value: values[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
