import { MORTGAGE_LIMITS } from '../mortgage/index';
import type { BuyerType } from '../stamp-duty/estimate';

/*
 * The defaults and bounds of the affordability calculator, and the small helpers its two
 * directions share. The 4.5 times income multiple and the 3 point stress buffer are common rules
 * of thumb for an illustration, not figures any one lender is bound by.
 */

/** Bounds the form accepts. Rate and term are the mortgage calculator's own. */
export const AFFORDABILITY_LIMITS = {
    incomeMultiple: { min: 1, max: 6 },
    stressBuffer: { min: 0, max: 10 },
    rate: MORTGAGE_LIMITS.rate,
    term: MORTGAGE_LIMITS.term,
} as const;

/** What the calculator assumes until told otherwise. */
export const AFFORDABILITY_DEFAULTS = {
    incomeMultiple: 4.5,
    /** Percentage points added to the rate for the stressed payment. */
    stressBuffer: 3,
    rate: 4.5,
    term: 25,
    buyer: 'home-mover',
} as const satisfies { incomeMultiple: number; stressBuffer: number; rate: number; term: number; buyer: BuyerType };

// Internal helpers: shared by the files in this folder, not re-exported from the module.
export const amount = (value: number | undefined) => value ?? 0;
export const invalid = (value: number) => !Number.isFinite(value) || value < 0;
export const outside = (value: number, { min, max }: { min: number; max: number }) =>
    !Number.isFinite(value) || value < min || value > max;
export const twoDecimals = (value: number) => Math.round(value * 100) / 100;
// Whole pounds, forgiving the last-digit noise of floating point so 100,000 × 4.45 is 445,000.
export const EPSILON = 1e-6;
export const poundsDown = (value: number) => Math.floor(value + EPSILON);
export const poundsUp = (value: number) => Math.ceil(value - EPSILON);

export const incomeMultipleError = (multiple: number) =>
    outside(multiple, AFFORDABILITY_LIMITS.incomeMultiple)
        ? `Enter an income multiple between ${AFFORDABILITY_LIMITS.incomeMultiple.min} and ${AFFORDABILITY_LIMITS.incomeMultiple.max}.`
        : null;
export const COMMITMENTS_ERROR = 'Enter the monthly commitments, or leave them at 0.';
