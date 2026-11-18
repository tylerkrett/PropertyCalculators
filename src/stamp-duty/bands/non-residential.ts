import type { Band } from './types';

/*
 * Non-residential and mixed-use rates, and the rates charged on the rent of a new lease.
 * Source: GOV.UK "Stamp Duty Land Tax: Non-residential and mixed land and property rates" and
 * Finance Act 2003, Schedule 5, paragraph 2.
 */

/** Freehold price or lease premium for non-residential or mixed-use property. */
export const NON_RESIDENTIAL_BANDS: Band[] = [
    { range: [0, 150_000], rate: 0 },
    { range: [150_000, 250_000], rate: 2 },
    { range: [250_000, Infinity], rate: 5 },
];

/** Rent on a new residential lease, charged on its net present value. */
export const RESIDENTIAL_RENT_BANDS: Band[] = [
    { range: [0, 125_000], rate: 0 },
    { range: [125_000, Infinity], rate: 1 },
];

/** Rent on a new non-residential or mixed-use lease, charged on its net present value. */
export const NON_RESIDENTIAL_RENT_BANDS: Band[] = [
    { range: [0, 150_000], rate: 0 },
    { range: [150_000, 5_000_000], rate: 1 },
    { range: [5_000_000, Infinity], rate: 2 },
];

/** Buying this many dwellings or more in one transaction is taxed at non-residential rates. */
export const NON_RESIDENTIAL_DWELLINGS_THRESHOLD = 6;
