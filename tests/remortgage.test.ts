import { describe, expect, it } from 'vitest';

import { calculateMortgage } from '../src/mortgage/index';
import {
    calculateRemortgage,
    formatDuration,
    getRemortgageSummary,
    REMORTGAGE_LABELS,
    remortgageInputError,
    type RemortgageInput,
} from '../src/overpayment/index';

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
        expect(remortgageInputError({ ...deal, balance: 0.99 })).toMatch(/balance/);
        expect(remortgageInputError({ ...deal, termYears: 2, termMonths: -6 })).toMatch(/remaining term/);
        expect(remortgageInputError({ ...deal, feePayment: 'later' as never })).toBe(
            'Choose how the product fee is paid.',
        );
        expect(remortgageInputError({ ...deal, feePayment: 'add-to-loan' })).toBeNull();
    });
});

// The reviewer's deal: £116.51 a month cheaper, with a £999 fee.
const cheaper = { balance: 200_000, currentRate: 5.5, newRate: 4.5, termYears: 25, productFee: 999 };

describe('the saving in cash and in balance owed', () => {
    it('splits the net saving into payments saved and the lower balance, which add up exactly', () => {
        const result = calculateRemortgage({ ...cheaper, earlyRepaymentCharge: 1_000 })!;
        // What a simple calculator shows: 24 × 116.51 − 1,999.
        expect(result.paymentSaving).toBe(797.24);
        expect(result.balanceDifference).toBe(1_180.96);
        expect(result.netSaving).toBe(1_978.2);
        expect(result.paymentSaving + result.balanceDifference).toBeCloseTo(result.netSaving, 10);
    });

    it('keeps the identity whichever way the fee is paid, and for a dearer deal', () => {
        const inputs: RemortgageInput[] = [
            { ...cheaper, earlyRepaymentCharge: 1_000 },
            { ...cheaper, earlyRepaymentCharge: 1_000, feePayment: 'add-to-loan' },
            { ...cheaper, earlyRepaymentCharge: 4_000, fixedYears: 5 },
            { ...cheaper, productFee: 1_499.5, feePayment: 'add-to-loan', termYears: 1, termMonths: 7 },
            { ...deal, currentRate: 3, newRate: 3.5, productFee: 500 },
        ];
        for (const input of inputs) {
            const result = calculateRemortgage(input)!;
            const pennies = (value: number) => Math.round(value * 100);
            expect(pennies(result.paymentSaving) + pennies(result.balanceDifference)).toBe(pennies(result.netSaving));
        }
    });

    it('does not count a fee added to the loan as cash paid: it is owed instead', () => {
        const added = calculateRemortgage({ ...cheaper, earlyRepaymentCharge: 1_000, feePayment: 'add-to-loan' })!;
        // 24 × 110.95 less only the £1,000 charge; the £999 fee shows up in the balance.
        expect(added).toMatchObject({ monthlySaving: 110.95, paymentSaving: 1_662.8, balanceDifference: 227.41 });
        expect(added.netSaving).toBe(1_890.21);
    });
});

describe('a break-even after the comparison period', () => {
    const late = { ...cheaper, earlyRepaymentCharge: 4_000 };

    it('is still found, and flagged as outside the period', () => {
        const result = calculateRemortgage(late)!;
        expect(result).toMatchObject({ comparisonMonths: 24, breakEvenMonths: 31, breakEvenWithinPeriod: false });
        expect(result.netSaving).toBe(-1_021.8);

        expect(calculateRemortgage({ ...late, fixedYears: 3 })!.breakEvenWithinPeriod).toBe(true);
        expect(calculateRemortgage({ ...cheaper, earlyRepaymentCharge: 1_000 })).toMatchObject({
            breakEvenMonths: 13,
            breakEvenWithinPeriod: true,
        });
        // Free to switch: covered from the start. Never covered: not within the period either.
        expect(calculateRemortgage(deal)).toMatchObject({ breakEvenMonths: 0, breakEvenWithinPeriod: true });
        expect(calculateRemortgage({ ...deal, newRate: 6, productFee: 999 })!.breakEvenWithinPeriod).toBe(false);
    });

    it('says so beside the negative net saving', () => {
        const { summary } = getRemortgageSummary(late);
        expect(summary!.formatted).toMatchObject({
            breakEvenMonths: '2 years 7 months (after the 2-year period)',
            netSaving: '-£1,021.80',
        });
        expect(getRemortgageSummary({ ...late, fixedYears: 3 }).summary!.formatted.breakEvenMonths).toBe(
            '2 years 7 months',
        );
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

    it('shows the savings to the penny so they add up on screen, under labels that say what they are', () => {
        const { summary } = getRemortgageSummary({ ...cheaper, earlyRepaymentCharge: 1_000 });
        expect(summary!.formatted).toMatchObject({
            switchingCost: '£1,999',
            newLoan: '£200,000',
            interestSaved: '£3,977.20',
            paymentSaving: '£797.24',
            balanceDifference: '£1,180.96',
            netSaving: '£1,978.20',
        });
        expect(REMORTGAGE_LABELS).toMatchObject({
            breakEvenMonths: 'Time until interest saved covers the cost',
            paymentSaving: 'Payments saved over the fixed period, less costs paid in cash',
            balanceDifference: 'Less owed when the fixed period ends',
            netSaving: 'Net saving including the lower balance owed',
        });
        expect(summary!.rows.map((row) => row.key)).toEqual(Object.keys(REMORTGAGE_LABELS));
        // A balance that ends a little higher is a minus, never "-£0.00".
        const dearer = getRemortgageSummary({ ...deal, currentRate: 3, newRate: 3.5 }).summary!;
        expect(Object.values(dearer.formatted).some((text) => /-£?0(\.00)?$/.test(text))).toBe(false);
    });
});
