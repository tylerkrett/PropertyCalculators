import { assertInput, checkAmount } from './purchase';

/*
 * The rent side of a new lease. Rent is taxed through its "net present value": every year's rent
 * discounted back to today and added up (Finance Act 2003, Schedule 5, paragraph 3).
 */

/** The yearly discount applied to future rent, in percent (Schedule 5, paragraph 8). */
export const RENT_DISCOUNT_RATE = 3.5;

/** Only the first five years' rents are used; later years take the highest of them. */
export const RENT_REVIEW_YEARS = 5;

/** The longest lease the calculators accept, in years. */
export const MAX_LEASE_YEARS = 9_999;

/** Added before rounding down, against float noise such as 124999.99999999999. */
const FLOAT_GUARD = 1e-6;

export interface RentInput {
    /**
     * Rent per year in pounds (0 to `Number.MAX_SAFE_INTEGER`), including any VAT. One number for a
     * flat rent, or up to five numbers for the first five years; a shorter list repeats its last value.
     */
    rent: number | readonly number[];
    /** Length of the lease in years. May include a part year: `99.5`. */
    termYears: number;
}

function toRents(rent: RentInput['rent']): number[] {
    if (typeof rent !== 'number' && !Array.isArray(rent)) throw new RangeError(`Invalid rent: ${String(rent)}`);
    const rents: unknown[] = typeof rent === 'number' ? [rent] : [...rent];
    if (rents.length < 1 || rents.length > RENT_REVIEW_YEARS)
        throw new RangeError(`Expected 1 to ${RENT_REVIEW_YEARS} yearly rents, got ${rents.length}`);
    return rents.map((value) => checkAmount(value, 'rent'));
}

function checkTerm(termYears: number) {
    if (typeof termYears !== 'number' || !Number.isFinite(termYears) || termYears <= 0 || termYears > MAX_LEASE_YEARS)
        throw new RangeError(`Invalid lease term: ${String(termYears)}`);
}

/**
 * The net present value of the rent over a lease, rounded down to the pound.
 *
 * Year `i` contributes `rent / 1.035^i`. Years one to five use the rents given; every later year
 * uses the highest of them. A final part year counts in proportion: its rent is rounded down to
 * the pound before discounting, as in HMRC's worked example (SDLT manual, SDLTM13090).
 *
 * Throws a `RangeError` on invalid input.
 */
export function calculateRentNpv(input: RentInput): number {
    assertInput(input, 'rent input');
    const { rent, termYears } = input;
    const rents = toRents(rent);
    checkTerm(termYears);

    const firstFive = Array.from(
        { length: RENT_REVIEW_YEARS },
        (_, year) => rents[Math.min(year, rents.length - 1)] ?? 0,
    );
    const highest = Math.max(...firstFive);
    const rentIn = (year: number) => (year <= RENT_REVIEW_YEARS ? (firstFive[year - 1] ?? 0) : highest);

    const wholeYears = Math.floor(termYears);
    const partYear = termYears - wholeYears;
    const factor = 1 + RENT_DISCOUNT_RATE / 100;

    let npv = 0;
    let discount = 1;
    for (let year = 1; year <= wholeYears; year++) {
        discount *= factor;
        npv += rentIn(year) / discount;
    }
    // The same guard as the final floor: 0.1 of a year of £10,000 must not come out as £999.
    if (partYear > 0) npv += Math.floor(rentIn(wholeYears + 1) * partYear + FLOAT_GUARD) / (discount * factor);

    return Math.floor(npv + FLOAT_GUARD);
}

/** The highest yearly rent given. */
export const highestRent = (rent: RentInput['rent']): number => Math.max(...toRents(rent));
