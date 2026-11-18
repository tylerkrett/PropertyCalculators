import { MAX_PRICE } from '../stamp-duty/estimate';
import { LOAN_LIMITS, loanInputError, monthlyPaymentFor, pence, type RemainingTerm, toTermMonths } from './loan';

/*
 * Remortgage comparison: is it worth leaving the current deal for a new one? It compares the
 * monthly payment on each over the same remaining term, adds up the cost of switching (the new
 * deal's product fee plus any early repayment charge on the old one), and counts the months
 * until the interest saved has paid that cost back. The saving over the fixed period is shown as
 * the cash kept in payments and the lower balance owed at the end, which add up to the net saving.
 * An illustration only: it assumes both rates hold for the whole comparison, so enter the rate you
 * would really be paying if you stayed. The display strings are in `remortgage-summary.ts`.
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
    /**
     * Interest saved less the switching cost: how much better off you are when the period ends,
     * counting the lower balance owed. Always `paymentSaving + balanceDifference`.
     */
    netSaving: number;
    /**
     * The cash kept over the comparison period: the monthly saving times the months compared, less
     * the early repayment charge and the product fee (unless the fee is added to the loan).
     */
    paymentSaving: number;
    /**
     * How much less is owed on the new deal when the period ends; negative when more is owed. It is
     * the part of the net saving that is not cash in hand.
     */
    balanceDifference: number;
    /**
     * Months until the interest saved has covered the switching cost; 0 when a cheaper deal costs
     * nothing to switch to; `null` when it never does within the remaining term. It can fall after
     * the comparison period: see `breakEvenWithinPeriod`.
     */
    breakEvenMonths: number | null;
    /** Whether the cost is covered by the end of the comparison period; `false` when it never is. */
    breakEvenWithinPeriod: boolean;
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
    if (input.feePayment !== undefined && !FEE_PAYMENTS.some((option) => option.value === input.feePayment))
        return 'Choose how the product fee is paid.';
    const { min, max } = REMORTGAGE_LIMITS.fixedYears;
    const fixedYears = input.fixedYears ?? REMORTGAGE_DEFAULTS.fixedYears;
    if (!Number.isInteger(fixedYears) || fixedYears < min || fixedYears > max)
        return `Enter a fixed period of ${min} to ${max} whole years.`;
    return null;
}

/** A loan paid at its standard payment, as a function giving the interest charged in each month in turn. */
function interestByMonth(balance: number, rate: number, months: number): () => number {
    const r = rate / 100 / 12;
    const payment = monthlyPaymentFor(balance, rate, months);
    return () => {
        const interest = balance * r;
        balance = Math.max(0, balance + interest - payment);
        return interest;
    };
}

/**
 * The maths alone; `null` for invalid input. Both deals run over the same remaining term. The
 * saving is measured in interest, not payments, so a fee added to the loan still counts in full
 * (along with the interest it attracts) and paying the balance down faster is not mistaken for a cost.
 */
export function calculateRemortgage(input: RemortgageInput): RemortgageComparison | null {
    return remortgageInputError(input) ? null : compareDeals(input);
}

/** The comparison for an input `remortgageInputError` has already passed. */
export function compareDeals(input: RemortgageInput): RemortgageComparison {
    const months = toTermMonths(input);
    const fee = amount(input.productFee);
    const charge = amount(input.earlyRepaymentCharge);
    const switchingCost = fee + charge;
    const feeAdded = (input.feePayment ?? REMORTGAGE_DEFAULTS.feePayment) === 'add-to-loan';
    const newLoan = input.balance + (feeAdded ? fee : 0);
    const comparisonMonths = Math.min((input.fixedYears ?? REMORTGAGE_DEFAULTS.fixedYears) * 12, months);

    // Replay both loans together, keeping the running total of interest saved to the penny.
    const currentInterest = interestByMonth(input.balance, input.currentRate, months);
    const newInterest = interestByMonth(newLoan, input.newRate, months);
    let saved = 0;
    let interestSaved = 0;
    let paidBackMonth: number | null = null;
    for (let month = 1; month <= months; month += 1) {
        saved += currentInterest() - newInterest();
        if (month === comparisonMonths) interestSaved = pence(saved);
        if (paidBackMonth === null && pence(saved) >= switchingCost) paidBackMonth = month;
    }

    const currentMonthlyPayment = pence(monthlyPaymentFor(input.balance, input.currentRate, months));
    const newMonthlyPayment = pence(monthlyPaymentFor(newLoan, input.newRate, months));
    const monthlySaving = pence(currentMonthlyPayment - newMonthlyPayment);
    const netSaving = pence(interestSaved - switchingCost);
    // Interest is payments plus the change in what is owed, so the net saving splits exactly in two:
    // netSaving = paymentSaving + balanceDifference. A fee added to the loan is not cash paid out;
    // it shows up as a higher balance instead.
    const paymentSaving = pence(monthlySaving * comparisonMonths - charge - (feeAdded ? 0 : fee));
    const breakEvenMonths = breakEven(input, switchingCost, paidBackMonth);

    return {
        currentMonthlyPayment,
        newMonthlyPayment,
        monthlySaving,
        switchingCost,
        newLoan,
        comparisonMonths,
        interestSaved,
        netSaving,
        paymentSaving,
        balanceDifference: pence(netSaving - paymentSaving),
        breakEvenMonths,
        breakEvenWithinPeriod: breakEvenMonths !== null && breakEvenMonths <= comparisonMonths,
    };
}

/** `paidBackMonth` is the first month whose running saving covers the cost, or `null` when none does. */
function breakEven(input: RemortgageInput, switchingCost: number, paidBackMonth: number | null): number | null {
    if (input.newRate >= input.currentRate) return null;
    return switchingCost === 0 ? 0 : paidBackMonth;
}
