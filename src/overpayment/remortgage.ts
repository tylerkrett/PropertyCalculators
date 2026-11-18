import { MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds, formatPoundsAndPence } from '../stamp-duty/format';
import {
    formatDuration,
    LOAN_LIMITS,
    loanInputError,
    monthlyPaymentFor,
    pence,
    type RemainingTerm,
    toTermMonths,
} from './loan';

/*
 * Remortgage comparison: is it worth leaving the current deal for a new one? It compares the
 * monthly payment on each over the same remaining term, adds up the cost of switching (the new
 * deal's product fee plus any early repayment charge on the old one), and counts the months
 * until the interest saved has paid that cost back. An illustration only: it assumes both rates
 * hold for the whole comparison, so enter the rate you would really be paying if you stayed.
 */

export const FEE_PAYMENTS = [
    { value: 'upfront', label: 'Paid upfront' },
    { value: 'add-to-loan', label: 'Added to the loan' },
] as const;

export type FeePayment = (typeof FEE_PAYMENTS)[number]['value'];

export const REMORTGAGE_DEFAULTS = {
    productFee: 0,
    earlyRepaymentCharge: 0,
    feePayment: 'upfront',
    fixedYears: 2,
} as const satisfies { productFee: number; earlyRepaymentCharge: number; feePayment: FeePayment; fixedYears: number };

export const REMORTGAGE_LIMITS = { ...LOAN_LIMITS, fixedYears: { min: 1, max: 15 } } as const;

export interface RemortgageInput extends RemainingTerm {
    /** What is still owed, in pounds. */
    balance: number;
    /** Annual rate in percent you would pay by staying put. */
    currentRate: number;
    /** Annual rate in percent on the new deal. */
    newRate: number;
    /** The new deal's product fee in pounds. Defaults to 0. */
    productFee?: number;
    /** Charge for leaving the current deal early, in pounds, paid in cash. Defaults to 0. */
    earlyRepaymentCharge?: number;
    /** Whether the product fee is paid in cash or borrowed. Defaults to `"upfront"`. */
    feePayment?: FeePayment;
    /** Years the new rate is fixed for: the period compared. Defaults to 2. */
    fixedYears?: number;
}

export interface RemortgageComparison {
    currentMonthlyPayment: number;
    newMonthlyPayment: number;
    /** Current payment less new payment; negative when the new deal costs more a month. */
    monthlySaving: number;
    /** Product fee plus early repayment charge, however the fee is paid. */
    switchingCost: number;
    /** The balance, plus the product fee when it is added to the loan. */
    newLoan: number;
    /** Months compared: the fixed period, or the remaining term when that is shorter. */
    comparisonMonths: number;
    /** Interest on the current deal less interest on the new one, over the comparison period. */
    interestSaved: number;
    /** Interest saved less the switching cost: how much better off you are when the period ends. */
    netSaving: number;
    /**
     * Months until the interest saved has covered the switching cost; 0 when a cheaper deal costs
     * nothing to switch to; `null` when it never does within the remaining term.
     */
    breakEvenMonths: number | null;
}

const amount = (value: number | undefined) => value ?? 0;
const invalidFee = (value: number) => !Number.isFinite(value) || value < 0 || value > MAX_PRICE;

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function remortgageInputError(input: RemortgageInput): string | null {
    const loanError =
        loanInputError(input.balance, input.currentRate, input, 'a current interest rate') ??
        loanInputError(input.balance, input.newRate, input, 'a new interest rate');
    if (loanError) return loanError;
    if (invalidFee(amount(input.productFee))) return 'Enter the product fee, or leave it at 0.';
    if (invalidFee(amount(input.earlyRepaymentCharge))) return 'Enter the early repayment charge, or leave it at 0.';
    const { min, max } = REMORTGAGE_LIMITS.fixedYears;
    const fixedYears = input.fixedYears ?? REMORTGAGE_DEFAULTS.fixedYears;
    if (!Number.isInteger(fixedYears) || fixedYears < min || fixedYears > max)
        return `Enter a fixed period of ${min} to ${max} whole years.`;
    return null;
}

/** Interest charged in each month of a loan paid at its standard payment. */
function monthlyInterest(balance: number, rate: number, months: number): number[] {
    const r = rate / 100 / 12;
    const payment = monthlyPaymentFor(balance, rate, months);
    return Array.from({ length: months }, () => {
        const interest = balance * r;
        balance = Math.max(0, balance + interest - payment);
        return interest;
    });
}

/**
 * The maths alone; `null` for invalid input. Both deals run over the same remaining term. The
 * saving is measured in interest, not payments, so a fee added to the loan still counts in full
 * (along with the interest it attracts) and paying the balance down faster is not mistaken for a cost.
 */
export function calculateRemortgage(input: RemortgageInput): RemortgageComparison | null {
    if (remortgageInputError(input)) return null;
    const months = toTermMonths(input);
    const fee = amount(input.productFee);
    const switchingCost = fee + amount(input.earlyRepaymentCharge);
    const feeAdded = (input.feePayment ?? REMORTGAGE_DEFAULTS.feePayment) === 'add-to-loan';
    const newLoan = input.balance + (feeAdded ? fee : 0);
    const comparisonMonths = Math.min((input.fixedYears ?? REMORTGAGE_DEFAULTS.fixedYears) * 12, months);

    const currentInterest = monthlyInterest(input.balance, input.currentRate, months);
    const newInterest = monthlyInterest(newLoan, input.newRate, months);
    // Running total of interest saved, to the penny, after each month.
    let saved = 0;
    const savedAfter = currentInterest.map((interest, month) => pence((saved += interest - (newInterest[month] ?? 0))));
    const paidBack = savedAfter.findIndex((total) => total >= switchingCost);
    const interestSaved = savedAfter[comparisonMonths - 1] ?? 0;
    const currentMonthlyPayment = pence(monthlyPaymentFor(input.balance, input.currentRate, months));
    const newMonthlyPayment = pence(monthlyPaymentFor(newLoan, input.newRate, months));

    return {
        currentMonthlyPayment,
        newMonthlyPayment,
        monthlySaving: pence(currentMonthlyPayment - newMonthlyPayment),
        switchingCost,
        newLoan,
        comparisonMonths,
        interestSaved,
        netSaving: pence(interestSaved - switchingCost),
        breakEvenMonths: breakEven(input, switchingCost, paidBack),
    };
}

/** `paidBack` is the index of the first month whose running saving covers the cost, or -1. */
function breakEven(input: RemortgageInput, switchingCost: number, paidBack: number): number | null {
    if (input.newRate >= input.currentRate) return null;
    if (switchingCost === 0) return 0;
    return paidBack < 0 ? null : paidBack + 1;
}

export const REMORTGAGE_LABELS = {
    monthlySaving: 'Monthly saving',
    currentMonthlyPayment: 'Current monthly payment',
    newMonthlyPayment: 'New monthly payment',
    switchingCost: 'Cost of switching',
    breakEvenMonths: 'Time to break even',
    interestSaved: 'Interest saved over the fixed period',
    netSaving: 'Net saving over the fixed period',
    newLoan: 'New loan amount',
} as const;

type RemortgageKey = keyof typeof REMORTGAGE_LABELS;

export interface RemortgageSummary extends RemortgageComparison {
    formatted: Record<RemortgageKey, string>;
    /** The same figures as labelled rows, in display order. `value` is `null` when it never breaks even. */
    rows: { key: RemortgageKey; label: string; value: number | null; formatted: string }[];
}

/**
 * A remortgage comparison with every figure and its display string. Either the summary or the
 * reason the input can't be calculated, never both.
 */
export function getRemortgageSummary(
    input: RemortgageInput,
): { summary: RemortgageSummary; error: null } | { summary: null; error: string } {
    const error = remortgageInputError(input);
    const result = error ? null : calculateRemortgage(input);
    if (error || !result) return { summary: null, error: error ?? 'Enter the mortgage balance.' };

    // A loss is written "-£1,200", with the sign ahead of the pound.
    const signed = (value: number, format: (n: number) => string) => (value < 0 ? `-${format(-value)}` : format(value));
    const keys = Object.keys(REMORTGAGE_LABELS) as RemortgageKey[];
    const isPayment = (key: RemortgageKey) => key.toLowerCase().includes('monthly');
    const display = (key: RemortgageKey) => {
        if (key === 'breakEvenMonths')
            return result.breakEvenMonths === null ? 'Never' : formatDuration(result.breakEvenMonths);
        return signed(result[key], isPayment(key) ? formatPoundsAndPence : formatPounds);
    };
    const formatted = Object.fromEntries(keys.map((key) => [key, display(key)])) as Record<RemortgageKey, string>;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: REMORTGAGE_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
