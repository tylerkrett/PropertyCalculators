import { MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds } from '../stamp-duty/format';
import { capitalGainsNotes } from './notes';
import {
    CAPITAL_GAINS_RATES,
    type CapitalGainsTaxYear,
    capitalGainsReportBy,
    completionDateError,
    isCapitalGainsTaxYear,
} from './rates';

/*
 * Capital gains tax when a UK-resident individual sells a residential property that private
 * residence relief does not fully cover: a let property or a second home.
 *
 * The method is the one on https://www.gov.uk/capital-gains-tax/rates:
 *  1. the gain is the sale price less what the property cost: its purchase price, the costs of
 *     buying and selling it, and improvements (not repairs or mortgage interest);
 *  2. the annual exempt amount still unused this year comes off the gain;
 *  3. taxable income is income less the personal allowance. A personal allowance the income does
 *     not use up cannot be set against a gain;
 *  4. the taxable gain sits on top of the taxable income: the part that fits in what is left of
 *     the basic-rate band is taxed at the lower rate, the rest at the higher rate.
 * The figures for each tax year, and their sources, are in ./rates. A guide only, not tax advice.
 */

export const CAPITAL_GAINS_DEFAULTS = {
    /** The tax year in which this version was released. The year a sale falls in is set by the date contracts are exchanged. */
    taxYear: '2026-27',
    cost: 0,
    income: 0,
    allowanceUsed: 0,
    share: 100,
} as const satisfies Record<string, number | CapitalGainsTaxYear>;

/** Bounds the form accepts. */
export const CAPITAL_GAINS_LIMITS = {
    salePrice: { min: 1, max: MAX_PRICE },
    amount: { min: 0, max: MAX_PRICE },
    /** Percent of the property owned: more than 0, up to 100. */
    share: { min: 0, max: 100 },
} as const;

export interface CapitalGainsInput {
    /** What the whole property sold for, in pounds. */
    salePrice: number;
    /** What the whole property was bought for, in pounds (its market value then, if inherited or given). */
    purchasePrice: number;
    /** Costs of buying: stamp duty, legal fees, survey. Defaults to 0. */
    buyingCosts?: number;
    /** Costs of selling: agent and legal fees. Defaults to 0. */
    sellingCosts?: number;
    /** Money spent improving the property, such as an extension. Not repairs. Defaults to 0. */
    improvements?: number;
    /** Total income for the year before allowances, in pounds. Defaults to 0. */
    income?: number;
    /** How much of the annual exempt amount other gains have already used this year. Defaults to 0. */
    allowanceUsed?: number;
    /** Percent of the property you own; the gain is scaled to it. Defaults to 100. */
    share?: number;
    /** The completion date as `YYYY-MM-DD`, to get the last day to report and pay. */
    completionDate?: string;
    /** The tax year the sale falls in. Defaults to `"2026-27"`. */
    taxYear?: CapitalGainsTaxYear;
}

export interface CapitalGains {
    taxYear: CapitalGainsTaxYear;
    /** Your share of the sale price less every cost. Negative for a loss. */
    gain: number;
    /** Whether the sale made a loss: no tax, and the loss can be carried forward. */
    loss: boolean;
    /** The annual exempt amount set against this gain. */
    allowance: number;
    /** The gain less the allowance. */
    taxableGain: number;
    /** The basic-rate band left after income, which the gain fills first. */
    basicRateBandLeft: number;
    /** The lower rate, in percent, and the part of the taxable gain it applies to, with the tax on it. */
    lowerRate: number;
    lowerRateAmount: number;
    lowerRateTax: number;
    /** The higher rate, in percent, and the part of the taxable gain it applies to, with the tax on it. */
    higherRate: number;
    higherRateAmount: number;
    higherRateTax: number;
    /** Capital gains tax to pay. */
    tax: number;
    /** The tax as a percentage of the gain, to two decimals; 0 when there is no gain. */
    effectiveRate: number;
    /** The gain less the tax. */
    gainAfterTax: number;
    /** The last day to report and pay, as `YYYY-MM-DD`. Only when `completionDate` was given. */
    reportBy?: string;
    /** What the figures assume and leave out, in plain English. */
    notes: string[];
}

const pence = (value: number) => Math.round(value * 100) / 100;
/** Whether a value is a number of pounds (or percent) from 0 to `max`. */
const isAmount = (value: unknown, max: number = CAPITAL_GAINS_LIMITS.amount.max): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

/** The optional amounts, with the words the form error uses for each. */
const OPTIONAL_AMOUNTS = [
    ['buyingCosts', 'costs of buying'],
    ['sellingCosts', 'costs of selling'],
    ['improvements', 'cost of improvements'],
    ['income', 'income'],
] as const;

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function capitalGainsInputError(input: CapitalGainsInput): string | null {
    // Checked as `unknown`: a form or plain JavaScript can pass anything here. Only leaving a value out means the default.
    if (typeof input !== 'object' || input === null) return 'Enter the sale price.';
    const { salePrice, purchasePrice, share, taxYear, completionDate, allowanceUsed } = input as unknown as Record<
        string,
        unknown
    >;
    if (!isAmount(salePrice, Infinity) || salePrice < CAPITAL_GAINS_LIMITS.salePrice.min)
        return 'Enter the sale price.';
    if (!isAmount(purchasePrice, Infinity)) return 'Enter the purchase price.';
    if (salePrice > MAX_PRICE || purchasePrice > MAX_PRICE) return 'Enter a lower price.';
    for (const [key, words] of OPTIONAL_AMOUNTS) {
        if (input[key] !== undefined && !isAmount(input[key])) return `Enter the ${words}, or leave it at 0.`;
    }
    if (taxYear !== undefined && !isCapitalGainsTaxYear(taxYear)) return 'Choose the tax year.';
    const { annualExemptAmount } = CAPITAL_GAINS_RATES[input.taxYear ?? CAPITAL_GAINS_DEFAULTS.taxYear];
    if (allowanceUsed !== undefined && !isAmount(allowanceUsed, annualExemptAmount))
        return `Enter the tax-free allowance already used, from £0 to ${formatPounds(annualExemptAmount)}.`;
    if (share !== undefined && (!isAmount(share, CAPITAL_GAINS_LIMITS.share.max) || share === 0))
        return 'Enter the share you own, above 0% and up to 100%.';
    return completionDate === undefined ? null : completionDateError(completionDate);
}

/** The maths alone; `null` for invalid input. Amounts are kept to the penny. */
export function calculateCapitalGains(input: CapitalGainsInput): CapitalGains | null {
    return capitalGainsInputError(input) ? null : workOutTax(input);
}

/** The tax for an input `capitalGainsInputError` has already passed. */
export function workOutTax(input: CapitalGainsInput): CapitalGains {
    const taxYear = input.taxYear ?? CAPITAL_GAINS_DEFAULTS.taxYear;
    const rates = CAPITAL_GAINS_RATES[taxYear];
    const share = input.share ?? CAPITAL_GAINS_DEFAULTS.share;
    const income = input.income ?? CAPITAL_GAINS_DEFAULTS.income;
    const costs =
        input.purchasePrice +
        (input.buyingCosts ?? CAPITAL_GAINS_DEFAULTS.cost) +
        (input.sellingCosts ?? CAPITAL_GAINS_DEFAULTS.cost) +
        (input.improvements ?? CAPITAL_GAINS_DEFAULTS.cost);
    const gain = pence(((input.salePrice - costs) * share) / 100);

    // Only a gain uses the allowance, and only what other gains this year have left of it.
    const allowanceLeft = rates.annualExemptAmount - (input.allowanceUsed ?? CAPITAL_GAINS_DEFAULTS.allowanceUsed);
    const allowance = Math.min(Math.max(gain, 0), allowanceLeft);
    const taxableGain = pence(Math.max(gain, 0) - allowance);

    // The personal allowance falls by £1 for every £2 of income over £100,000, to nothing at £125,140.
    const taper = Math.max(income - rates.allowanceTaperThreshold, 0) / 2;
    const taxableIncome = Math.max(income - Math.max(rates.personalAllowance - taper, 0), 0);
    const basicRateBandLeft = pence(Math.max(rates.basicRateBand - taxableIncome, 0));

    const lowerRateAmount = Math.min(taxableGain, basicRateBandLeft);
    const higherRateAmount = pence(taxableGain - lowerRateAmount);
    const lowerRateTax = pence((lowerRateAmount * rates.lowerRate) / 100);
    const higherRateTax = pence((higherRateAmount * rates.higherRate) / 100);
    const tax = pence(lowerRateTax + higherRateTax);
    const reportBy = input.completionDate === undefined ? null : capitalGainsReportBy(input.completionDate);

    const result = {
        taxYear,
        gain,
        loss: gain < 0,
        allowance,
        taxableGain,
        basicRateBandLeft,
        lowerRate: rates.lowerRate,
        lowerRateAmount,
        lowerRateTax,
        higherRate: rates.higherRate,
        higherRateAmount,
        higherRateTax,
        tax,
        effectiveRate: gain > 0 ? Math.round((tax / gain) * 10_000) / 100 : 0,
        gainAfterTax: pence(gain - tax),
        ...(reportBy ? { reportBy } : {}),
    };
    return { ...result, notes: capitalGainsNotes(result, share) };
}
