import { describe, expect, it } from 'vitest';

import {
    calculateMortgage,
    depositFromPercent,
    depositPercentOf,
    getMortgageSummary,
    mortgageInputError,
    type MortgageInput,
} from '../src/mortgage/index';

const base: MortgageInput = { price: 500_000, deposit: 100_000, rate: 5, termYears: 25, type: 'repayment' };

describe('calculateMortgage', () => {
    it('matches the annuity formula for a repayment mortgage', () => {
        const result = calculateMortgage(base)!;
        expect(result.loan).toBe(400_000);
        expect(result.ltv).toBe(80);
        // £400k over 25 years at 5%: a widely published £2,338.36 a month.
        expect(result.monthlyPayment).toBe(2338.36);
        expect(result.totalRepaid).toBeCloseTo(2338.36 * 300, -1);
        expect(result.totalInterest).toBeCloseTo(result.totalRepaid - 400_000, 1);
    });

    it('charges only interest monthly on an interest-only mortgage, repaying the loan at the end', () => {
        const result = calculateMortgage({ ...base, type: 'interest-only' })!;
        expect(result.monthlyPayment).toBeCloseTo(1666.67, 2);
        expect(result.totalInterest).toBe(500_000);
        expect(result.totalRepaid).toBe(900_000);
    });

    it('splits the loan evenly at 0%', () => {
        const result = calculateMortgage({ ...base, rate: 0, termYears: 20 })!;
        expect(result.monthlyPayment).toBeCloseTo(1666.67, 2);
        expect(result.totalInterest).toBeCloseTo(0, 0);
    });

    it("rejects input it can't calculate", () => {
        expect(calculateMortgage({ ...base, deposit: 500_000 })).toBeNull();
        expect(mortgageInputError({ ...base, deposit: 500_000 })).toMatch(/nothing to borrow/);
        expect(mortgageInputError({ ...base, price: 0 })).toMatch(/price/);
        expect(mortgageInputError({ ...base, deposit: -1 })).toMatch(/deposit/);
        expect(mortgageInputError({ ...base, rate: 30 })).toMatch(/interest rate/);
        expect(mortgageInputError({ ...base, termYears: 2.5 })).toMatch(/term/);
        expect(mortgageInputError({ ...base, termYears: 41 })).toMatch(/term/);
        expect(mortgageInputError(base)).toBeNull();
    });
});

describe('deposit helpers', () => {
    it('converts between pounds and percent', () => {
        expect(depositFromPercent(1_250_000, 10)).toBe(125_000);
        expect(depositFromPercent(333_333, 15)).toBe(50_000);
        expect(depositPercentOf(1_250_000, 125_000)).toBe(10);
        expect(depositPercentOf(300_000, 100_000)).toBe(33.33);
        expect(depositPercentOf(0, 1)).toBe(0);
    });
});

describe('getMortgageSummary', () => {
    it('adds stamp duty and the cash needed upfront, with display strings', () => {
        const { summary, error } = getMortgageSummary(base);
        expect(error).toBeNull();
        expect(summary).toMatchObject({ stampDuty: 15_000, cashUpfront: 115_000, monthlyPayment: 2338.36 });
        expect(summary!.formatted).toMatchObject({
            monthlyPayment: '£2,338.36',
            loan: '£400,000',
            ltv: '80%',
            stampDuty: '£15,000',
            cashUpfront: '£115,000',
        });
        expect(summary!.rows[0]).toEqual({
            key: 'monthlyPayment',
            label: 'Monthly payment',
            value: 2338.36,
            formatted: '£2,338.36',
        });
    });

    it('uses the buyer type for stamp duty', () => {
        expect(getMortgageSummary({ ...base, buyer: 'first-time-buyer' }).summary!.stampDuty).toBe(10_000);
        expect(getMortgageSummary({ ...base, buyer: 'additional-property' }).summary!.stampDuty).toBe(40_000);
    });

    it('returns the form error instead of a summary', () => {
        expect(getMortgageSummary({ ...base, rate: 30 })).toEqual({
            summary: null,
            error: 'Enter an interest rate between 0% and 25%.',
        });
    });

    it('returns an error for an unknown buyer type instead of throwing', () => {
        expect(getMortgageSummary({ ...base, buyer: 'x' as never })).toEqual({
            summary: null,
            error: 'Choose the type of buyer.',
        });
        // The mortgage itself does not depend on the buyer.
        expect(mortgageInputError({ ...base, buyer: 'x' } as never)).toBeNull();
    });
});
