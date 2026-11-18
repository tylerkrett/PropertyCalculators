import { NON_RESIDENTIAL_BANDS, NON_RESIDENTIAL_DWELLINGS_THRESHOLD } from './bands/non-residential';
import { type Band, type BandOptions, getBands, getStampDuty } from './calculate';
import { formatBandRange } from './labels';
import { formatPounds, formatRate } from './format';

/*
 * The high-level call: one input in, everything a calculator UI shows out. The result is plain
 * JSON (the open-ended band ends in `null`, not `Infinity`), so it can cross an API or a server
 * component boundary untouched. Each number comes with its display string.
 */

/** Who is buying: decides first-time buyer relief and the additional-property surcharge. */
export const BUYER_TYPES = [
    { value: 'home-mover', label: 'Home mover' },
    { value: 'first-time-buyer', label: 'First-time buyer' },
    { value: 'additional-property', label: 'Additional property' },
] as const;

export type BuyerType = (typeof BUYER_TYPES)[number]['value'];

export const DEFAULT_BUYER_TYPE: BuyerType = 'home-mover';

export const isBuyerType = (value: unknown): value is BuyerType => BUYER_TYPES.some((buyer) => buyer.value === value);

/** What is being bought. Mixed use (a shop with a flat above) counts as non-residential. */
export const PROPERTY_TYPES = [
    { value: 'residential', label: 'Residential' },
    { value: 'non-residential', label: 'Non-residential or mixed use' },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

export const DEFAULT_PROPERTY_TYPE: PropertyType = 'residential';

export const isPropertyType = (value: unknown): value is PropertyType =>
    PROPERTY_TYPES.some((type) => type.value === value);

/**
 * The property type the tax is charged at: non-residential rates apply to non-residential and
 * mixed-use property, and to six or more dwellings bought in one transaction.
 */
export function resolvePropertyType({
    propertyType = DEFAULT_PROPERTY_TYPE,
    dwellings = 1,
}: Pick<StampDutyInput, 'propertyType' | 'dwellings'> = {}): PropertyType {
    if (!isPropertyType(propertyType)) throw new RangeError(`Invalid property type: ${String(propertyType)}`);
    if (!Number.isInteger(dwellings) || dwellings < 1)
        throw new RangeError(`Invalid number of dwellings: ${String(dwellings)}`);
    return dwellings >= NON_RESIDENTIAL_DWELLINGS_THRESHOLD ? 'non-residential' : propertyType;
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
    /** Pounds, 0 or more. */
    price: number;
    /** Defaults to `"home-mover"`. */
    buyer?: BuyerType;
    /** Adds the non-UK resident surcharge. Defaults to `false`. */
    nonUkResident?: boolean;
    /**
     * Defaults to `"residential"`. At non-residential rates there is no first-time buyer relief,
     * additional-property surcharge or non-UK resident surcharge, so `buyer` and `nonUkResident`
     * make no difference.
     */
    propertyType?: PropertyType;
    /** Dwellings bought in this one transaction. Six or more are taxed at non-residential rates. Defaults to 1. */
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

/**
 * Stamp duty for a purchase, with the band-by-band breakdown and display strings.
 * Throws a `RangeError` unless `price` is a finite number of 0 or more.
 */
export function calculateStampDuty(input: StampDutyInput): StampDutyEstimate {
    const { price, buyer = DEFAULT_BUYER_TYPE, nonUkResident = false } = input;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
        throw new RangeError(`Invalid stamp duty price: ${String(price)}`);
    if (!isBuyerType(buyer)) throw new RangeError(`Invalid buyer type: ${String(buyer)}`);

    const propertyType = resolvePropertyType(input);
    const bands =
        propertyType === 'non-residential'
            ? NON_RESIDENTIAL_BANDS
            : getBands(price, toBandOptions({ buyer, nonUkResident }));

    return buildEstimate(price, bands, { buyer, nonUkResident, propertyType });
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
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
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
