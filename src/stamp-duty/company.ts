import { NON_RESIDENTIAL_BANDS } from './bands/non-residential';
import { type Band, getBands } from './calculate';
import {
    type BuyerType,
    DEFAULT_BUYER_TYPE,
    type StampDutyEstimate,
    type StampDutyInput,
    buildEstimate,
    resolvePropertyType,
} from './estimate';
import { formatPounds, formatRate } from './format';

/*
 * Purchases by companies and other "non-natural persons" (England and Northern Ireland).
 *
 * A company, a partnership with a company among its partners, or a collective investment scheme
 * pays a flat 17% on the whole price of a dwelling that costs more than £500,000, not the usual
 * banded rates. Seven reliefs (a rental business, a developer and so on) switch the flat rate off.
 *
 * Whenever the flat rate is not charged, a company buying a dwelling for £40,000 or more pays the
 * higher rates for additional dwellings (the standard bands plus 5 points), even on its first
 * property. A non-UK resident company pays 2 points more on top of either: 19% flat.
 *
 * Sources: GOV.UK "Stamp Duty Land Tax: corporate bodies" and "Higher rates of Stamp Duty Land
 * Tax"; HMRC SDLT manual SDLTM09500 onwards, SDLTM09835 and SDLTM09870; Finance Act 2003,
 * Schedule 4A (flat rate), Schedule 4ZA paragraph 7 (higher rates) and section 75ZA (surcharge).
 */

/** The flat rate, in percent, before the non-UK resident surcharge. */
export const COMPANY_FLAT_RATE = 17;

/** The flat rate applies to a single dwelling costing MORE than this; exactly £500,000 escapes it. */
export const COMPANY_FLAT_RATE_THRESHOLD = 500_000;

/** The date the flat rate rose from 15% to 17%. Earlier purchases are not covered. */
export const COMPANY_FLAT_RATE_EFFECTIVE_FROM = '2024-10-31';

/** Percentage points added to every residential rate for a non-UK resident buyer. */
export const NON_UK_RESIDENT_SURCHARGE = 2;

/** The reliefs that switch the flat rate off. Each has conditions of its own, which are not checked here. */
export const COMPANY_RELIEFS = [
    { value: 'property-rental-business', label: 'Used in a property rental business' },
    { value: 'property-developer-or-trader', label: 'Bought by a property developer or trader' },
    { value: 'trade-open-to-public', label: 'Used in a trade that makes the property available to the public' },
    { value: 'financial-institution-lending', label: 'Bought by a financial institution in the course of lending' },
    { value: 'employee-occupation', label: "Occupied by the purchaser's employees" },
    { value: 'farmhouse', label: 'A farmhouse' },
    { value: 'qualifying-housing-co-operative', label: 'Bought by a qualifying housing co-operative' },
] as const;

export type CompanyRelief = (typeof COMPANY_RELIEFS)[number]['value'];

export const isCompanyRelief = (value: unknown): value is CompanyRelief =>
    COMPANY_RELIEFS.some((relief) => relief.value === value);

export interface CompanyStampDutyInput extends Pick<StampDutyInput, 'price' | 'propertyType' | 'dwellings'> {
    /** The company is not UK resident for this purchase. Adds the 2-point surcharge. Defaults to `false`. */
    nonUkResident?: boolean;
    /** A relief from the flat rate the company is claiming. Defaults to `null`: none. */
    relief?: CompanyRelief | null;
}

export interface CompanyStampDuty extends StampDutyEstimate {
    /** What was actually charged. */
    applied: {
        /** The flat 17% (19% for a non-UK resident) was charged on the whole price. */
        flatRate: boolean;
        /** The relief that switched the flat rate off; `null` when none was claimed or none was needed. */
        relief: CompanyRelief | null;
        /** The higher rates for additional dwellings were charged. */
        higherRates: boolean;
        nonUkResidentSurcharge: boolean;
    };
    /** Plain-English reasons for the rates that were charged. */
    notes: string[];
}

const THRESHOLD = formatPounds(COMPANY_FLAT_RATE_THRESHOLD);
const HIGHER_RATES_NOTE =
    'A company pays the higher rates for additional dwellings (5 points on top of the standard rates), even on its first property.';

/**
 * Stamp duty for a purchase by a company, a partnership with a company partner, or a collective
 * investment scheme. The result has the same shape as `calculateStampDuty`, plus `applied` and `notes`.
 *
 * - a dwelling over £500,000 with no relief: a flat 17% of the whole price, shown as a single band
 * - any other dwelling of £40,000 or more: the higher rates, the same figures as
 *   `calculateStampDuty({ buyer: 'additional-property' })`
 * - `nonUkResident` adds 2 points to either
 * - non-residential or mixed-use property: the ordinary non-residential rates
 *
 * With more than one dwelling, `price` is the total and is assumed to be split equally: the flat
 * rate is tested against the price per dwelling. Six or more dwellings that escape the flat rate
 * are charged at non-residential rates.
 *
 * Throws a `RangeError` on invalid input.
 */
export function calculateCompanyStampDuty(input: CompanyStampDutyInput): CompanyStampDuty {
    const { price, nonUkResident = false, relief = null, dwellings = 1 } = input;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
        throw new RangeError(`Invalid stamp duty price: ${String(price)}`);
    if (typeof nonUkResident !== 'boolean')
        throw new RangeError(`Invalid non-UK resident flag: ${String(nonUkResident)}`);
    if (relief !== null && !isCompanyRelief(relief)) throw new RangeError(`Invalid company relief: ${String(relief)}`);

    // Validates `propertyType` and `dwellings`, and applies the six-or-more-dwellings rule.
    const bandedPropertyType = resolvePropertyType(input);
    const residential = (input.propertyType ?? 'residential') === 'residential';
    const overThreshold = residential && price / dwellings > COMPANY_FLAT_RATE_THRESHOLD;
    const flatRate = overThreshold && relief === null;
    const notes: string[] = [];

    let bands: Band[];
    let buyer: BuyerType = 'additional-property';
    let propertyType = bandedPropertyType;
    let higherRates = false;
    let surcharge = false;

    if (flatRate) {
        // Six or more dwellings do not escape the flat rate: each is still a dwelling over the threshold.
        propertyType = 'residential';
        surcharge = nonUkResident;
        const rate = COMPANY_FLAT_RATE + (surcharge ? NON_UK_RESIDENT_SURCHARGE : 0);
        bands = [{ range: [0, Infinity], rate }];
        notes.push(
            `A company buying a dwelling for more than ${THRESHOLD} pays a flat ${formatRate(COMPANY_FLAT_RATE)} on the whole price.`,
        );
        if (surcharge)
            notes.push(
                `The non-UK resident surcharge adds ${NON_UK_RESIDENT_SURCHARGE} points, making the flat rate ${formatRate(rate)}.`,
            );
    } else if (propertyType === 'non-residential') {
        bands = NON_RESIDENTIAL_BANDS;
        buyer = DEFAULT_BUYER_TYPE;
        notes.push(
            residential
                ? 'Six or more dwellings bought in one transaction are charged at non-residential rates.'
                : `Non-residential rates apply. If the purchase includes a dwelling worth more than ${THRESHOLD}, the flat rate applies to that dwelling: calculate it separately.`,
        );
        if (nonUkResident) notes.push('The non-UK resident surcharge does not apply at non-residential rates.');
    } else {
        // The engine's additional-property tables charge nothing under £40,000 and the higher rates above.
        bands = getBands(price, { secondHome: true, ukResident: !nonUkResident });
        higherRates = price >= 40_000;
        surcharge = nonUkResident && higherRates;
        notes.push(
            higherRates
                ? HIGHER_RATES_NOTE
                : 'No stamp duty is due on a dwelling bought for less than £40,000, and the higher rates do not apply.',
        );
        if (surcharge)
            notes.push(`The non-UK resident surcharge adds ${NON_UK_RESIDENT_SURCHARGE} points to every band.`);
    }

    if (overThreshold && !flatRate) {
        const label = COMPANY_RELIEFS.find((item) => item.value === relief)?.label ?? String(relief);
        notes.unshift(
            `The flat ${formatRate(COMPANY_FLAT_RATE)} rate does not apply because a relief is claimed: ${label.toLowerCase()}.`,
        );
    } else if (relief !== null) {
        notes.push(
            residential
                ? `The relief is not needed: the flat ${formatRate(COMPANY_FLAT_RATE)} rate only applies to a dwelling costing more than ${THRESHOLD}.`
                : `The relief is not needed: the flat ${formatRate(COMPANY_FLAT_RATE)} rate only applies to dwellings.`,
        );
    }
    if (residential && dwellings > 1)
        notes.push(
            `The price is assumed to be split equally between the ${dwellings} dwellings. If any one dwelling costs more than ${THRESHOLD} and the others do not, calculate it separately.`,
        );

    return {
        ...buildEstimate(price, bands, { buyer, nonUkResident, propertyType }),
        applied: {
            flatRate,
            relief: overThreshold && !flatRate ? relief : null,
            higherRates,
            nonUkResidentSurcharge: surcharge,
        },
        notes,
    };
}
