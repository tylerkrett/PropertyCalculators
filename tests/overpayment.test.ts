import { describe, expect, it } from 'vitest';

import { calculateMortgage } from '../src/mortgage/index';
import {
    calculateOverpayment,
    calculateRemortgage,
    formatDuration,
    getOverpaymentSummary,
    getRemortgageSummary,
    overpaymentInputError,
    remortgageInputError,
    type OverpaymentInput,
    type RemortgageInput,
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

    it('survives a trip through JSON unchanged, and reports errors', () => {
        const result = getOverpaymentSummary({ ...base, monthlyOverpayment: 200, includeSchedule: true });
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
        expect(getOverpaymentSummary({ ...base, balance: -5 })).toEqual({
            summary: null,
            error: 'Enter the mortgage balance.',
        });
    });
});

const deal: RemortgageInput = { balance: 120_000, currentRate: 6, newRate: 3, termYears: 20 };

describe('calculateRemortgage', () => {
    it('compares the standard payment on each deal', () => {
        const payment = (rate: number) =>
            calculateMortgage({ price: 120_000, deposit: 0, rate, termYears: 20, type: 'repayment' })!.monthlyPayment;
        const result = calculateRemortgage(deal)!;
        expect([result.currentMonthlyPayment, result.newMonthlyPayment]).toEqual([payment(6), payment(3)]);
        expect(result.monthlySaving).toBe(194.2);
        expect(result).toMatchObject({ switchingCost: 0, newLoan: 120_000, comparisonMonths: 24 });
    });

    it('breaks even exactly when the interest saved meets the cost', () => {
        // First month's interest: £600 at 6% against £300 at 3%, so £300 is paid back in month one.
        expect(calculateRemortgage({ ...deal, productFee: 300 })!.breakEvenMonths).toBe(1);
        expect(calculateRemortgage({ ...deal, productFee: 200, earlyRepaymentCharge: 100 })!.breakEvenMonths).toBe(1);
        expect(calculateRemortgage({ ...deal, productFee: 300.01 })!.breakEvenMonths).toBe(2);
        // Nothing to pay back on a cheaper deal with no costs.
        expect(calculateRemortgage(deal)!.breakEvenMonths).toBe(0);
    });

    it('never breaks even on a dearer deal or when the cost outweighs the saving', () => {
        const dearer = calculateRemortgage({ ...deal, currentRate: 3, newRate: 3.5 })!;
        expect(dearer.breakEvenMonths).toBeNull();
        expect(dearer.monthlySaving).toBeLessThan(0);
        expect(dearer.netSaving).toBeLessThan(0);
        expect(calculateRemortgage({ ...deal, newRate: 6, productFee: 999 })!.breakEvenMonths).toBeNull();

        const tooCostly = { balance: 10_000, currentRate: 4, newRate: 3.9, termYears: 2, productFee: 999 };
        expect(calculateRemortgage(tooCostly)).toMatchObject({ breakEvenMonths: null, netSaving: -988.32 });
    });

    it('nets the switching cost off the interest saved over the fixed period', () => {
        const input = { ...deal, balance: 200_000, currentRate: 5.5, newRate: 4.5, termYears: 25 };
        const result = calculateRemortgage({ ...input, productFee: 999, earlyRepaymentCharge: 1_000 })!;
        expect(result).toMatchObject({ switchingCost: 1_999, interestSaved: 3_977.2, breakEvenMonths: 13 });
        expect(result.netSaving).toBe(1_978.2);

        const fiveYears = calculateRemortgage({ ...input, productFee: 999, fixedYears: 5 })!;
        expect(fiveYears.comparisonMonths).toBe(60);
        expect(fiveYears.interestSaved).toBeGreaterThan(result.interestSaved);
        // The comparison stops when the mortgage does.
        expect(calculateRemortgage({ ...deal, termYears: 1 })!.comparisonMonths).toBe(12);
    });

    it('costs more to add the fee to the loan than to pay it upfront', () => {
        const input = { ...deal, balance: 200_000, currentRate: 5.5, newRate: 4.5, termYears: 25, productFee: 999 };
        const upfront = calculateRemortgage(input)!;
        const added = calculateRemortgage({ ...input, feePayment: 'add-to-loan' })!;
        expect([upfront.newLoan, added.newLoan]).toEqual([200_000, 200_999]);
        expect(added.switchingCost).toBe(upfront.switchingCost);
        expect(added.newMonthlyPayment).toBeGreaterThan(upfront.newMonthlyPayment);
        // The borrowed fee earns the lender interest: 4.5% on £999 is about £88 over two years.
        expect(upfront.netSaving - added.netSaving).toBeCloseTo(88, 0);
    });

    it("rejects input it can't calculate", () => {
        expect(remortgageInputError(deal)).toBeNull();
        expect(remortgageInputError({ ...deal, balance: 0 })).toMatch(/balance/);
        expect(remortgageInputError({ ...deal, currentRate: -1 })).toMatch(/current interest rate/);
        expect(remortgageInputError({ ...deal, newRate: 26 })).toMatch(/new interest rate/);
        expect(remortgageInputError({ ...deal, termYears: 0 })).toMatch(/remaining term/);
        expect(remortgageInputError({ ...deal, productFee: -1 })).toMatch(/product fee/);
        expect(remortgageInputError({ ...deal, earlyRepaymentCharge: Number.NaN })).toMatch(/early repayment/);
        expect(remortgageInputError({ ...deal, fixedYears: 0 })).toMatch(/fixed period/);
        expect(calculateRemortgage({ ...deal, fixedYears: 2.5 })).toBeNull();
    });
});

describe('getRemortgageSummary', () => {
    it('formats every figure, writing a break-even that never comes as "Never"', () => {
        const { summary } = getRemortgageSummary({ ...deal, productFee: 3_000 });
        expect(summary!.formatted).toMatchObject({ monthlySaving: '£194.20', switchingCost: '£3,000' });
        expect(summary!.formatted.breakEvenMonths).toBe(formatDuration(summary!.breakEvenMonths!));

        const never = getRemortgageSummary({ ...deal, currentRate: 3, newRate: 3.5 });
        expect(never.summary!.formatted).toMatchObject({ breakEvenMonths: 'Never', monthlySaving: '-£30.43' });
        expect(never.summary!.rows.find((row) => row.key === 'breakEvenMonths')!.value).toBeNull();
        expect(JSON.parse(JSON.stringify(never))).toEqual(never);
        expect(getRemortgageSummary({ ...deal, newRate: 99 }).error).toMatch(/new interest rate/);
    });
});
