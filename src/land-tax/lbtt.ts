/*
 * Land and Buildings Transaction Tax (LBTT): the tax on buying property in Scotland, collected by
 * Revenue Scotland. The price is sliced into bands and each slice is taxed at its band's rate.
 * First-time buyers get a larger tax-free band. Buying an additional home adds the Additional
 * Dwelling Supplement (ADS): a flat percentage of the whole price, on top of the band tax.
 * Purchase price only: rent on a new lease is not covered.
 *
 * Sources (checked 18 November 2026):
 * https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property
 * https://revenue.scot/taxes/land-buildings-transaction-tax/non-residential-property
 * https://revenue.scot/taxes/land-buildings-transaction-tax/additional-dwelling-supplement-ads
 */
import type { Band } from '../stamp-duty/calculate';
import type { PropertyType } from '../stamp-duty/estimate';
import { formatPounds, formatRate } from '../stamp-duty/format';
import {
    ADDITIONAL_PROPERTY_THRESHOLD,
    buildPropertyTaxEstimate,
    type PropertyTaxEstimate,
    type PropertyTaxInput,
    resolveInput,
    SIX_OR_MORE_DWELLINGS,
    toSupplement,
} from './shared';

/** Residential rates, for transactions on or after 1 April 2021. */
export const LBTT_RESIDENTIAL_BANDS: Band[] = [
    { range: [0, 145_000], rate: 0 },
    { range: [145_000, 250_000], rate: 2 },
    { range: [250_000, 325_000], rate: 5 },
    { range: [325_000, 750_000], rate: 10 },
    { range: [750_000, Infinity], rate: 12 },
];

/** First-time buyer relief raises the tax-free band to this price, saving up to £600. */
export const LBTT_FIRST_TIME_BUYER_NIL_BAND = 175_000;

/** Residential rates with first-time buyer relief. The relief has no upper price limit. */
export const LBTT_FIRST_TIME_BUYER_BANDS: Band[] = [
    { range: [0, LBTT_FIRST_TIME_BUYER_NIL_BAND], rate: 0 },
    { range: [LBTT_FIRST_TIME_BUYER_NIL_BAND, 250_000], rate: 2 },
    { range: [250_000, 325_000], rate: 5 },
    { range: [325_000, 750_000], rate: 10 },
    { range: [750_000, Infinity], rate: 12 },
];

/** Non-residential and mixed-use rates, for transactions on or after 25 January 2019. */
export const LBTT_NON_RESIDENTIAL_BANDS: Band[] = [
    { range: [0, 150_000], rate: 0 },
    { range: [150_000, 250_000], rate: 1 },
    { range: [250_000, Infinity], rate: 5 },
];

/** The Additional Dwelling Supplement: this percentage of the whole price, since 5 December 2024. */
export const LBTT_ADS_RATE = 8;

/** The ADS is charged when the price is this much or more. */
export const LBTT_ADS_THRESHOLD = ADDITIONAL_PROPERTY_THRESHOLD;

/** Every LBTT rate table, for pages that show the rates themselves. */
export const LBTT_BAND_TABLES = {
    residential: LBTT_RESIDENTIAL_BANDS,
    firstTimeBuyer: LBTT_FIRST_TIME_BUYER_BANDS,
    nonResidential: LBTT_NON_RESIDENTIAL_BANDS,
} as const;

/** Where LBTT applies. */
export const LBTT_JURISDICTION = 'Scotland';

/** The date each part of the rates came into force. */
export const LBTT_EFFECTIVE_FROM = {
    residential: '2021-04-01',
    nonResidential: '2019-01-25',
    ads: '2024-12-05',
} as const;

/** The date of the most recent change to any LBTT rate. Update alongside the tables. */
export const LBTT_RATES_EFFECTIVE_FROM = LBTT_EFFECTIVE_FROM.ads;

/** Six or more dwellings bought in one transaction are taxed as non-residential property. */
const resolveLbttPropertyType = (propertyType: PropertyType, dwellings: number): PropertyType =>
    dwellings >= SIX_OR_MORE_DWELLINGS ? 'non-residential' : propertyType;

/** The sentences explaining what was, or was not, applied to a non-residential purchase. */
function nonResidentialNotes(input: ReturnType<typeof resolveInput>): string[] {
    const notes: string[] = [];
    if (input.propertyType === 'residential')
        notes.push('Six or more dwellings bought in one transaction are taxed at non-residential rates in Scotland.');
    if (input.buyer === 'first-time-buyer')
        notes.push('First-time buyer relief does not apply at non-residential rates.');
    if (input.buyer === 'additional-property')
        notes.push('The Additional Dwelling Supplement is not charged at non-residential rates.');
    return notes;
}

const NO_NON_UK_SURCHARGE =
    'Scotland has no surcharge for non-UK residents, so the tax is the same as for a UK resident.';

/**
 * LBTT for a purchase in Scotland, with the band-by-band breakdown, the Additional Dwelling
 * Supplement as its own line, and display strings. Throws a `RangeError` on invalid input.
 */
export function calculateLbtt(input: PropertyTaxInput): PropertyTaxEstimate {
    const resolved = resolveInput(input);
    const { price, buyer, nonUkResident } = resolved;
    const propertyType = resolveLbttPropertyType(resolved.propertyType, resolved.dwellings);
    const meta = { country: 'scotland', tax: 'LBTT', price, buyer, nonUkResident, propertyType } as const;
    const residencyNotes = nonUkResident ? [NO_NON_UK_SURCHARGE] : [];

    if (propertyType === 'non-residential')
        return buildPropertyTaxEstimate(meta, LBTT_NON_RESIDENTIAL_BANDS, null, [
            ...nonResidentialNotes(resolved),
            ...residencyNotes,
        ]);

    if (buyer === 'first-time-buyer')
        return buildPropertyTaxEstimate(meta, LBTT_FIRST_TIME_BUYER_BANDS, null, residencyNotes);

    if (buyer !== 'additional-property')
        return buildPropertyTaxEstimate(meta, LBTT_RESIDENTIAL_BANDS, null, residencyNotes);

    if (price < LBTT_ADS_THRESHOLD)
        return buildPropertyTaxEstimate(meta, LBTT_RESIDENTIAL_BANDS, null, [
            `The Additional Dwelling Supplement is not charged on purchases under ${formatPounds(LBTT_ADS_THRESHOLD)}.`,
            ...residencyNotes,
        ]);

    const ads = toSupplement(price, LBTT_ADS_RATE, 'ADS', 'Additional Dwelling Supplement');
    return buildPropertyTaxEstimate(meta, LBTT_RESIDENTIAL_BANDS, ads, [
        `The Additional Dwelling Supplement is ${formatRate(LBTT_ADS_RATE)} of the whole price, on top of the tax from the bands.`,
        ...residencyNotes,
    ]);
}
