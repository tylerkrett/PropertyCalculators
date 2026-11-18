import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { MAX_PRICE } from '../stamp-duty/estimate';
import { formatNumber, formatPounds, formatPoundsAndPence, formatRate } from '../stamp-duty/format';

/*
 * Buy-to-let mortgage check. Lenders size a buy-to-let loan by rental cover, not salary: the
 * interest coverage ratio (ICR) is the monthly rent divided by the monthly interest on the loan
 * at a stress rate, and it has to reach a required ratio. A £240,000 loan stressed at 5.5% costs
 * £1,100 a month in interest, so at 125% cover the rent must be at least £1,375 a month.
 *
 * An illustration, not a lender's decision. The figures are lender conventions, not law, so every
 * one is an input with a typical default:
 *  - Stress rate 5.5%. The PRA's supervisory statement SS13/16, "Underwriting standards for
 *    buy-to-let mortgage contracts" (September 2016), paragraph 2.14, expects firms to assume a
 *    borrower rate of at least 5.5% over the first five years. Paragraph 2.12 exempts loans fixed
 *    for five years or more, which lenders often stress at a lower rate; many stress higher.
 *    https://www.bankofengland.co.uk/prudential-regulation/publication/2016/underwriting-standards-for-buy-to-let-mortgage-contracts-ss
 *  - Cover of 125%. SS13/16 sets no threshold: paragraph 2.7 only records 125% as the industry
 *    standard of the time. Paragraph 2.6 expects lenders to allow for the landlord's tax, which
 *    is why the market asks about 145% of higher-rate taxpayers and 125% of basic-rate taxpayers
 *    and limited companies. Those ratios are market practice and vary by lender.
 */

/** The lowest stress rate SS13/16 (paragraph 2.14) expects unless the rate is fixed for five years or more. */
export const PRA_MINIMUM_STRESS_RATE = 5.5;

/** Who is borrowing, with the cover a typical lender asks of them. Conventions, not rules. */
export const BORROWER_TYPES = [
    { value: 'basic-rate', label: 'Basic-rate taxpayer', coverRatio: 125 },
    { value: 'higher-rate', label: 'Higher or additional-rate taxpayer', coverRatio: 145 },
    { value: 'limited-company', label: 'Limited company', coverRatio: 125 },
] as const;

export type BorrowerType = (typeof BORROWER_TYPES)[number]['value'];

/** Bounds the form accepts. A 0% stress rate would mean no interest to cover, so the floor is 1%. */
export const BUY_TO_LET_LIMITS = {
    stressRate: { min: 1, max: 25 },
    coverRatio: { min: 100, max: 300 },
} as const;

/** What the check assumes until told otherwise. */
export const BUY_TO_LET_DEFAULTS = {
    rentPeriod: 'month',
    stressRate: PRA_MINIMUM_STRESS_RATE,
    borrower: 'basic-rate',
} as const satisfies { rentPeriod: RentPeriod; stressRate: number; borrower: BorrowerType };

export interface BuyToLetInput {
    /** The rent, in pounds per `rentPeriod`. */
    rent: number;
    /** Defaults to `"month"`. */
    rentPeriod?: RentPeriod;
    /** Loan amount in pounds. Leave it out to borrow `price` less `deposit`. */
    loan?: number;
    /** Property price in pounds. Needed without `loan`; with it, only adds the loan to value. */
    price?: number;
    /** Deposit in pounds. Only used when `loan` is left out. */
    deposit?: number;
    /** Annual interest rate the lender tests the rent against, percent. Defaults to 5.5. */
    stressRate?: number;
    /** Sets the required cover: 125% or 145%. Defaults to `"basic-rate"`. */
    borrower?: BorrowerType;
    /** Required cover in percent, e.g. 140. Overrides the ratio for `borrower`. */
    coverRatio?: number;
}

export interface BuyToLet {
    /** The rent as pounds a month. */
    monthlyRent: number;
    loan: number;
    stressRate: number;
    /** The cover the lender requires, percent. */
    requiredCoverRatio: number;
    /** A month's interest on the loan at the stress rate. */
    stressedInterest: number;
    /**
     * Interest coverage ratio achieved: monthly rent over stressed interest, percent, rounded down to
     * two decimals and kept on the same side of the required ratio as `passes`.
     */
    coverRatio: number;
    /** Whether the rent covers the stressed interest by at least the required ratio. */
    passes: boolean;
    /** The largest loan this rent supports, rounded down to the pound. */
    maxLoan: number;
    /** The lowest monthly rent this loan needs, rounded up to the penny. */
    minRent: number;
    /** Monthly rent above the minimum; negative, by at least a penny, is a shortfall. Agrees with `passes`. */
    monthlyHeadroom: number;
    /** Loan to value, percent to two decimals; `null` without a price. */
    ltv: number | null;
}

const twoDecimals = (value: number) => Math.round(value * 100) / 100;
// Forgives the last-digit noise of floating point, so rent exactly at the required ratio passes.
const EPSILON = 1e-7;
const outside = (value: number, { min, max }: { min: number; max: number }) =>
    !Number.isFinite(value) || value < min || value > max;

/** The settings with their defaults filled in; `null` parts are for the error check to explain. */
function resolve(input: BuyToLetInput) {
    const borrower = BORROWER_TYPES.find((type) => type.value === (input.borrower ?? BUY_TO_LET_DEFAULTS.borrower));
    const period = RENT_PERIODS.find((option) => option.value === (input.rentPeriod ?? BUY_TO_LET_DEFAULTS.rentPeriod));
    const loan = input.loan ?? (input.price ?? NaN) - (input.deposit ?? NaN);
    return {
        loan,
        monthlyRent: period ? (input.rent * period.perYear) / 12 : NaN,
        stressRate: input.stressRate ?? BUY_TO_LET_DEFAULTS.stressRate,
        requiredCoverRatio: input.coverRatio ?? borrower?.coverRatio ?? NaN,
        borrower,
        period,
    };
}

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function buyToLetInputError(input: BuyToLetInput): string | null {
    const { rent, price, deposit } = input;
    const { stressRate: rates, coverRatio: ratios } = BUY_TO_LET_LIMITS;
    const { loan, stressRate, requiredCoverRatio, borrower, period } = resolve(input);
    if (!Number.isFinite(rent) || rent <= 0 || !period) return 'Enter the rent.';
    if (rent > MAX_PRICE) return 'Enter a lower rent.';
    if (price !== undefined && (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE))
        return 'Enter the property price.';
    if (input.loan === undefined) {
        if (price === undefined) return 'Enter the loan amount, or the property price and deposit.';
        if (deposit === undefined || !Number.isFinite(deposit) || deposit < 0) return 'Enter a deposit of £0 or more.';
        if (deposit >= price) return 'The deposit covers the whole price, so there is nothing to borrow.';
    } else {
        if (!Number.isFinite(loan) || loan <= 0 || loan > MAX_PRICE) return 'Enter the loan amount.';
        if (price !== undefined && loan > price) return 'The loan is more than the property price.';
    }
    if (outside(stressRate, rates)) return `Enter a stress rate between ${rates.min}% and ${rates.max}%.`;
    if (input.coverRatio === undefined && !borrower) return 'Choose the type of borrower.';
    if (outside(requiredCoverRatio, ratios)) return `Enter a required cover between ${ratios.min}% and ${ratios.max}%.`;
    return null;
}

/**
 * The maths alone; `null` for invalid input. Stressed interest is loan × stress rate ÷ 12, the
 * cover achieved is monthly rent ÷ stressed interest, and it passes at or above the required ratio.
 */
export function calculateBuyToLet(input: BuyToLetInput): BuyToLet | null {
    return buyToLetInputError(input) ? null : checkCover(input);
}

/** The check for an input `buyToLetInputError` has already passed. */
function checkCover(input: BuyToLetInput): BuyToLet {
    const { loan, monthlyRent, stressRate, requiredCoverRatio } = resolve(input);
    const interest = (loan * stressRate) / 100 / 12;
    // Unrounded, so the pass, the maximum loan and the minimum rent always agree with each other.
    const rentNeeded = (interest * requiredCoverRatio) / 100;
    const loanSupported = (monthlyRent * 12 * 10_000) / (stressRate * requiredCoverRatio);
    const minRent = Math.ceil(rentNeeded * 100 - EPSILON) / 100;
    const passes = monthlyRent >= rentNeeded - EPSILON;
    // The verdict is decided on unrounded figures, and the rounded ones shown beside it must agree: a
    // pass never shows a shortfall or too little cover; a fail is at least 1p and 0.01 points short.
    const gap = twoDecimals(twoDecimals(monthlyRent) - minRent);
    const cover = Math.floor((monthlyRent / interest) * 10_000 + EPSILON) / 100;

    return {
        monthlyRent: twoDecimals(monthlyRent),
        loan,
        stressRate,
        requiredCoverRatio,
        stressedInterest: twoDecimals(interest),
        coverRatio: passes
            ? Math.max(requiredCoverRatio, cover)
            : Math.min(twoDecimals(requiredCoverRatio - 0.01), cover),
        passes,
        maxLoan: Math.floor(loanSupported + EPSILON),
        minRent,
        monthlyHeadroom: passes ? Math.max(0, gap) : Math.min(-0.01, gap),
        ltv: input.price === undefined ? null : twoDecimals((loan / input.price) * 100),
    };
}

/** Row labels, in display order. */
export const BUY_TO_LET_LABELS = {
    coverRatio: 'Interest cover ratio',
    requiredCoverRatio: 'Cover required',
    monthlyRent: 'Rent per month',
    stressedInterest: 'Monthly interest at the stress rate',
    stressRate: 'Stress rate',
    loan: 'Loan amount',
    maxLoan: 'Maximum loan the rent supports',
    minRent: 'Minimum rent per month for the loan',
    monthlyHeadroom: 'Rent headroom per month',
    ltv: 'Loan to value',
} as const;

/** The label for `monthlyHeadroom` when the check fails; the row then shows the gap as a positive amount. */
export const BUY_TO_LET_SHORTFALL_LABEL = 'Rent shortfall per month';

type BuyToLetKey = keyof typeof BUY_TO_LET_LABELS;

export interface BuyToLetSummary extends BuyToLet {
    /** `"Passes"` or `"Falls short"`. */
    verdict: string;
    /** `ltv` is `null` without a price; a shortfall reads `-£50.00`. */
    formatted: Record<Exclude<BuyToLetKey, 'ltv'>, string> & { ltv: string | null };
    /** The same figures as labelled rows, in display order. Loan to value is left out without a price. */
    rows: { key: BuyToLetKey; label: string; value: number; formatted: string }[];
}

const PERCENT_KEYS: readonly BuyToLetKey[] = ['coverRatio', 'requiredCoverRatio', 'stressRate', 'ltv'];
const POUND_KEYS: readonly BuyToLetKey[] = ['loan', 'maxLoan'];

/**
 * A buy-to-let check with every figure and its display string. Either the summary or the reason
 * the input can't be calculated, never both.
 */
export function getBuyToLetSummary(
    input: BuyToLetInput,
): { summary: BuyToLetSummary; error: null } | { summary: null; error: string } {
    const error = buyToLetInputError(input);
    if (error) return { summary: null, error };
    const result = checkCover(input);

    const keys = Object.keys(BUY_TO_LET_LABELS) as BuyToLetKey[];
    const format = (key: BuyToLetKey, value: number) =>
        PERCENT_KEYS.includes(key)
            ? formatRate(value)
            : POUND_KEYS.includes(key)
              ? formatPounds(value)
              : value < 0
                ? `-£${formatNumber(-value, 2)}`
                : formatPoundsAndPence(value);
    const text = (key: BuyToLetKey) => {
        const value = result[key];
        return value === null ? null : format(key, value);
    };
    const formatted = Object.fromEntries(keys.map((key) => [key, text(key)])) as BuyToLetSummary['formatted'];
    const short = !result.passes;

    return {
        summary: {
            ...result,
            verdict: result.passes ? 'Passes' : 'Falls short',
            formatted,
            rows: keys.flatMap((key): BuyToLetSummary['rows'] => {
                const value = result[key];
                if (value === null) return [];
                if (key === 'monthlyHeadroom' && short)
                    return [{ key, label: BUY_TO_LET_SHORTFALL_LABEL, value: -value, formatted: format(key, -value) }];
                return [{ key, label: BUY_TO_LET_LABELS[key], value, formatted: format(key, value) }];
            }),
        },
        error: null,
    };
}
