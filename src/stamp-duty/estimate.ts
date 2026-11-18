import { NON_RESIDENTIAL_BANDS } from './bands/non-residential';
import { type Band, type BandOptions, getBands, getStampDuty } from './calculate';
import { formatBandRange } from './labels';
import { formatPounds, formatRate } from './format';
import {
    assertInput,
    type BuyerType,
    checkAmount,
    DEFAULT_BUYER_TYPE,
    HIGHER_RATES_THRESHOLD,
    isMultipleDwellingPurchase,
    isSixOrMoreDwellings,
    MAX_AMOUNT,
    type PropertyType,
    resolvePurchaseOptions,
} from './purchase';

export {
    BUYER_TYPES,
    type BuyerType,
    DEFAULT_BUYER_TYPE,
    DEFAULT_PROPERTY_TYPE,
    FIRST_TIME_BUYER_MAX_PRICE,
    HIGHER_RATES_THRESHOLD,
    isBuyerType,
    isPropertyType,
    PROPERTY_TYPES,
    type PropertyType,
} from './purchase';

/*
 * The high-level call: one input in, everything a calculator UI shows out. The result is plain
 * JSON (the open-ended band ends in `null`, not `Infinity`), so it can cross an API or a server
 * component boundary untouched. Each number comes with its display string.
 */

/**
 * The property type the tax is charged at: non-residential rates apply to non-residential and
 * mixed-use property, and to six or more dwellings bought in one transaction.
 */
export function resolvePropertyType(input: Pick<StampDutyInput, 'propertyType' | 'dwellings'> = {}): PropertyType {
    const { propertyType, dwellings } = resolvePurchaseOptions(input);
    return isSixOrMoreDwellings(dwellings) ? 'non-residential' : propertyType;
}

/** The highest price the calculators accept. */
export const MAX_PRICE = 1_000_000_000;

/** A whole number of pounds from 1 to `MAX_PRICE`. */
export const isValidPrice = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_PRICE;

/** A `?price=` page parameter (`"1250000"` or `"1,250,000"`); `null` when absent or invalid. */
export function parsePriceParam(value: string | string[] | undefined | null): number | null {
    if (typeof value !== 'string' || !/^\d[\d,]{0,13}$/.test(value)) return null;
    const price = Number(value.replace(/,/g, ''));
    return isValidPrice(price) ? price : null;
}

export interface StampDutyInput {
    /** Pounds, from 0 to `Number.MAX_SAFE_INTEGER`. */
    price: number;
    /** Defaults to `"home-mover"`. */
    buyer?: BuyerType;
    /** Adds the non-UK resident surcharge. Must be a boolean when given. Defaults to `false`. */
    nonUkResident?: boolean;
    /**
     * Defaults to `"residential"`. At non-residential rates there is no first-time buyer relief,
     * additional-property surcharge or non-UK resident surcharge, so `buyer` and `nonUkResident`
     * make no difference.
     */
    propertyType?: PropertyType;
    /**
     * Dwellings bought in this one transaction. Defaults to 1.
     *
     * - Two to five, for £40,000 or more: the higher rates for additional dwellings are charged
     *   whoever the buyer is, and first-time buyer relief is lost. The result's `buyer` is then
     *   `"additional-property"`. The subsidiary-dwelling (annexe) exception is not modelled: if it
     *   applies, leave `dwellings` at 1.
     * - Six or more: non-residential rates.
     */
    dwellings?: number;
}

/** One rate band. `to` is `null` for the open-ended top band. */
export interface StampDutyBand {
    from: number;
    to: number | null;
    /** Percent, surcharges included. */
    rate: number;
    /** The part of the price that falls in this band. */
    taxable: number;
    tax: number;
    formatted: { range: string; rate: string; taxable: string; tax: string };
}

export interface StampDutyEstimate {
    price: number;
    /** The buyer type the tax was charged at, after the two-to-five-dwellings rule. */
    buyer: BuyerType;
    nonUkResident: boolean;
    /** The rates the tax was charged at, after the six-or-more-dwellings rule. */
    propertyType: PropertyType;
    stampDuty: number;
    /** Stamp duty as a percentage of the price; 0 for a price of 0. */
    effectiveRate: number;
    bands: StampDutyBand[];
    formatted: { price: string; stampDuty: string; effectiveRate: string };
}

/** The low-level flags for a buyer type, and back. A second home wins over first-time buyer. */
export function toBandOptions({ buyer = DEFAULT_BUYER_TYPE, nonUkResident = false }: Omit<StampDutyInput, 'price'>) {
    return {
        secondHome: buyer === 'additional-property',
        firstTimeBuyer: buyer === 'first-time-buyer',
        ukResident: !nonUkResident,
    } satisfies BandOptions;
}

export function fromBandOptions({ secondHome, firstTimeBuyer, ukResident }: BandOptions) {
    const buyer: BuyerType = secondHome ? 'additional-property' : firstTimeBuyer ? 'first-time-buyer' : 'home-mover';
    return { buyer, nonUkResident: !ukResident };
}

/** Under £40,000 no residential SDLT is due. One band that holds any such price, pence included. */
const UNDER_THRESHOLD_BANDS: Band[] = [{ range: [0, HIGHER_RATES_THRESHOLD], rate: 0 }];

/** The residential rate bands for an amount: nothing under £40,000, the engine's tables from there. */
export const residentialBands = (amount: number, options: BandOptions): Band[] =>
    amount < HIGHER_RATES_THRESHOLD ? UNDER_THRESHOLD_BANDS : getBands(amount, options);

/**
 * Stamp duty for a purchase, with the band-by-band breakdown and display strings.
 * Throws a `RangeError` on invalid input.
 */
export function calculateStampDuty(input: StampDutyInput): StampDutyEstimate {
    assertInput(input, 'stamp duty input');
    const price = checkAmount(input.price, 'stamp duty price');
    const options = resolvePurchaseOptions(input);
    const { nonUkResident } = options;

    if (options.propertyType === 'non-residential' || isSixOrMoreDwellings(options.dwellings))
        return buildEstimate(price, NON_RESIDENTIAL_BANDS, {
            buyer: options.buyer,
            nonUkResident,
            propertyType: 'non-residential',
        });

    const buyer = isMultipleDwellingPurchase(price, options.dwellings) ? 'additional-property' : options.buyer;
    const bands = residentialBands(price, toBandOptions({ buyer, nonUkResident }));
    return buildEstimate(price, bands, { buyer, nonUkResident, propertyType: 'residential' });
}

/** One calculated band as plain JSON with its display strings. */
export function toEstimateBands(amount: number, bands: Band[]) {
    const total = getStampDuty(amount, bands);
    return {
        tax: total.value,
        bands: total.bands.map(({ range: [from, upper], rate, taxableSum, tax }): StampDutyBand => {
            const to = Number.isFinite(upper) ? upper : null;
            return {
                from,
                to,
                rate,
                taxable: taxableSum,
                tax,
                formatted: {
                    range: formatBandRange({ from, to }),
                    rate: formatRate(rate),
                    taxable: formatPounds(taxableSum),
                    tax: formatPounds(tax),
                },
            };
        }),
    };
}

/** An estimate from an amount and the bands to charge it at. */
export function buildEstimate(
    price: number,
    bands: Band[],
    meta: Pick<StampDutyEstimate, 'buyer' | 'nonUkResident' | 'propertyType'>,
): StampDutyEstimate {
    const total = toEstimateBands(price, bands);
    const effectiveRate = price > 0 ? (total.tax / price) * 100 : 0;

    return {
        price,
        ...meta,
        stampDuty: total.tax,
        effectiveRate,
        bands: total.bands,
        formatted: {
            price: formatPounds(price),
            stampDuty: formatPounds(total.tax),
            effectiveRate: formatRate(effectiveRate),
        },
    };
}

/** Just the amount, or `null` when the price can't be calculated: for listing cards. */
export function stampDutyFor(price: number | null | undefined, options: Omit<StampDutyInput, 'price'> = {}) {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > MAX_AMOUNT) return null;
    return calculateStampDuty({ price, ...options }).stampDuty;
}

/** Stamp duty for every distinct valid price on a page, keyed by price. */
export function stampDutyByPrice(
    prices: readonly (number | null | undefined)[],
    options: Omit<StampDutyInput, 'price'> = {},
): Record<number, number> {
    const byPrice: Record<number, number> = {};
    for (const price of prices) {
        const stampDuty = stampDutyFor(price, options);
        if (stampDuty !== null) byPrice[price as number] = stampDuty;
    }
    return byPrice;
}
