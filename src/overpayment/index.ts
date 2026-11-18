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
 * Mortgage overpayments: what paying extra does to a repayment mortgage. Give the balance, the
 * rate and the time left, then a regular monthly overpayment, a one-off lump sum paid today, or
 * both. The loan is replayed month by month, with interest charged monthly on what is still
 * owed, once at the standard payment and once with the extra, to show how much sooner it ends
 * and how much interest is saved. An illustration only: it assumes the rate never changes, the
 * standard payment stays the same after a lump sum (so the term shortens), and the lender makes
 * no charge for overpaying. Many deals charge for overpaying more than 10% of the balance a year.
 */

export { formatDuration, LOAN_LIMITS, type RemainingTerm } from './loan';
export * from './remortgage';
export * from './remortgage-summary';

export const OVERPAYMENT_LIMITS = LOAN_LIMITS;

export const OVERPAYMENT_DEFAULTS = {
    monthlyOverpayment: 0,
    lumpSum: 0,
    includeSchedule: false,
} as const satisfies { monthlyOverpayment: number; lumpSum: number; includeSchedule: boolean };

export interface OverpaymentInput extends RemainingTerm {
    /** What is still owed, in pounds. */
    balance: number;
    /** Annual interest rate in percent, e.g. 4.5. */
    rate: number;
    /** Extra paid every month on top of the standard payment, in pounds. Defaults to 0. */
    monthlyOverpayment?: number;
    /** One-off payment made today, in pounds. Anything above the balance is ignored. Defaults to 0. */
    lumpSum?: number;
    /** Adds the year-by-year `schedule` for charting. Defaults to `false`. */
    includeSchedule?: boolean;
}

/** Balance still owed at the end of each year, in whole pounds, as parallel arrays for a chart. */
export interface OverpaymentSchedule {
    /** 0 (today) up to the last year of the original term. */
    years: number[];
    /** Without overpaying. */
    before: number[];
    /** With the overpayments; today's figure is after the lump sum. */
    after: number[];
}

export interface Overpayment {
    /** The standard monthly payment, before any overpayment. */
    monthlyPayment: number;
    /** Months left without overpaying: the remaining term. */
    monthsBefore: number;
    /** Months left with the overpayments; 0 when the lump sum clears the loan today. */
    monthsAfter: number;
    monthsSaved: number;
    interestBefore: number;
    interestAfter: number;
    interestSaved: number;
    /** The last, smaller payment that clears the loan when overpaying; 0 when the lump sum clears it. */
    finalPayment: number;
    schedule?: OverpaymentSchedule;
}

const amount = (value: number | undefined) => value ?? 0;
const invalid = (value: number) => !Number.isFinite(value) || value < 0 || value > MAX_PRICE;

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function overpaymentInputError(input: OverpaymentInput): string | null {
    const loanError = loanInputError(input.balance, input.rate, input);
    if (loanError) return loanError;
    if (invalid(amount(input.monthlyOverpayment))) return 'Enter the monthly overpayment, or leave it at 0.';
    if (invalid(amount(input.lumpSum))) return 'Enter the lump sum, or leave it at 0.';
    return null;
}

interface Payoff {
    months: number;
    interest: number;
    finalPayment: number;
    /** Balance today, then after every twelfth month, until the loan is cleared. */
    yearEnds: number[];
}

/**
 * Replays a loan month by month: interest is added on what is owed, then the payment comes off.
 * The last payment is only what is left. Less than half a penny owed counts as cleared, and the
 * loan never runs past `maxMonths`, so rounding can't add a phantom month.
 */
function payOff(balance: number, monthlyRate: number, payment: number, maxMonths: number): Payoff {
    const yearEnds = [balance];
    let months = 0;
    let interest = 0;
    let finalPayment = 0;
    while (balance >= 0.005 && months < maxMonths) {
        const charged = balance * monthlyRate;
        finalPayment = Math.min(payment, balance + charged);
        balance += charged - finalPayment;
        interest += charged;
        months += 1;
        if (months % 12 === 0) yearEnds.push(Math.max(0, balance));
    }
    return { months, interest, finalPayment, yearEnds };
}

/** The maths alone; `null` for invalid input. Pounds are rounded to the penny. */
export function calculateOverpayment(input: OverpaymentInput): Overpayment | null {
    return overpaymentInputError(input) ? null : replayOverpayment(input);
}

/** The overpayment for an input `overpaymentInputError` has already passed. */
function replayOverpayment(input: OverpaymentInput): Overpayment {
    const { balance, rate } = input;
    const monthsBefore = toTermMonths(input);
    const monthlyRate = rate / 100 / 12;
    const payment = monthlyPaymentFor(balance, rate, monthsBefore);
    const lumpSum = Math.min(amount(input.lumpSum), balance);

    const before = payOff(balance, monthlyRate, payment, monthsBefore);
    const after = payOff(balance - lumpSum, monthlyRate, payment + amount(input.monthlyOverpayment), monthsBefore);
    const interestBefore = pence(before.interest);
    const interestAfter = pence(after.interest);
    const result: Overpayment = {
        monthlyPayment: pence(payment),
        monthsBefore,
        monthsAfter: after.months,
        monthsSaved: monthsBefore - after.months,
        interestBefore,
        interestAfter,
        interestSaved: pence(interestBefore - interestAfter),
        finalPayment: pence(after.finalPayment),
    };
    if (!(input.includeSchedule ?? OVERPAYMENT_DEFAULTS.includeSchedule)) return result;

    const years = Array.from({ length: Math.ceil(monthsBefore / 12) + 1 }, (_, year) => year);
    const owed = (yearEnds: number[]) => years.map((year) => Math.round(yearEnds[year] ?? 0));
    return { ...result, schedule: { years, before: owed(before.yearEnds), after: owed(after.yearEnds) } };
}

export const OVERPAYMENT_LABELS = {
    interestSaved: 'Interest saved',
    monthsSaved: 'Time saved',
    monthsAfter: 'Paid off in',
    monthsBefore: 'Paid off in, without overpaying',
    interestAfter: 'Total interest',
    interestBefore: 'Total interest, without overpaying',
    monthlyPayment: 'Standard monthly payment',
    finalPayment: 'Final payment',
} as const;

type OverpaymentKey = keyof typeof OVERPAYMENT_LABELS;

export interface OverpaymentSummary extends Overpayment {
    formatted: Record<OverpaymentKey, string>;
    /** The same figures as labelled rows, in display order: interest saved leads. */
    rows: { key: OverpaymentKey; label: string; value: number; formatted: string }[];
}

/**
 * An overpayment with every figure and its display string: durations in plain English
 * ("3 years 4 months"), payments to the penny, interest to the pound (the interest saved is the
 * difference of the two totals as displayed). Either the summary or the reason the input can't be
 * calculated, never both.
 */
export function getOverpaymentSummary(
    input: OverpaymentInput,
): { summary: OverpaymentSummary; error: null } | { summary: null; error: string } {
    const error = overpaymentInputError(input);
    if (error) return { summary: null, error };
    const result = replayOverpayment(input);

    const keys = Object.keys(OVERPAYMENT_LABELS) as OverpaymentKey[];
    const display = (key: OverpaymentKey) => {
        if (key.startsWith('months')) return formatDuration(result[key]);
        // The difference of the two totals as displayed, so the three interest rows add up to the pound.
        if (key === 'interestSaved')
            return formatPounds(Math.round(result.interestBefore) - Math.round(result.interestAfter));
        return key.endsWith('Payment') ? formatPoundsAndPence(result[key]) : formatPounds(result[key]);
    };
    const formatted = Object.fromEntries(keys.map((key) => [key, display(key)])) as Record<OverpaymentKey, string>;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: OVERPAYMENT_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
