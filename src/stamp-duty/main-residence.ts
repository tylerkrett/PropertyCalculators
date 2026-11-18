import { type BuyerType, type StampDutyInput, calculateStampDuty } from './estimate';
import { formatPounds } from './format';
import { assertInput } from './purchase';
import { HIGHER_RATES_REFUND_WINDOW_YEARS } from './refund-deadlines';

export * from './refund-deadlines';

/*
 * Replacing a main residence. Someone who owns another property normally pays the higher rates,
 * unless the purchase replaces their main home and the old one is already sold. If the old home is
 * sold later, within three years, the extra tax can be claimed back.
 *
 * Source: GOV.UK "Higher rates of Stamp Duty Land Tax" (buying an additional residential property).
 */

/**
 * The questions to ask, in order. The first two are always needed. The third only matters when the
 * second is "yes", and the fourth only when the third is "yes".
 */
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
    'previous-home-not-sold': `Your previous main residence is not sold yet, so the higher rates apply. You can claim the extra back if it is sold within ${HIGHER_RATES_REFUND_WINDOW_YEARS} years.`,
    'additional-property': 'You will own more than one residential property, so the higher rates apply.',
};

/** Works out which rates a buyer pays from yes/no answers. Throws a `RangeError` unless given an object. */
export function resolveBuyer(answers: BuyerAnswers): BuyerResolution {
    assertInput(answers, 'buyer answers');
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
    assertInput(input, 'refund input');
    const { price, nonUkResident } = input;
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
