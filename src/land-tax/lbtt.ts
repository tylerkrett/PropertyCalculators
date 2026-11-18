/*
 * Land and Buildings Transaction Tax (LBTT): the tax on buying property in Scotland, collected by
 * Revenue Scotland. The price is sliced into bands and each slice is taxed at its band's rate.
 * First-time buyers get a larger tax-free band. Buying an additional home adds the Additional
 * Dwelling Supplement (ADS): a flat percentage of the whole price, on top of the band tax. In a
 * mixed-use purchase the ADS is charged on the part of the price that is for the dwelling.
 * Purchase price only: rent on a new lease is not covered.
 *
 * Sources (checked 18 November 2026):
 * https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property
 * https://revenue.scot/taxes/land-buildings-transaction-tax/non-residential-property
 * https://revenue.scot/taxes/land-buildings-transaction-tax/additional-dwelling-supplement-ads
 * https://revenue.scot/taxes/land-buildings-transaction-tax/lbtt-legislation-guidance/additional-dwelling-supplement-ads-technical/ads-rules-particular-transactions-buyers
 * (LBTT10019: mixed transactions, and relief for six or more dwellings)
 */
import type { Band } from '../stamp-duty/calculate';
import { formatPounds, formatRate } from '../stamp-duty/format';
import { isMultipleDwellingPurchase, isSixOrMoreDwellings, multipleDwellingsNote } from '../stamp-duty/purchase';
import {
    ADDITIONAL_PROPERTY_THRESHOLD,
    buildPropertyTaxEstimate,
    type PropertyTaxEstimate,
    type PropertyTaxInput,
    type PropertyTaxSupplement,
    type ResolvedPropertyTaxInput,
    resolveInput,
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

/** The Additional Dwelling Supplement: this percentage of the price (of the dwelling's part, in mixed use), since 5 December 2024. */
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

const ADS = 'Additional Dwelling Supplement';
const ADS_THRESHOLD = formatPounds(LBTT_ADS_THRESHOLD);
const ads = (amount: number) => toSupplement(amount, LBTT_ADS_RATE, 'ADS', ADS);

const NOTES = {
    sixOrMoreDwellings:
        'Six or more dwellings bought in one transaction are taxed at non-residential rates in Scotland.',
    noFirstTimeBuyerRelief: 'First-time buyer relief does not apply at non-residential rates.',
    adsSixOrMoreRelief: `Full relief from the ${ADS} is available when six or more dwellings are bought in one transaction, so it is not charged.`,
    adsMixedUseNotIncluded: `The ${ADS} is still due on any dwelling included in a mixed-use purchase: ${formatRate(LBTT_ADS_RATE)} of the part of the price that is for the dwelling, when that part is ${ADS_THRESHOLD} or more. This estimate does not include it.`,
    adsMixedUseUnderThreshold: `The ${ADS} is not charged: the part of the price that is for the dwelling is under ${ADS_THRESHOLD}.`,
    adsUnderThreshold: `The ${ADS} is not charged on purchases under ${ADS_THRESHOLD}.`,
    adsWholePrice: `The ${ADS} is ${formatRate(LBTT_ADS_RATE)} of the whole price, on top of the tax from the bands.`,
    noNonUkSurcharge: 'Scotland has no surcharge for non-UK residents, so the tax is the same as for a UK resident.',
} as const;

/** The supplement and the sentences for a purchase at non-residential rates: mixed use, or six or more dwellings. */
function nonResidential(input: ResolvedPropertyTaxInput): {
    supplement: PropertyTaxSupplement | null;
    notes: string[];
} {
    const sixOrMore = isSixOrMoreDwellings(input.dwellings);
    const notes: string[] = [];
    if (sixOrMore && input.propertyType === 'residential') notes.push(NOTES.sixOrMoreDwellings);
    if (input.buyer === 'first-time-buyer') notes.push(NOTES.noFirstTimeBuyerRelief);
    if (input.buyer !== 'additional-property') return { supplement: null, notes };

    if (sixOrMore) return { supplement: null, notes: [...notes, NOTES.adsSixOrMoreRelief] };
    if (input.dwellingValue === null) return { supplement: null, notes: [...notes, NOTES.adsMixedUseNotIncluded] };
    if (input.dwellingValue < LBTT_ADS_THRESHOLD)
        return { supplement: null, notes: [...notes, NOTES.adsMixedUseUnderThreshold] };
    return {
        supplement: ads(input.dwellingValue),
        notes: [
            ...notes,
            `The ${ADS} is ${formatRate(LBTT_ADS_RATE)} of the ${formatPounds(input.dwellingValue)} of the price that is for the dwelling, on top of the tax from the bands.`,
        ],
    };
}

/**
 * LBTT for a purchase in Scotland, with the band-by-band breakdown, the Additional Dwelling
 * Supplement as its own line, and display strings. Throws a `RangeError` on invalid input.
 */
export function calculateLbtt(input: PropertyTaxInput): PropertyTaxEstimate {
    const resolved = resolveInput(input);
    const { price, nonUkResident, dwellings } = resolved;
    const shared = { country: 'scotland', tax: 'LBTT', price, nonUkResident } as const;
    const residencyNotes = nonUkResident ? [NOTES.noNonUkSurcharge] : [];

    if (resolved.propertyType === 'non-residential' || isSixOrMoreDwellings(dwellings)) {
        const meta = { ...shared, buyer: resolved.buyer, propertyType: 'non-residential' } as const;
        const { supplement, notes } = nonResidential(resolved);
        return buildPropertyTaxEstimate(meta, LBTT_NON_RESIDENTIAL_BANDS, supplement, [...notes, ...residencyNotes]);
    }

    // Two to five dwellings: the buyer owns more than one afterwards, so the ADS is due whoever they are.
    const multiple = resolved.buyer !== 'additional-property' && isMultipleDwellingPurchase(price, dwellings);
    const buyer = multiple ? 'additional-property' : resolved.buyer;
    const meta = { ...shared, buyer, propertyType: 'residential' } as const;
    const dwellingNotes = multiple
        ? [multipleDwellingsNote(dwellings, `the ${ADS} is charged, and first-time buyer relief does not apply`)]
        : [];

    if (buyer === 'first-time-buyer')
        return buildPropertyTaxEstimate(meta, LBTT_FIRST_TIME_BUYER_BANDS, null, residencyNotes);

    if (buyer !== 'additional-property')
        return buildPropertyTaxEstimate(meta, LBTT_RESIDENTIAL_BANDS, null, residencyNotes);

    if (price < LBTT_ADS_THRESHOLD)
        return buildPropertyTaxEstimate(meta, LBTT_RESIDENTIAL_BANDS, null, [
            NOTES.adsUnderThreshold,
            ...residencyNotes,
        ]);

    return buildPropertyTaxEstimate(meta, LBTT_RESIDENTIAL_BANDS, ads(price), [
        ...dwellingNotes,
        NOTES.adsWholePrice,
        ...residencyNotes,
    ]);
}
