import { assertInput } from './purchase';

/*
 * The dates that matter when the higher rates were paid because the previous main home had not
 * been sold yet, and the extra is to be claimed back (Finance Act 2003, Schedule 4ZA).
 */

/** Years after the purchase within which the previous main home must be sold to get a refund. */
export const HIGHER_RATES_REFUND_WINDOW_YEARS = 3;

/** Months to claim the refund: a period beginning with the later of the sale and the return's filing date. */
export const HIGHER_RATES_REFUND_CLAIM_MONTHS = 12;

/** Days after completion by which the SDLT return must be filed. */
export const SDLT_FILING_DAYS = 14;

/** The higher rates began on 1 April 2016; dates before that year, or absurdly far ahead, are rejected. */
export const REFUND_DATE_MIN_YEAR = 2016;
export const REFUND_DATE_MAX_YEAR = 2200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown, name: string): Date {
    const date =
        typeof value === 'string' && ISO_DATE.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(Number.NaN);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        throw new RangeError(`Invalid ${name}: ${String(value)} (expected YYYY-MM-DD)`);
    const year = date.getUTCFullYear();
    if (year < REFUND_DATE_MIN_YEAR || year > REFUND_DATE_MAX_YEAR)
        throw new RangeError(
            `Invalid ${name}: ${value} (expected a year from ${REFUND_DATE_MIN_YEAR} to ${REFUND_DATE_MAX_YEAR})`,
        );
    return date;
}

const toIso = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

/**
 * The last day of a period of `months` that begins with `start`: the day before the same date
 * `months` later. When that month has no such date (a period beginning 29 February that ends in
 * an ordinary year), the period ends on the month's last day.
 */
function lastDayOfPeriod(start: Date, months: number) {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + months;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(start.getUTCDate() - 1, daysInMonth)));
}

export interface RefundDeadlines {
    /** The previous main home must be sold on or before this date. */
    sellBy: string;
    /** The date the SDLT return for the new home is due. */
    filingDate: string;
    /** The last day to claim the refund. `null` until `saleDate` is given, and when the sale was too late. */
    claimBy: string | null;
    /** Whether `saleDate` falls inside the window. `null` until `saleDate` is given. */
    soldInTime: boolean | null;
}

/**
 * The dates that matter for a higher-rates refund. Dates are `YYYY-MM-DD` strings, from 2016 to 2200.
 * `purchaseDate` is the completion date of the new home; `saleDate` is when the previous home sold.
 *
 * Throws a `RangeError` on an invalid date, and when the sale was on or before the purchase date:
 * the purchase then replaced the main residence outright, so no higher rates were due and there
 * is nothing to claim back (Schedule 4ZA, paragraph 3(6)).
 */
export function getRefundDeadlines(input: { purchaseDate: string; saleDate?: string }): RefundDeadlines {
    assertInput(input, 'refund dates');
    const purchase = parseDate(input.purchaseDate, 'purchase date');
    // Paragraph 3(7A)(a): the sale must fall in "the period of three years beginning with the day
    // after the effective date" of the purchase. So the last day is the purchase date three years
    // on, and a purchase on 28 February 2025 has until 29 February 2028.
    const sellBy = lastDayOfPeriod(addDays(purchase, 1), HIGHER_RATES_REFUND_WINDOW_YEARS * 12);
    const filing = addDays(purchase, SDLT_FILING_DAYS);
    const dates = { sellBy: toIso(sellBy), filingDate: toIso(filing) };

    if (input.saleDate === undefined) return { ...dates, claimBy: null, soldInTime: null };

    const sale = parseDate(input.saleDate, 'sale date');
    if (sale.getTime() <= purchase.getTime())
        throw new RangeError(
            `Invalid sale date: ${input.saleDate} is not after the purchase date ${input.purchaseDate}, so no higher rates were due and there is no refund to claim`,
        );
    if (sale.getTime() > sellBy.getTime()) return { ...dates, claimBy: null, soldInTime: false };

    // Paragraph 8(3): the return may be amended "within the period of 12 months beginning with" the
    // sale date or, if later, the filing date. A period beginning with a day includes that day, so
    // the last day is the day before the anniversary.
    const later = sale.getTime() > filing.getTime() ? sale : filing;
    return { ...dates, claimBy: toIso(lastDayOfPeriod(later, HIGHER_RATES_REFUND_CLAIM_MONTHS)), soldInTime: true };
}
