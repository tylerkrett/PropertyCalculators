import { describe, expect, it } from 'vitest';

import { calculateMortgage } from '../src/mortgage/index';
import {
    calculateOverpayment,
    formatDuration,
    getOverpaymentSummary,
    overpaymentInputError,
    type OverpaymentInput,
} from '../src/overpayment/index';

const base: OverpaymentInput = { balance: 200_000, rate: 5, termYears: 25 };
// £1,200 at 12% is 1% a month: easy to follow by hand.
const small: OverpaymentInput = { balance: 1_200, rate: 12, termMonths: 2 };

describe('formatDuration', () => {
    it('writes months as plain English', () => {
        expect(formatDuration(40)).toBe('3 years 4 months');
        expect(formatDuration(12)).toBe('1 year');
        expect(formatDuration(13)).toBe('1 year 1 month');
        expect(formatDuration(300)).toBe('25 years');
        expect([7, 1, 0].map(formatDuration)).toEqual(['7 months', '1 month', '0 months']);
    });
});

describe('calculateOverpayment', () => {
    it('reproduces the standard mortgage when nothing is overpaid', () => {
        const mortgage = calculateMortgage({ price: 200_000, deposit: 0, rate: 5, termYears: 25, type: 'repayment' })!;
        const result = calculateOverpayment({ ...base, monthlyOverpayment: 0 })!;
        expect(result.monthlyPayment).toBe(mortgage.monthlyPayment);
        expect(result.interestBefore).toBeCloseTo(mortgage.totalInterest, 2);
        expect(result.interestAfter).toBe(result.interestBefore);
        expect(result).toMatchObject({ monthsBefore: 300, monthsAfter: 300, monthsSaved: 0, interestSaved: 0 });
    });

    it('follows a two-month loan worked by hand', () => {
        // Payment 1,200 × 0.01 / (1 − 1.01⁻²) = 609.01. Interest: 12.00, then 1% of (1,212 − 609.01) = 6.03.
        const result = calculateOverpayment(small)!;
        expect(result.monthlyPayment).toBe(609.01);
        expect(result.interestBefore).toBe(18.03);
        expect(result.monthsAfter).toBe(2);
    });

    it('shortens the loan with a monthly overpayment, ending on a partial payment', () => {
        // 0%: £12,000 over a year is £1,000 a month. £500 extra clears it in 8 months.
        const free = calculateOverpayment({ balance: 12_000, rate: 0, termYears: 1, monthlyOverpayment: 500 })!;
        expect(free).toMatchObject({ monthlyPayment: 1_000, monthsAfter: 8, monthsSaved: 4, finalPayment: 1_500 });
        expect(free).toMatchObject({ interestBefore: 0, interestAfter: 0, interestSaved: 0 });

        // £700 extra: seven payments of £1,700 leave £100 for the eighth.
        const partial = calculateOverpayment({ balance: 12_000, rate: 0, termYears: 1, monthlyOverpayment: 700 })!;
        expect(partial).toMatchObject({ monthsAfter: 8, finalPayment: 100 });

        const result = calculateOverpayment({ ...base, monthlyOverpayment: 200 })!;
        expect(result).toMatchObject({ monthsAfter: 226, monthsSaved: 74, interestAfter: 108_911.43 });
        expect(result.interestSaved).toBe(41_842.59);
        expect(result.finalPayment).toBe(845.91);
    });

    it('shortens the loan with a lump sum alone, keeping the standard payment', () => {
        // £600 off today leaves £600: one month's interest of £6 and a single final payment of £606.
        const result = calculateOverpayment({ ...small, lumpSum: 600 })!;
        expect(result).toMatchObject({ monthsAfter: 1, monthsSaved: 1, interestAfter: 6, finalPayment: 606 });
        expect(result.interestSaved).toBe(12.03);

        const big = calculateOverpayment({ ...base, lumpSum: 10_000 })!;
        expect(big).toMatchObject({ monthlyPayment: 1_169.18, monthsAfter: 272, monthsSaved: 28 });
    });

    it('saves more with both than with either alone', () => {
        const monthly = calculateOverpayment({ ...base, monthlyOverpayment: 200 })!;
        const lump = calculateOverpayment({ ...base, lumpSum: 10_000 })!;
        const both = calculateOverpayment({ ...base, monthlyOverpayment: 200, lumpSum: 10_000 })!;
        expect(both).toMatchObject({ monthsAfter: 208, monthsSaved: 92, interestSaved: 56_500.76 });
        expect(both.interestSaved).toBeGreaterThan(Math.max(monthly.interestSaved, lump.interestSaved));
        expect(both.monthsAfter).toBeLessThan(Math.min(monthly.monthsAfter, lump.monthsAfter));
    });

    it('copes with a loan cleared straight away', () => {
        // A lump sum of the whole balance (or more) ends it today: no months, no interest.
        for (const lumpSum of [1_200, 5_000]) {
            const cleared = calculateOverpayment({ ...small, lumpSum })!;
            expect(cleared).toMatchObject({ monthsAfter: 0, monthsSaved: 2, interestAfter: 0, finalPayment: 0 });
            expect(cleared.interestSaved).toBe(18.03);
        }
        // A huge monthly overpayment clears it with the first payment: the balance plus a month's interest.
        const firstMonth = calculateOverpayment({ ...small, monthlyOverpayment: 5_000 })!;
        expect(firstMonth).toMatchObject({ monthsAfter: 1, interestAfter: 12, finalPayment: 1_212 });
    });

    it('accepts the term in years, months or both', () => {
        const years = calculateOverpayment({ balance: 100_000, rate: 4, termYears: 10 })!;
        const months = calculateOverpayment({ balance: 100_000, rate: 4, termMonths: 120 })!;
        const mixed = calculateOverpayment({ balance: 100_000, rate: 4, termYears: 9, termMonths: 12 })!;
        expect(months).toEqual(years);
        expect(mixed).toEqual(years);
        expect(calculateOverpayment({ balance: 100_000, rate: 4, termYears: 18, termMonths: 4 })!.monthsBefore).toBe(
            220,
        );
    });

    it('returns a yearly balance schedule only when asked', () => {
        expect(calculateOverpayment(base)!.schedule).toBeUndefined();
        const { schedule } = calculateOverpayment({
            balance: 24_000,
            rate: 0,
            termYears: 2,
            monthlyOverpayment: 1_000,
            lumpSum: 2_000,
            includeSchedule: true,
        })!;
        // Standard payment £1,000: £12,000 a year. Overpaying: £22,000 today, then £2,000 a month, gone in 11.
        expect(schedule).toEqual({ years: [0, 1, 2], before: [24_000, 12_000, 0], after: [22_000, 0, 0] });

        const long = calculateOverpayment({ ...base, monthlyOverpayment: 200, includeSchedule: true })!.schedule!;
        expect([long.years.length, long.before.length, long.after.length]).toEqual([26, 26, 26]);
        expect([long.before[0], long.before.at(-1)]).toEqual([200_000, 0]);
        expect(long.after.every((owed, year) => owed <= (long.before[year] ?? 0))).toBe(true);
    });

    it("rejects input it can't calculate", () => {
        expect(overpaymentInputError(base)).toBeNull();
        expect(overpaymentInputError({ ...base, balance: 0 })).toMatch(/balance/);
        expect(overpaymentInputError({ ...base, rate: 30 })).toMatch(/interest rate between 0% and 25%/);
        expect(overpaymentInputError({ balance: 1_000, rate: 5 })).toMatch(/remaining term/);
        expect(overpaymentInputError({ ...base, termYears: 2.55 })).toMatch(/remaining term/);
        expect(overpaymentInputError({ ...base, termYears: 41 })).toMatch(/remaining term/);
        expect(overpaymentInputError({ ...base, monthlyOverpayment: -1 })).toMatch(/monthly overpayment/);
        expect(overpaymentInputError({ ...base, lumpSum: Number.NaN })).toMatch(/lump sum/);
        expect(calculateOverpayment({ ...base, lumpSum: -1 })).toBeNull();
    });

    it('enforces the advertised limits on the balance and each part of the term', () => {
        expect(overpaymentInputError({ ...base, balance: 0.5 })).toBe('Enter the mortgage balance.');
        expect(overpaymentInputError({ ...base, balance: 1 })).toBeNull();
        // Years and months are each a whole number of 0 or more: they can't cancel each other out.
        const term = (parts: object) => overpaymentInputError({ balance: 1_000, rate: 5, ...parts });
        expect(term({ termYears: 2, termMonths: -6 })).toMatch(/remaining term/);
        expect(term({ termYears: 1.5 })).toMatch(/remaining term/);
        expect(term({ termYears: 1.5, termMonths: 6 })).toMatch(/remaining term/);
        expect(term({ termYears: '25' })).toMatch(/remaining term/);
        expect(term({ termYears: 0, termMonths: 0 })).toMatch(/remaining term/);
        expect(term({ termYears: 18, termMonths: 4 })).toBeNull();
        expect(term({ termMonths: 480 })).toBeNull();
        expect(term({ termMonths: 481 })).toMatch(/remaining term/);
    });
});

describe('getOverpaymentSummary', () => {
    it('gives durations in plain English and money as display strings', () => {
        const { summary } = getOverpaymentSummary({ ...base, monthlyOverpayment: 200, lumpSum: 10_000 });
        expect(summary!.formatted).toEqual({
            interestSaved: '£56,501',
            monthsSaved: '7 years 8 months',
            monthsAfter: '17 years 4 months',
            monthsBefore: '25 years',
            interestAfter: '£94,253',
            interestBefore: '£150,754',
            monthlyPayment: '£1,169.18',
            finalPayment: '£832.98',
        });
        expect(summary!.rows[1]).toEqual({
            key: 'monthsSaved',
            label: 'Time saved',
            value: 92,
            formatted: '7 years 8 months',
        });
    });

    it('shows an interest saved that is the difference of the two totals as displayed', () => {
        // 52,999.52 less 36,625.13 is 16,374.39, but the totals are shown as £53,000 and £36,625.
        const input = { balance: 100_043.86, rate: 4.37, termYears: 21, monthlyOverpayment: 150 };
        const { summary } = getOverpaymentSummary(input);
        expect(summary).toMatchObject({
            interestBefore: 52_999.52,
            interestAfter: 36_625.13,
            interestSaved: 16_374.39,
        });
        expect(summary!.formatted).toMatchObject({
            interestBefore: '£53,000',
            interestAfter: '£36,625',
            interestSaved: '£16,375',
        });
        expect(summary!.rows[0]).toMatchObject({ key: 'interestSaved', value: 16_374.39, formatted: '£16,375' });
    });

    it('survives a trip through JSON unchanged, and reports errors', () => {
        const result = getOverpaymentSummary({ ...base, monthlyOverpayment: 200, includeSchedule: true });
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
        expect(getOverpaymentSummary({ ...base, balance: -5 })).toEqual({
            summary: null,
            error: 'Enter the mortgage balance.',
        });
    });
});
