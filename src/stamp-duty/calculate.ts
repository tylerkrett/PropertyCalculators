import getDefaultBands from './bands/default';
import getFirstTimeBuyerBands from './bands/first-time-buyer';
import getFirstTimeBuyerAndNonUKResidents from './bands/first-time-buyer-non-uk-resident';
import getNonUKResidentsBands from './bands/non-uk-resident';
import getSecondHomeBands from './bands/second-home';
import getSecondHomeAndNonUKResidentBands from './bands/second-home-non-uk-resident';
import type { Band } from './bands/types';
import { formatPrice } from './format';

/*
 * The SDLT calculation. Results must not change without a rates change.
 */

export type { Band };

export type CalculatedBand = Band & { taxableSum: number; tax: number };

export type BandOptions = { secondHome?: boolean; firstTimeBuyer?: boolean; ukResident?: boolean };

export type StampDutyTotal = { value: number; bands: CalculatedBand[] };

function clamp(min: number, max: number, value: number): number {
    if (min > max) throw new Error('min must not be greater than max in clamp(min, max, value)');
    return value < min ? min : value > max ? max : value;
}

/**
 * The rate bands for a purchase. A second home wins over first-time buyer relief, and
 * `ukResident` must be passed as `true` to avoid the non-UK resident surcharge.
 */
export function getBands(price: number, { secondHome, firstTimeBuyer, ukResident }: BandOptions): Band[] {
    if (secondHome) {
        if (!ukResident) return getSecondHomeAndNonUKResidentBands(price);
        return getSecondHomeBands(price);
    }

    if (firstTimeBuyer) {
        if (!ukResident) return getFirstTimeBuyerAndNonUKResidents(price);
        return getFirstTimeBuyerBands(price);
    }

    if (!ukResident) {
        return getNonUKResidentsBands(price);
    }

    return getDefaultBands(price);
}

/** Total tax and the per-band breakdown. Tax in each band is rounded down to the pound. */
export function getStampDuty(price: number, bands: Band[]): StampDutyTotal {
    let remainingPrice = price;
    let taxOwed = 0;
    const breakdown: CalculatedBand[] = [];

    for (const band of bands) {
        const [lowerRange, upperRange] = band.range;
        const priceInBand = Number.isFinite(upperRange - lowerRange)
            ? clamp(0, remainingPrice, upperRange - lowerRange)
            : remainingPrice;
        // Multiply before dividing: (price / 100) * rate loses a pound to floating point at some prices.
        const taxInBand = Math.floor((priceInBand * band.rate) / 100);

        remainingPrice = clamp(0, Infinity, remainingPrice - priceInBand);
        taxOwed += taxInBand;
        breakdown.push({ ...band, taxableSum: priceInBand, tax: taxInBand });
    }

    return { value: taxOwed, bands: breakdown };
}

/** Stamp duty as a percentage of the price. `NaN` for a price of 0. */
export function computeActualRate(price: number, bands: Band[]): number {
    const stampDuty = getStampDuty(price, bands).value;
    return (stampDuty / price) * 100;
}

/** The price qualifier meaning "price on application". */
export const PRICE_QUALIFIER_POA = 1;

export const isPOA = (qualifier?: number | null): boolean => qualifier === PRICE_QUALIFIER_POA;

/**
 * The one-line label on a listing, at standard home-mover rates: `"Stamp Duty £43,750"`. `null`
 * for POA listings, a missing price, or when nothing is due.
 */
export function getStaticStampDuty(price: number, qualifier?: number | null): string | null {
    if (isPOA(qualifier) || !price) return null;
    const stampDuty = getStampDuty(price, getDefaultBands(price)).value;
    return !stampDuty ? null : `Stamp Duty ${formatPrice(stampDuty, '0,00')}`;
}
