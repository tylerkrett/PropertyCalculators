/*
 * What the three UK property purchase taxes have in common: Stamp Duty Land Tax (England and
 * Northern Ireland), Land and Buildings Transaction Tax (Scotland) and Land Transaction Tax
 * (Wales). Each slices the price into rate bands; Scotland also adds a flat supplement on
 * additional homes. This file holds the shared input, the shared result shape and the code that
 * builds one. Sources: https://www.gov.uk/stamp-duty-land-tax, https://revenue.scot/taxes/land-buildings-transaction-tax
 * and https://www.gov.wales/land-transaction-tax-guide.
 */
import type { Band } from '../stamp-duty/calculate';
import { NON_RESIDENTIAL_DWELLINGS_THRESHOLD } from '../stamp-duty/bands/non-residential';
import { type StampDutyBand, toEstimateBands } from '../stamp-duty/estimate';
import { formatPounds, formatRate } from '../stamp-duty/format';
import {
    assertInput,
    type BuyerType,
    checkAmount,
    HIGHER_RATES_THRESHOLD,
    type PropertyType,
    resolvePurchaseOptions,
} from '../stamp-duty/purchase';

/** The four UK countries, each with the short name of the tax charged there. */
export const COUNTRIES = [
    { value: 'england', label: 'England', tax: 'SDLT' },
    { value: 'northern-ireland', label: 'Northern Ireland', tax: 'SDLT' },
    { value: 'scotland', label: 'Scotland', tax: 'LBTT' },
    { value: 'wales', label: 'Wales', tax: 'LTT' },
] as const;

export type Country = (typeof COUNTRIES)[number]['value'];

/** The short name of a property purchase tax. */
export type PropertyTaxName = (typeof COUNTRIES)[number]['tax'];

export const DEFAULT_COUNTRY: Country = 'england';

export const isCountry = (value: unknown): value is Country => COUNTRIES.some((country) => country.value === value);

/** The full name of each tax, for headings. */
export const PROPERTY_TAX_NAMES = {
    SDLT: 'Stamp Duty Land Tax',
    LBTT: 'Land and Buildings Transaction Tax',
    LTT: 'Land Transaction Tax',
} as const satisfies Record<PropertyTaxName, string>;

/** Buying this many dwellings or more in one transaction changes the rates that can apply. */
export const SIX_OR_MORE_DWELLINGS = NON_RESIDENTIAL_DWELLINGS_THRESHOLD;

/** Below this price neither Scotland's supplement nor Wales's higher rates are charged. */
export const ADDITIONAL_PROPERTY_THRESHOLD = HIGHER_RATES_THRESHOLD;

export interface PropertyTaxInput {
    /** The purchase price in pounds, from 0 to `Number.MAX_SAFE_INTEGER`. Rent on a new lease is not covered. */
    price: number;
    /** Defaults to `"home-mover"`. */
    buyer?: BuyerType;
    /** Defaults to `"residential"`. */
    propertyType?: PropertyType;
    /**
     * Dwellings bought in this one transaction. Defaults to 1.
     *
     * - Two to five, for £40,000 or more: charged as an additional property whoever the buyer is
     *   (higher rates in England, Northern Ireland and Wales; the ADS in Scotland), and first-time
     *   buyer relief is lost. The result's `buyer` is then `"additional-property"` and a note
     *   explains it. The subsidiary-dwelling (annexe) exception is not modelled.
     * - Six or more: non-residential rates in every country. In Wales the alternative, higher
     *   residential rates with multiple dwellings relief, is noted but not calculated.
     */
    dwellings?: number;
    /** Only changes the tax in England and Northern Ireland. Must be a boolean when given. Defaults to `false`. */
    nonUkResident?: boolean;
    /**
     * Scotland only, for a mixed-use purchase (`propertyType: "non-residential"`) by an
     * additional-property buyer: the part of the price, in pounds, that is for the dwelling. The
     * Additional Dwelling Supplement is charged on this part when it is £40,000 or more. Must not
     * be more than `price`. Left out, no supplement is charged and a note says it may be due.
     * Ignored everywhere else: Wales, England and Northern Ireland charge no higher rates on mixed use.
     */
    dwellingValue?: number;
}

/**
 * A flat charge reported apart from the bands: Scotland's ADS. It is charged on the whole price,
 * or in a mixed-use purchase on the part of the price that is for the dwelling.
 */
export interface PropertyTaxSupplement {
    /** `"ADS"`. */
    name: string;
    /** `"Additional Dwelling Supplement"`. */
    label: string;
    /** Percent of the amount the supplement is charged on. */
    rate: number;
    amount: number;
    formatted: { rate: string; amount: string };
}

/** One result shape for all three taxes. Plain JSON: the open-ended band ends in `null`. */
export interface PropertyTaxEstimate {
    country: Country;
    /** The short name of the tax: `"SDLT"`, `"LBTT"` or `"LTT"`. */
    tax: PropertyTaxName;
    price: number;
    /** The buyer type the tax was charged at, after the two-to-five-dwellings rule. */
    buyer: BuyerType;
    nonUkResident: boolean;
    /** The rates the tax was charged at, after any six-or-more-dwellings rule. */
    propertyType: PropertyType;
    /** Tax from the rate bands alone, before any supplement. */
    bandTax: number;
    /** The flat supplement, or `null` when none is charged. */
    supplement: PropertyTaxSupplement | null;
    /** Everything due: `bandTax` plus the supplement. */
    total: number;
    /** `total` as a percentage of the price; 0 for a price of 0. */
    effectiveRate: number;
    bands: StampDutyBand[];
    /** Plain-English sentences, such as a requested relief that does not exist in this country. */
    notes: string[];
    formatted: { price: string; bandTax: string; total: string; effectiveRate: string };
}

/** The input with defaults applied. Throws a `RangeError` when any part of it is invalid. */
export function resolveInput(input: PropertyTaxInput) {
    assertInput(input, 'property tax input');
    const price = checkAmount(input.price, 'property price');
    const options = resolvePurchaseOptions(input);
    const dwellingValue = input.dwellingValue === undefined ? null : checkAmount(input.dwellingValue, 'dwelling value');
    if (dwellingValue !== null && dwellingValue > price)
        throw new RangeError(`Invalid dwelling value: ${dwellingValue} is more than the price`);
    return { price, ...options, dwellingValue };
}

export type ResolvedPropertyTaxInput = ReturnType<typeof resolveInput>;

/** A flat percentage of an amount (the whole price, or the dwelling's part of it), rounded down to the pound like the band tax. */
export function toSupplement(price: number, rate: number, name: string, label: string): PropertyTaxSupplement {
    // Multiply before dividing: (price / 100) * rate loses a pound to floating point at some prices.
    const amount = Math.floor((price * rate) / 100);
    return { name, label, rate, amount, formatted: { rate: formatRate(rate), amount: formatPounds(amount) } };
}

/** An estimate from already-calculated bands; `bandTax` must be the sum of their tax. */
export function assembleEstimate(
    meta: Pick<PropertyTaxEstimate, 'country' | 'tax' | 'price' | 'buyer' | 'nonUkResident' | 'propertyType'>,
    banded: { tax: number; bands: StampDutyBand[] },
    supplement: PropertyTaxSupplement | null = null,
    notes: string[] = [],
): PropertyTaxEstimate {
    const total = banded.tax + (supplement?.amount ?? 0);
    const effectiveRate = meta.price > 0 ? (total / meta.price) * 100 : 0;

    return {
        ...meta,
        bandTax: banded.tax,
        supplement,
        total,
        effectiveRate,
        bands: banded.bands,
        notes,
        formatted: {
            price: formatPounds(meta.price),
            bandTax: formatPounds(banded.tax),
            total: formatPounds(total),
            effectiveRate: formatRate(effectiveRate),
        },
    };
}

/** An estimate from a price and the bands to charge it at, using the shared band engine. */
export function buildPropertyTaxEstimate(
    meta: Pick<PropertyTaxEstimate, 'country' | 'tax' | 'price' | 'buyer' | 'nonUkResident' | 'propertyType'>,
    bands: Band[],
    supplement: PropertyTaxSupplement | null = null,
    notes: string[] = [],
): PropertyTaxEstimate {
    return assembleEstimate(meta, toEstimateBands(meta.price, bands), supplement, notes);
}
