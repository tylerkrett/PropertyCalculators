import { BAND_TABLES } from './bands/index';
import { NON_RESIDENTIAL_BANDS, NON_RESIDENTIAL_RENT_BANDS, RESIDENTIAL_RENT_BANDS } from './bands/non-residential';
import type { Band } from './calculate';
import {
    type StampDutyBand,
    type StampDutyEstimate,
    type StampDutyInput,
    buildEstimate,
    residentialBands,
    toBandOptions,
    toEstimateBands,
} from './estimate';
import { formatPounds } from './format';
import {
    assertInput,
    type BuyerType,
    checkAmount,
    DEFAULT_BUYER_TYPE,
    FIRST_TIME_BUYER_MAX_PRICE,
    HIGHER_RATES_THRESHOLD,
    isMultipleDwellingPurchase,
    isSixOrMoreDwellings,
    multipleDwellingsNote,
    type PropertyType,
    resolvePurchaseOptions,
} from './purchase';
import { type RentInput, calculateRentNpv, highestRent } from './rent';

/*
 * New leases. Buying a new lease is taxed twice over: once on the premium (the lump sum, taxed
 * like a freehold price) and once on the rent, through its "net present value": every year's rent
 * discounted back to today and added up (Finance Act 2003, Schedule 5).
 *
 * An existing lease that is sold on ("assigned") is taxed on its price alone: use
 * `calculateStampDuty` for that.
 */

/** A lease granted for this many years or fewer escapes both surcharges. */
export const SHORT_LEASE_YEARS = 7;

/** First-time buyer relief needs a lease of at least this many years. */
export const FIRST_TIME_BUYER_MIN_LEASE_YEARS = 21;

/** The non-UK resident surcharge applies to a lease with a premium or an annual rent of at least these. */
export const SURCHARGE_MIN_PREMIUM = HIGHER_RATES_THRESHOLD;
export const SURCHARGE_MIN_ANNUAL_RENT = 1_000;

export interface LeaseStampDutyInput extends RentInput, Omit<StampDutyInput, 'price'> {
    /** The lump sum paid for the lease, in pounds. 0 when there is none. */
    premium: number;
}

export interface LeaseStampDuty {
    /** Tax on the premium, with its breakdown. `price` is the premium. */
    premium: StampDutyEstimate;
    /** Tax on the rent. */
    rent: {
        /** Net present value of the rent over the lease. */
        npv: number;
        tax: number;
        bands: StampDutyBand[];
        formatted: { npv: string; tax: string };
    };
    termYears: number;
    /** Premium tax plus rent tax. */
    stampDuty: number;
    /** What was actually charged, after the lease rules below were applied. */
    applied: {
        propertyType: PropertyType;
        /** The buyer type used for the premium. */
        buyer: BuyerType;
        additionalPropertySurcharge: boolean;
        firstTimeBuyerRelief: boolean;
        nonUkResidentSurcharge: boolean;
    };
    /** Plain-English reasons where a relief or surcharge that was asked for was not applied. */
    notes: string[];
    formatted: { stampDuty: string; premiumTax: string; rentTax: string };
}

const withSurcharge = (bands: Band[], points: number): Band[] =>
    bands.map((band) => ({ ...band, rate: band.rate + points }));

/**
 * Stamp duty on a new lease: tax on the premium plus tax on the rent.
 *
 * Lease rules applied for you:
 * - the additional-property surcharge never applies to rent, and not at all to a lease of 7 years or fewer
 * - the non-UK resident surcharge adds 2 points to the rent bands too, but not for a lease of 7 years
 *   or fewer, and only when the premium is £40,000 or more or the rent £1,000 a year or more
 * - first-time buyer relief needs a lease of 21 years or more, and does not reduce the tax on rent
 * - two to five dwellings in one lease of more than 7 years, for a premium of £40,000 or more, are
 *   charged as an additional property whoever the buyer is, and first-time buyer relief is lost
 *
 * Throws a `RangeError` on invalid input.
 */
export function calculateLeaseStampDuty(input: LeaseStampDutyInput): LeaseStampDuty {
    assertInput(input, 'lease input');
    const premium = checkAmount(input.premium, 'lease premium');
    const { rent, termYears } = input;
    const options = resolvePurchaseOptions(input);
    const { buyer, nonUkResident, dwellings } = options;
    const propertyType: PropertyType = isSixOrMoreDwellings(dwellings) ? 'non-residential' : options.propertyType;
    const npv = calculateRentNpv({ rent, termYears });
    const topRent = highestRent(rent);
    const notes: string[] = [];

    let premiumBands: Band[];
    let rentBands: Band[];
    let appliedBuyer: BuyerType = buyer;
    let surcharge = false;

    if (propertyType === 'non-residential') {
        premiumBands = NON_RESIDENTIAL_BANDS;
        rentBands = NON_RESIDENTIAL_RENT_BANDS;
        appliedBuyer = DEFAULT_BUYER_TYPE;
        if (buyer !== DEFAULT_BUYER_TYPE || nonUkResident)
            notes.push('Non-residential rates apply, so buyer reliefs and surcharges are not used.');
    } else {
        const shortLease = termYears <= SHORT_LEASE_YEARS;

        if (buyer !== 'additional-property' && !shortLease && isMultipleDwellingPurchase(premium, dwellings)) {
            appliedBuyer = 'additional-property';
            notes.push(
                multipleDwellingsNote(
                    dwellings,
                    'the higher rates for additional dwellings are charged on the premium, and first-time buyer relief does not apply',
                ),
            );
        } else if (buyer === 'additional-property' && shortLease) {
            appliedBuyer = DEFAULT_BUYER_TYPE;
            notes.push(
                `The additional-property surcharge does not apply to a lease of ${SHORT_LEASE_YEARS} years or fewer.`,
            );
        }
        if (appliedBuyer === 'first-time-buyer' && termYears < FIRST_TIME_BUYER_MIN_LEASE_YEARS) {
            appliedBuyer = DEFAULT_BUYER_TYPE;
            notes.push(`First-time buyer relief needs a lease of at least ${FIRST_TIME_BUYER_MIN_LEASE_YEARS} years.`);
        }

        if (nonUkResident) {
            if (shortLease)
                notes.push(
                    `The non-UK resident surcharge does not apply to a lease of ${SHORT_LEASE_YEARS} years or fewer.`,
                );
            else if (premium < SURCHARGE_MIN_PREMIUM && topRent < SURCHARGE_MIN_ANNUAL_RENT)
                notes.push(
                    `The non-UK resident surcharge does not apply: the premium is under ${formatPounds(SURCHARGE_MIN_PREMIUM)} and the rent under ${formatPounds(SURCHARGE_MIN_ANNUAL_RENT)} a year.`,
                );
            else surcharge = true;
        }

        if (surcharge && premium < SURCHARGE_MIN_PREMIUM) {
            // The rent brings the surcharge in, so the usual "nothing under £40,000" table is skipped.
            premiumBands =
                appliedBuyer === 'first-time-buyer'
                    ? BAND_TABLES.firstTimeBuyerNonUkResident.baseBands
                    : BAND_TABLES.nonUkResident.baseBands;
        } else {
            // Open question: the higher rates are tested here against the premium alone. Schedule 4ZA
            // paragraph 3(2) tests "the chargeable consideration", which for a lease may include the
            // rent; unlike Schedule 9A (the non-UK surcharge, above) it sets no separate rent test.
            // No HMRC guidance settling it was found, so a premium under £40,000 pays no higher rates.
            premiumBands = residentialBands(premium, toBandOptions({ buyer: appliedBuyer, nonUkResident: surcharge }));
        }
        rentBands = surcharge ? withSurcharge(RESIDENTIAL_RENT_BANDS, 2) : RESIDENTIAL_RENT_BANDS;
    }

    const premiumEstimate = buildEstimate(premium, premiumBands, {
        buyer: appliedBuyer,
        nonUkResident: surcharge,
        propertyType,
    });
    const rentTotal = toEstimateBands(npv, rentBands);
    const stampDuty = premiumEstimate.stampDuty + rentTotal.tax;

    return {
        premium: premiumEstimate,
        rent: {
            npv,
            tax: rentTotal.tax,
            bands: rentTotal.bands,
            formatted: { npv: formatPounds(npv), tax: formatPounds(rentTotal.tax) },
        },
        termYears,
        stampDuty,
        applied: {
            propertyType,
            buyer: appliedBuyer,
            additionalPropertySurcharge:
                propertyType === 'residential' &&
                appliedBuyer === 'additional-property' &&
                premium >= SURCHARGE_MIN_PREMIUM,
            firstTimeBuyerRelief:
                propertyType === 'residential' &&
                appliedBuyer === 'first-time-buyer' &&
                premium <= FIRST_TIME_BUYER_MAX_PRICE,
            nonUkResidentSurcharge: surcharge,
        },
        notes,
        formatted: {
            stampDuty: formatPounds(stampDuty),
            premiumTax: premiumEstimate.formatted.stampDuty,
            rentTax: formatPounds(rentTotal.tax),
        },
    };
}
