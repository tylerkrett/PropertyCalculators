import { type BuyerType, type StampDutyInput, calculateStampDuty } from './estimate';
import { formatPounds } from './format';

/*
 * Replacing a main residence. Someone who owns another property normally pays the higher rates,
 * unless the purchase replaces their main home and the old one is already sold. If the old home is
 * sold later, within three years, the extra tax can be claimed back.
 *
 * Source: GOV.UK "Higher rates of Stamp Duty Land Tax" (buying an additional residential property).
 */

/** Years after the purchase within which the previous main home must be sold to get a refund. */
export const HIGHER_RATES_REFUND_WINDOW_YEARS = 3;

/** Months to claim the refund, counted from the later of the sale and the return's filing date. */
export const HIGHER_RATES_REFUND_CLAIM_MONTHS = 12;

/** Days after completion by which the SDLT return must be filed. */
export const SDLT_FILING_DAYS = 14;

/** The questions to ask, in order. A later question only matters when the earlier answers are "yes". */
export const BUYER_QUESTIONS = [
    { key: 'firstTimeBuyer', label: 'Is everyone buying a first-time buyer?' },
    { key: 'ownsOtherProperty', label: 'Will you own more than one residential property after this purchase?' },
    { key: 'replacingMainResidence', label: 'Is this purchase replacing your main residence?' },
    { key: 'previousHomeSold', label: 'Has your previous main residence already been sold?' },
] as const;

export interface BuyerAnswers {
    /** Nobody buying has ever owned a home. */
    firstTimeBuyer?: boolean;
    /** After completion the buyer (or their spouse) will own another residential property worth £40,000 or more. */
    ownsOtherProperty?: boolean;
    /** The property will be the buyer's main home, replacing a previous one. */
    replacingMainResidence?: boolean;
    /** The previous main home was sold on or before the day of completion. */
    previousHomeSold?: boolean;
}

export type BuyerReason =
    | 'first-time-buyer'
    | 'only-property'
    | 'replacing-main-residence'
    | 'previous-home-not-sold'
    | 'additional-property';

export interface BuyerResolution {
    /** The buyer type to pass to `calculateStampDuty`. */
    buyer: BuyerType;
    higherRatesApply: boolean;
    /** The higher rates are due now but can be claimed back if the previous home sells in time. */
    refundPossible: boolean;
    reason: BuyerReason;
    /** One sentence explaining the outcome. */
    explanation: string;
}

const EXPLANATIONS: Record<BuyerReason, string> = {
    'first-time-buyer': 'First-time buyer relief applies.',
    'only-property': 'This will be your only residential property, so standard rates apply.',
    'replacing-main-residence':
        'You are replacing your main residence and the previous one is sold, so standard rates apply.',
    'previous-home-not-sold':
        'Your previous main residence is not sold yet, so the higher rates apply. You can claim the extra back if it is sold within 3 years.',
    'additional-property': 'You will own more than one residential property, so the higher rates apply.',
};

/** Works out which rates a buyer pays from yes/no answers. */
export function resolveBuyer(answers: BuyerAnswers): BuyerResolution {
    const { firstTimeBuyer, ownsOtherProperty, replacingMainResidence, previousHomeSold } = answers;

    let reason: BuyerReason;
    if (!ownsOtherProperty) reason = firstTimeBuyer ? 'first-time-buyer' : 'only-property';
    else if (!replacingMainResidence) reason = 'additional-property';
    else reason = previousHomeSold ? 'replacing-main-residence' : 'previous-home-not-sold';

    const higherRatesApply = reason === 'additional-property' || reason === 'previous-home-not-sold';
    return {
        buyer: higherRatesApply
            ? 'additional-property'
            : reason === 'first-time-buyer'
              ? 'first-time-buyer'
              : 'home-mover',
        higherRatesApply,
        refundPossible: reason === 'previous-home-not-sold',
        reason,
        explanation: EXPLANATIONS[reason],
    };
}

export interface HigherRatesRefund {
    /** Stamp duty paid at the higher rates. */
    paid: number;
    /** What would have been due at standard rates. */
    standard: number;
    /** The difference: the amount that can be claimed back. */
    refund: number;
    formatted: { paid: string; standard: string; refund: string };
}

/**
 * The refund due when the previous main home is sold after the purchase: the higher-rates bill
 * less the standard-rates bill for the same price.
 */
export function getHigherRatesRefund(input: Pick<StampDutyInput, 'price' | 'nonUkResident'>): HigherRatesRefund {
    const { price, nonUkResident = false } = input;
    const paid = calculateStampDuty({ price, nonUkResident, buyer: 'additional-property' }).stampDuty;
    const standard = calculateStampDuty({ price, nonUkResident, buyer: 'home-mover' }).stampDuty;
    const refund = paid - standard;

    return {
        paid,
        standard,
        refund,
        formatted: { paid: formatPounds(paid), standard: formatPounds(standard), refund: formatPounds(refund) },
    };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, name: string): Date {
    const date = ISO_DATE.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(Number.NaN);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        throw new RangeError(`Invalid ${name}: ${String(value)} (expected YYYY-MM-DD)`);
    return date;
}

const toIso = (date: Date) => date.toISOString().slice(0, 10);

function shift(date: Date, { years = 0, months = 0, days = 0 }) {
    const day = date.getUTCDate();
    const shifted = new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth() + months, 1));
    // Clamp to the month's last day: 29 February plus three years is 28 February.
    const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
    shifted.setUTCDate(Math.min(day, lastDay) + days);
    return shifted;
}

export interface RefundDeadlines {
    /** The previous main home must be sold on or before this date. */
    sellBy: string;
    /** The date the SDLT return for the new home is due. */
    filingDate: string;
    /** The refund must be claimed by this date. `null` until `saleDate` is given. */
    claimBy: string | null;
    /** Whether `saleDate` falls inside the window. `null` until `saleDate` is given. */
    soldInTime: boolean | null;
}

/**
 * The dates that matter for a higher-rates refund. Dates are `YYYY-MM-DD` strings.
 * `purchaseDate` is the completion date of the new home; `saleDate` is when the previous home sold.
 */
export function getRefundDeadlines({
    purchaseDate,
    saleDate,
}: {
    purchaseDate: string;
    saleDate?: string;
}): RefundDeadlines {
    const purchase = parseDate(purchaseDate, 'purchase date');
    const sellBy = shift(purchase, { years: HIGHER_RATES_REFUND_WINDOW_YEARS });
    const filing = shift(purchase, { days: SDLT_FILING_DAYS });

    if (saleDate === undefined)
        return { sellBy: toIso(sellBy), filingDate: toIso(filing), claimBy: null, soldInTime: null };

    const sale = parseDate(saleDate, 'sale date');
    const later = sale.getTime() > filing.getTime() ? sale : filing;
    return {
        sellBy: toIso(sellBy),
        filingDate: toIso(filing),
        claimBy: toIso(shift(later, { months: HIGHER_RATES_REFUND_CLAIM_MONTHS })),
        soldInTime: sale.getTime() <= sellBy.getTime(),
    };
}
