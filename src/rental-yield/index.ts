import { type BuyerType, calculateStampDuty, MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds, formatRate } from '../stamp-duty/format';

/*
 * Rental yield for a buy-to-let: what the rent returns on what the property really costs.
 * Gross yield is the headline agents quote (a year's rent over the price). Net yield is the
 * honest one: rent after empty weeks and running costs, over the price plus stamp duty and
 * the other costs of buying. Stamp duty is worked out here, at additional-property rates by
 * default, because a landlord nearly always pays the surcharge.
 */

export const RENT_PERIODS = [
    { value: 'week', label: 'Per week', perYear: 52 },
    { value: 'month', label: 'Per month', perYear: 12 },
    { value: 'year', label: 'Per year', perYear: 1 },
] as const;

export type RentPeriod = (typeof RENT_PERIODS)[number]['value'];

export const RENTAL_YIELD_DEFAULTS = {
    rentPeriod: 'month',
    buyer: 'additional-property',
} as const satisfies { rentPeriod: RentPeriod; buyer: BuyerType };

export interface RentalYieldInput {
    /** Purchase price in pounds. */
    price: number;
    /** The rent, in pounds per `rentPeriod`. */
    rent: number;
    /** Defaults to `"month"`. */
    rentPeriod?: RentPeriod;
    /** Weeks a year the property is expected to stand empty. Defaults to 0. */
    voidWeeks?: number;
    /** Running costs per year in pounds: letting fees, insurance, repairs, service charge. Defaults to 0. */
    annualCosts?: number;
    /** Costs of buying other than stamp duty, in pounds: legal fees, survey, refurbishment. Defaults to 0. */
    purchaseCosts?: number;
    /** Buyer type for the stamp duty. Defaults to `"additional-property"`. */
    buyer?: BuyerType;
    nonUkResident?: boolean;
}

export interface RentalYield {
    /** A full year's rent with no empty weeks. */
    annualRent: number;
    /** Rent expected in a year after empty weeks. */
    rentReceived: number;
    annualCosts: number;
    /** Rent received less running costs. */
    netIncome: number;
    stampDuty: number;
    /** Price plus stamp duty plus the other purchase costs. */
    totalCost: number;
    /** A full year's rent as a percentage of the price. */
    grossYield: number;
    /** Net income as a percentage of the total cost. */
    netYield: number;
}

const amount = (value: number | undefined) => value ?? 0;
const invalid = (value: number) => !Number.isFinite(value) || value < 0;

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function rentalYieldInputError(input: RentalYieldInput): string | null {
    const { price, rent } = input;
    if (!Number.isFinite(price) || price <= 0) return 'Enter the property price.';
    if (price > MAX_PRICE) return 'Enter a lower price.';
    if (!Number.isFinite(rent) || rent <= 0) return 'Enter the rent.';
    const voidWeeks = amount(input.voidWeeks);
    if (invalid(voidWeeks) || voidWeeks > 52) return 'Empty weeks must be between 0 and 52.';
    if (invalid(amount(input.annualCosts))) return 'Enter the yearly running costs, or leave them at 0.';
    if (invalid(amount(input.purchaseCosts))) return 'Enter the other purchase costs, or leave them at 0.';
    return null;
}

/** The maths alone; `null` for invalid input. Pounds are rounded to the pound, yields to two decimals. */
export function calculateRentalYield(input: RentalYieldInput): RentalYield | null {
    if (rentalYieldInputError(input)) return null;
    const period = RENT_PERIODS.find(
        (option) => option.value === (input.rentPeriod ?? RENTAL_YIELD_DEFAULTS.rentPeriod),
    );
    if (!period) return null;

    const annualRent = Math.round(input.rent * period.perYear);
    const rentReceived = Math.round((annualRent * (52 - amount(input.voidWeeks))) / 52);
    const annualCosts = Math.round(amount(input.annualCosts));
    const stampDuty = calculateStampDuty({
        price: input.price,
        buyer: input.buyer ?? RENTAL_YIELD_DEFAULTS.buyer,
        nonUkResident: input.nonUkResident,
    }).stampDuty;
    const totalCost = Math.round(input.price + stampDuty + amount(input.purchaseCosts));
    const netIncome = rentReceived - annualCosts;
    const percent = (part: number, whole: number) => Math.round((part / whole) * 10_000) / 100;

    return {
        annualRent,
        rentReceived,
        annualCosts,
        netIncome,
        stampDuty,
        totalCost,
        grossYield: percent(annualRent, input.price),
        netYield: percent(netIncome, totalCost),
    };
}

export const RENTAL_YIELD_LABELS = {
    netYield: 'Net yield',
    grossYield: 'Gross yield',
    annualRent: 'Rent per year',
    rentReceived: 'Rent after empty weeks',
    annualCosts: 'Running costs per year',
    netIncome: 'Net income per year',
    stampDuty: 'Stamp duty',
    totalCost: 'Total cost of buying',
} as const;

type RentalYieldKey = keyof typeof RENTAL_YIELD_LABELS;

export interface RentalYieldSummary extends RentalYield {
    formatted: Record<RentalYieldKey, string>;
    /** The same figures as labelled rows, in display order: net yield leads. */
    rows: { key: RentalYieldKey; label: string; value: number; formatted: string }[];
}

/**
 * A rental yield with every figure and its display string. Either the summary or the reason the
 * input can't be calculated, never both.
 */
export function getRentalYieldSummary(
    input: RentalYieldInput,
): { summary: RentalYieldSummary; error: null } | { summary: null; error: string } {
    const error = rentalYieldInputError(input);
    const result = error ? null : calculateRentalYield(input);
    if (error || !result) return { summary: null, error: error ?? 'Enter the property price.' };

    const keys = Object.keys(RENTAL_YIELD_LABELS) as RentalYieldKey[];
    const isYield = (key: RentalYieldKey) => key === 'netYield' || key === 'grossYield';
    // A loss is written "-£1,200", with the sign ahead of the pound.
    const pounds = (value: number) => (value < 0 ? `-${formatPounds(-value)}` : formatPounds(value));
    const formatted = Object.fromEntries(
        keys.map((key) => [key, isYield(key) ? formatRate(result[key]) : pounds(result[key])]),
    ) as Record<RentalYieldKey, string>;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: RENTAL_YIELD_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}

export interface PortfolioYield {
    /** How many of the inputs could be calculated. */
    properties: number;
    price: number;
    annualRent: number;
    netIncome: number;
    totalCost: number;
    grossYield: number;
    netYield: number;
    formatted: Record<'price' | 'annualRent' | 'netIncome' | 'totalCost' | 'grossYield' | 'netYield', string>;
}

/** The yield across several properties: rents and costs are added up first, so big properties count for more. */
export function getPortfolioYield(inputs: readonly RentalYieldInput[]): PortfolioYield | null {
    const sum = { properties: 0, price: 0, annualRent: 0, netIncome: 0, totalCost: 0 };
    for (const input of inputs) {
        const result = calculateRentalYield(input);
        if (!result) continue;
        sum.properties += 1;
        sum.price += input.price;
        sum.annualRent += result.annualRent;
        sum.netIncome += result.netIncome;
        sum.totalCost += result.totalCost;
    }
    if (!sum.properties) return null;
    const percent = (part: number, whole: number) => Math.round((part / whole) * 10_000) / 100;
    const grossYield = percent(sum.annualRent, sum.price);
    const netYield = percent(sum.netIncome, sum.totalCost);
    const pounds = (value: number) => (value < 0 ? `-${formatPounds(-value)}` : formatPounds(value));
    return {
        ...sum,
        grossYield,
        netYield,
        formatted: {
            price: formatPounds(sum.price),
            annualRent: formatPounds(sum.annualRent),
            netIncome: pounds(sum.netIncome),
            totalCost: formatPounds(sum.totalCost),
            grossYield: formatRate(grossYield),
            netYield: formatRate(netYield),
        },
    };
}
