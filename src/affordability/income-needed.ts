import { MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds, formatRate } from '../stamp-duty/format';
import {
    AFFORDABILITY_DEFAULTS,
    amount,
    COMMITMENTS_ERROR,
    incomeMultipleError,
    invalid,
    poundsUp,
    twoDecimals,
} from './limits';

/*
 * Affordability in reverse: the gross yearly income needed to buy at a target price. The loan is
 * divided by the income multiple, and a year of committed outgoings is added back, the mirror of
 * how the forward calculation counts income. An illustration, not a lender's decision.
 */

export interface IncomeNeededInput {
    /** The price of the property wanted, in pounds. */
    price: number;
    deposit: number;
    /** Committed outgoings in pounds a month. Defaults to 0. */
    monthlyCommitments?: number;
    /** Defaults to 4.5. */
    incomeMultiple?: number;
}

export interface IncomeNeeded {
    loan: number;
    /** Loan to value, percent to two decimals. */
    ltv: number;
    /** Gross yearly income (all applicants together) needed to borrow the loan, rounded up to the pound. */
    incomeNeeded: number;
    formatted: Record<'loan' | 'ltv' | 'incomeNeeded', string>;
}

/** Why an income-needed input can't be calculated, worded for the form; `null` when it can. */
export function incomeNeededInputError(input: IncomeNeededInput): string | null {
    const { price, deposit } = input;
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) return 'Enter the property price.';
    if (invalid(deposit)) return 'Enter a deposit of £0 or more.';
    if (deposit >= price) return 'The deposit covers the whole price, so there is nothing to borrow.';
    if (invalid(amount(input.monthlyCommitments))) return COMMITMENTS_ERROR;
    return incomeMultipleError(input.incomeMultiple ?? AFFORDABILITY_DEFAULTS.incomeMultiple);
}

/**
 * The reverse of `calculateAffordability`: the income needed to buy at a target price. It is
 * loan ÷ income multiple, plus a year of commitments; `null` for invalid input. Feeding the
 * answer back into `calculateAffordability` gives a maximum loan of at least this loan.
 */
export function calculateIncomeNeeded(input: IncomeNeededInput): IncomeNeeded | null {
    if (incomeNeededInputError(input)) return null;
    const loan = input.price - input.deposit;
    const multiple = input.incomeMultiple ?? AFFORDABILITY_DEFAULTS.incomeMultiple;
    const ltv = twoDecimals((loan / input.price) * 100);
    const incomeNeeded = poundsUp(loan / multiple + amount(input.monthlyCommitments) * 12);
    return {
        loan,
        ltv,
        incomeNeeded,
        formatted: { loan: formatPounds(loan), ltv: formatRate(ltv), incomeNeeded: formatPounds(incomeNeeded) },
    };
}
