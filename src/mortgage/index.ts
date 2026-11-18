import { calculateStampDuty, isBuyerType, MAX_PRICE, type BuyerType } from '../stamp-duty/estimate';
import { formatPounds, formatPoundsAndPence, formatRate } from '../stamp-duty/format';

/*
 * Mortgage maths: a standard monthly-compounding loan. An illustration only: lenders add fees,
 * stress tests and product-specific terms.
 */

export type RepaymentType = 'repayment' | 'interest-only';

export const REPAYMENT_TYPES = [
    { value: 'repayment', label: 'Repayment' },
    { value: 'interest-only', label: 'Interest only' },
] as const satisfies readonly { value: RepaymentType; label: string }[];

/** Bounds the form accepts: wide enough for any real mortgage, tight enough to keep maths sane. */
export const MORTGAGE_LIMITS = {
    rate: { min: 0, max: 25 },
    term: { min: 1, max: 40 },
} as const;

export const MORTGAGE_DEFAULTS = {
    depositPercent: 25,
    rate: 4.5,
    term: 25,
    type: 'repayment',
} as const satisfies { depositPercent: number; rate: number; term: number; type: RepaymentType };

export interface MortgageInput {
    price: number;
    deposit: number;
    /** Annual interest rate in percent, e.g. 4.5. */
    rate: number;
    termYears: number;
    type: RepaymentType;
}

export interface MortgageResult {
    loan: number;
    /** Loan to value, percent. */
    ltv: number;
    monthlyPayment: number;
    totalInterest: number;
    /** Everything paid to the lender over the term, the loan included. */
    totalRepaid: number;
}

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function mortgageInputError({ price, deposit, rate, termYears }: MortgageInput): string | null {
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) return 'Enter the property price.';
    if (!Number.isFinite(deposit) || deposit < 0) return 'Enter a deposit of £0 or more.';
    if (deposit >= price) return 'The deposit covers the whole price, so there is nothing to borrow.';
    if (!Number.isFinite(rate) || rate < MORTGAGE_LIMITS.rate.min || rate > MORTGAGE_LIMITS.rate.max)
        return `Enter an interest rate between ${MORTGAGE_LIMITS.rate.min}% and ${MORTGAGE_LIMITS.rate.max}%.`;
    if (!Number.isInteger(termYears) || termYears < MORTGAGE_LIMITS.term.min || termYears > MORTGAGE_LIMITS.term.max)
        return `Enter a term of ${MORTGAGE_LIMITS.term.min} to ${MORTGAGE_LIMITS.term.max} whole years.`;
    return null;
}

const pence = (n: number) => Math.round(n * 100) / 100;

/**
 * Monthly payment and totals. Repayment uses the annuity formula P·r / (1 − (1 + r)^−n) with
 * r the monthly rate (a 0% rate is just P / n); interest only pays P·r monthly and the loan at
 * the end. Returns `null` for input `mortgageInputError` rejects.
 */
export function calculateMortgage(input: MortgageInput): MortgageResult | null {
    return mortgageInputError(input) ? null : mortgageFor(input);
}

/** The payment and totals for an input `mortgageInputError` has already passed; it is not checked again. */
export function mortgageFor(input: MortgageInput): MortgageResult {
    const { price, deposit, rate, termYears, type } = input;
    const loan = price - deposit;
    const months = termYears * 12;
    const r = rate / 100 / 12;
    let monthly: number;
    let totalRepaid: number;
    if (type === 'interest-only') {
        monthly = loan * r;
        totalRepaid = monthly * months + loan;
    } else {
        monthly = r === 0 ? loan / months : (loan * r) / (1 - (1 + r) ** -months);
        totalRepaid = monthly * months;
    }
    return {
        loan,
        ltv: (loan / price) * 100,
        monthlyPayment: pence(monthly),
        totalInterest: pence(totalRepaid - loan),
        totalRepaid: pence(totalRepaid),
    };
}

/** Deposit in pounds for a percentage of the price, to the nearest pound. */
export const depositFromPercent = (price: number, percent: number) => Math.round((price * percent) / 100);

/** Deposit as a percentage of the price, to two decimal places. */
export const depositPercentOf = (price: number, deposit: number) =>
    price > 0 ? Math.round((deposit / price) * 10_000) / 100 : 0;

export interface MortgageSummaryInput extends MortgageInput {
    /** Buyer type for the stamp duty in the upfront cash. Defaults to `"home-mover"`. */
    buyer?: BuyerType;
    nonUkResident?: boolean;
}

export interface MortgageSummary extends MortgageResult {
    deposit: number;
    stampDuty: number;
    /** Deposit plus stamp duty. Legal fees, surveys and lender fees are extra. */
    cashUpfront: number;
    formatted: Record<
        'loan' | 'ltv' | 'monthlyPayment' | 'totalInterest' | 'totalRepaid' | 'deposit' | 'stampDuty' | 'cashUpfront',
        string
    >;
    /** The same figures as labelled rows, in display order. */
    rows: { key: keyof MortgageSummary['formatted']; label: string; value: number; formatted: string }[];
}

const MORTGAGE_LABELS = {
    monthlyPayment: 'Monthly payment',
    loan: 'Loan amount',
    ltv: 'Loan to value',
    totalInterest: 'Total interest',
    totalRepaid: 'Total repaid',
    deposit: 'Deposit',
    stampDuty: 'Stamp duty',
    cashUpfront: 'Cash needed upfront',
} as const;

export { MORTGAGE_LABELS };

/**
 * A mortgage with stamp duty and the cash needed upfront, every figure with its display string.
 * Either the summary or the reason the input can't be calculated, never both.
 */
export function getMortgageSummary(
    input: MortgageSummaryInput,
): { summary: MortgageSummary; error: null } | { summary: null; error: string } {
    const error =
        mortgageInputError(input) ??
        (input.buyer !== undefined && !isBuyerType(input.buyer) ? 'Choose the type of buyer.' : null);
    if (error) return { summary: null, error };
    const result = mortgageFor(input);

    const stampDuty = calculateStampDuty({
        price: input.price,
        buyer: input.buyer,
        nonUkResident: input.nonUkResident,
    }).stampDuty;
    const values = { ...result, deposit: input.deposit, stampDuty, cashUpfront: input.deposit + stampDuty };
    const formatted = {
        monthlyPayment: formatPoundsAndPence(values.monthlyPayment),
        loan: formatPounds(values.loan),
        ltv: formatRate(values.ltv),
        totalInterest: formatPounds(values.totalInterest),
        totalRepaid: formatPounds(values.totalRepaid),
        deposit: formatPounds(values.deposit),
        stampDuty: formatPounds(values.stampDuty),
        cashUpfront: formatPounds(values.cashUpfront),
    };
    const keys = Object.keys(MORTGAGE_LABELS) as (keyof typeof MORTGAGE_LABELS)[];

    return {
        summary: {
            ...values,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: MORTGAGE_LABELS[key],
                value: values[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
