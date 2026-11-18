/*
 * Land Transaction Tax (LTT): the tax on buying property in Wales, collected by the Welsh Revenue
 * Authority. The price is sliced into bands and each slice is taxed at its band's rate. Buying an
 * additional home for £40,000 or more is taxed at a separate, higher set of bands that replaces
 * the main ones. Wales has no first-time buyer relief. Six or more dwellings bought together are
 * taxed here at non-residential rates; the buyer's other choice, higher residential rates with
 * multiple dwellings relief, is not calculated. Purchase price only: rent on a new lease is not covered.
 *
 * Sources (checked 18 November 2026):
 * https://www.gov.wales/land-transaction-tax-rates-and-bands
 * https://www.gov.wales/land-transaction-tax-guide
 * https://www.gov.wales/higher-rates-land-transaction-tax-guide
 */
import type { Band } from '../stamp-duty/calculate';
import { formatPounds } from '../stamp-duty/format';
import { isMultipleDwellingPurchase, isSixOrMoreDwellings, multipleDwellingsNote } from '../stamp-duty/purchase';
import {
    ADDITIONAL_PROPERTY_THRESHOLD,
    buildPropertyTaxEstimate,
    type PropertyTaxEstimate,
    type PropertyTaxInput,
    resolveInput,
} from './shared';

/** Main residential rates, for transactions on or after 10 October 2022. */
export const LTT_RESIDENTIAL_BANDS: Band[] = [
    { range: [0, 225_000], rate: 0 },
    { range: [225_000, 400_000], rate: 6 },
    { range: [400_000, 750_000], rate: 7.5 },
    { range: [750_000, 1_500_000], rate: 10 },
    { range: [1_500_000, Infinity], rate: 12 },
];

/** Higher residential rates for additional properties, for transactions on or after 11 December 2024. */
export const LTT_HIGHER_RESIDENTIAL_BANDS: Band[] = [
    { range: [0, 180_000], rate: 5 },
    { range: [180_000, 250_000], rate: 8.5 },
    { range: [250_000, 400_000], rate: 10 },
    { range: [400_000, 750_000], rate: 12.5 },
    { range: [750_000, 1_500_000], rate: 15 },
    { range: [1_500_000, Infinity], rate: 17 },
];

/** Non-residential and mixed-use rates, for transactions on or after 22 December 2020. */
export const LTT_NON_RESIDENTIAL_BANDS: Band[] = [
    { range: [0, 225_000], rate: 0 },
    { range: [225_000, 250_000], rate: 1 },
    { range: [250_000, 1_000_000], rate: 5 },
    { range: [1_000_000, Infinity], rate: 6 },
];

/** The higher residential rates apply when the price is this much or more. */
export const LTT_HIGHER_RATES_THRESHOLD = ADDITIONAL_PROPERTY_THRESHOLD;

/** Every LTT rate table, for pages that show the rates themselves. */
export const LTT_BAND_TABLES = {
    residential: LTT_RESIDENTIAL_BANDS,
    higherResidential: LTT_HIGHER_RESIDENTIAL_BANDS,
    nonResidential: LTT_NON_RESIDENTIAL_BANDS,
} as const;

/** Where LTT applies. */
export const LTT_JURISDICTION = 'Wales';

/** The date each rate table came into force. */
export const LTT_EFFECTIVE_FROM = {
    residential: '2022-10-10',
    higherResidential: '2024-12-11',
    nonResidential: '2020-12-22',
} as const;

/** The date of the most recent change to any LTT rate. Update alongside the tables. */
export const LTT_RATES_EFFECTIVE_FROM = LTT_EFFECTIVE_FROM.higherResidential;

const NOTES = {
    noFirstTimeBuyerRelief: 'Wales has no first-time buyer relief, so the main residential rates apply.',
    noNonUkSurcharge: 'Wales has no surcharge for non-UK residents, so the tax is the same as for a UK resident.',
    higherRatesNotNonResidential: 'The higher residential rates are not charged on non-residential property.',
    belowHigherRatesThreshold: `The higher residential rates are not charged on purchases under ${formatPounds(LTT_HIGHER_RATES_THRESHOLD)}, so the main residential rates apply.`,
    sixOrMoreDwellings:
        'Six or more dwellings bought in one transaction are taxed at non-residential rates in this estimate. In Wales you can usually choose instead to pay the higher residential rates with multiple dwellings relief, which is not calculated here.',
} as const;

/** The residential bands for a buyer, with the sentences explaining the choice. */
function residentialBands(price: number, buyer: PropertyTaxEstimate['buyer']): { bands: Band[]; notes: string[] } {
    if (buyer === 'first-time-buyer') return { bands: LTT_RESIDENTIAL_BANDS, notes: [NOTES.noFirstTimeBuyerRelief] };
    if (buyer !== 'additional-property') return { bands: LTT_RESIDENTIAL_BANDS, notes: [] };
    if (price < LTT_HIGHER_RATES_THRESHOLD)
        return { bands: LTT_RESIDENTIAL_BANDS, notes: [NOTES.belowHigherRatesThreshold] };
    return { bands: LTT_HIGHER_RESIDENTIAL_BANDS, notes: [] };
}

/**
 * LTT for a purchase in Wales, with the band-by-band breakdown and display strings.
 * Throws a `RangeError` on invalid input.
 */
export function calculateLtt(input: PropertyTaxInput): PropertyTaxEstimate {
    const resolved = resolveInput(input);
    const { price, nonUkResident, dwellings } = resolved;
    const shared = { country: 'wales', tax: 'LTT', price, nonUkResident } as const;
    const residencyNotes = nonUkResident ? [NOTES.noNonUkSurcharge] : [];

    const sixOrMore = isSixOrMoreDwellings(dwellings);
    if (sixOrMore || resolved.propertyType === 'non-residential') {
        const meta = { ...shared, buyer: resolved.buyer, propertyType: 'non-residential' } as const;
        const notes: string[] = [];
        if (sixOrMore && resolved.propertyType === 'residential') notes.push(NOTES.sixOrMoreDwellings);
        else if (resolved.buyer === 'additional-property') notes.push(NOTES.higherRatesNotNonResidential);
        return buildPropertyTaxEstimate(meta, LTT_NON_RESIDENTIAL_BANDS, null, [...notes, ...residencyNotes]);
    }

    // Two to five dwellings: the buyer owns more than one afterwards, so the higher rates are due whoever they are.
    const multiple = resolved.buyer !== 'additional-property' && isMultipleDwellingPurchase(price, dwellings);
    const buyer = multiple ? 'additional-property' : resolved.buyer;
    const meta = { ...shared, buyer, propertyType: 'residential' } as const;
    const dwellingNotes = multiple
        ? [multipleDwellingsNote(dwellings, 'the higher residential rates are charged')]
        : [];

    const { bands, notes } = residentialBands(price, buyer);
    return buildPropertyTaxEstimate(meta, bands, null, [...dwellingNotes, ...notes, ...residencyNotes]);
}
