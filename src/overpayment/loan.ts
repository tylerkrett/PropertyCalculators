import { MORTGAGE_LIMITS } from '../mortgage/index';
import { MAX_PRICE } from '../stamp-duty/estimate';

/*
 * The small loan helpers the overpayment and remortgage calculators share: the limits a form
 * accepts, the remaining term, the standard monthly payment and plain-English durations.
 */

/**
 * Bounds the forms accept. The term is the time left on the mortgage, in months: years and months
 * are each a whole number, 0 or more, and are added up.
 */
export const LOAN_LIMITS = {
    balance: { min: 1, max: MAX_PRICE },
    rate: MORTGAGE_LIMITS.rate,
    termMonths: { min: 1, max: MORTGAGE_LIMITS.term.max * 12 },
} as const;

/** Time left on the mortgage. Give years, months, or both (18 years and 4 months); they are added up. */
export interface RemainingTerm {
    termYears?: number;
    termMonths?: number;
}

/** The remaining term in months. */
export const toTermMonths = ({ termYears = 0, termMonths = 0 }: RemainingTerm): number => termYears * 12 + termMonths;

/** `"3 years 4 months"`, `"1 year"`, `"7 months"`, `"0 months"`: a number of months in plain English. */
export function formatDuration(months: number): string {
    const whole = Math.max(0, Math.round(months));
    const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;
    const years = Math.floor(whole / 12);
    const rest = whole % 12;
    if (years === 0) return plural(rest, 'month');
    return rest === 0 ? plural(years, 'year') : `${plural(years, 'year')} ${plural(rest, 'month')}`;
}

/**
 * The standard monthly payment on a repayment loan, unrounded: P·r / (1 − (1 + r)^−n) with r the
 * monthly rate and n the months left; P / n at 0%.
 */
export function monthlyPaymentFor(balance: number, rate: number, months: number): number {
    const r = rate / 100 / 12;
    return r === 0 ? balance / months : (balance * r) / (1 - (1 + r) ** -months);
}

/** A part of the term (years or months) that can be used: left out, or a whole number of 0 or more. */
const validTermPart = (value: unknown) =>
    value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0);

/** Why a balance, rate or term can't be used, worded for the form; `null` when they can. */
export function loanInputError(balance: number, rate: number, term: RemainingTerm, rateName = 'an interest rate') {
    const { min, max } = LOAN_LIMITS.rate;
    if (!Number.isFinite(balance) || balance < LOAN_LIMITS.balance.min) return 'Enter the mortgage balance.';
    if (balance > LOAN_LIMITS.balance.max) return 'Enter a lower mortgage balance.';
    if (!Number.isFinite(rate) || rate < min || rate > max) return `Enter ${rateName} between ${min}% and ${max}%.`;
    const months = validTermPart(term.termYears) && validTermPart(term.termMonths) ? toTermMonths(term) : NaN;
    if (!(months >= LOAN_LIMITS.termMonths.min && months <= LOAN_LIMITS.termMonths.max))
        return `Enter a remaining term of 1 month to ${MORTGAGE_LIMITS.term.max} years.`;
    return null;
}

/** Rounds to the penny. Never `-0`, so a saving of nothing is not shown with a minus sign. */
export const pence = (value: number) => (Math.round(value * 100) || 0) / 100;
