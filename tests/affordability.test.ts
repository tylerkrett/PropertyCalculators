import { describe, expect, it } from 'vitest';

import {
    AFFORDABILITY_DEFAULTS,
    AFFORDABILITY_LABELS,
    AFFORDABILITY_LIMITS,
    affordabilityInputError,
    calculateAffordability,
    calculateIncomeNeeded,
    getAffordabilitySummary,
    incomeNeededInputError,
    type AffordabilityInput,
} from '../src/affordability/index';
import { calculateMortgage } from '../src/mortgage/index';

const base: AffordabilityInput = { income: 60_000, deposit: 30_000, rate: 5, termYears: 25 };

describe('calculateAffordability', () => {
    it('lends 4.5 times income by default', () => {
        const result = calculateAffordability(base)!;
        expect(result.totalIncome).toBe(60_000);
        expect(result.countedIncome).toBe(60_000);
        expect(result.maxLoan).toBe(270_000);
        expect(result.maxPrice).toBe(300_000);
        expect(result.ltv).toBe(90);
        // Home mover at £300,000: 2% of £125,000 plus 5% of £50,000.
        expect(result.stampDuty).toBe(5_000);
        expect(result.cashUpfront).toBe(35_000);
    });

    it('adds a second income for joint applicants', () => {
        const result = calculateAffordability({
            income: 80_000,
            secondIncome: 20_000,
            deposit: 100_000,
            incomeMultiple: 4,
            rate: 5,
            termYears: 25,
        })!;
        expect(result.totalIncome).toBe(100_000);
        expect(result.maxLoan).toBe(400_000);
        expect(result.maxPrice).toBe(500_000);
        expect(result.ltv).toBe(80);
        // £400k over 25 years at 5%: a widely published £2,338.36 a month.
        expect(result.monthlyPayment).toBe(2338.36);
        expect(result.stampDuty).toBe(15_000);
        expect(result.cashUpfront).toBe(115_000);
    });

    it('takes a year of commitments off the income before multiplying', () => {
        const result = calculateAffordability({ ...base, monthlyCommitments: 500 })!;
        expect(result.totalIncome).toBe(60_000);
        expect(result.countedIncome).toBe(54_000);
        expect(result.maxLoan).toBe(243_000);
        expect(result.maxPrice).toBe(273_000);
    });

    it('stresses the repayment at the rate plus the buffer, as a share of gross monthly income', () => {
        const result = calculateAffordability(base)!;
        const mortgage = { price: 300_000, deposit: 30_000, termYears: 25, type: 'repayment' } as const;
        expect(result.stressedRate).toBe(8);
        expect(result.monthlyPayment).toBe(calculateMortgage({ ...mortgage, rate: 5 })!.monthlyPayment);
        expect(result.stressedPayment).toBe(calculateMortgage({ ...mortgage, rate: 8 })!.monthlyPayment);
        // £270k over 25 years: £1,578.39 at 5% and £2,083.90 at 8%, against £5,000 a month of income.
        expect(result.monthlyPayment).toBe(1578.39);
        expect(result.stressedPayment).toBe(2083.9);
        expect(result.stressedPaymentShare).toBe(41.68);
        expect(calculateAffordability({ ...base, stressBuffer: 1 })!.stressedRate).toBe(6);
    });

    it('splits the loan evenly at 0%', () => {
        const result = calculateAffordability({ ...base, rate: 0, stressBuffer: 0 })!;
        expect(result.monthlyPayment).toBe(900);
        expect(result.stressedPayment).toBe(900);
        expect(result.stressedPaymentShare).toBe(18);
        expect(calculateAffordability({ ...base, rate: 0 })!.stressedRate).toBe(3);
    });

    it('works without a deposit and uses the buyer type for stamp duty', () => {
        expect(calculateAffordability({ ...base, deposit: 0 })).toMatchObject({ maxPrice: 270_000, ltv: 100 });
        expect(calculateAffordability({ ...base, buyer: 'first-time-buyer' })!.stampDuty).toBe(0);
        expect(calculateAffordability({ ...base, buyer: 'additional-property' })!.stampDuty).toBe(20_000);
    });

    it('rounds the loan down to the pound, without floating-point drift', () => {
        expect(calculateAffordability({ ...base, income: 100_000, incomeMultiple: 4.45 })!.maxLoan).toBe(445_000);
        expect(calculateAffordability({ ...base, income: 33_333, incomeMultiple: 4.5 })!.maxLoan).toBe(149_998);
    });

    it('survives a trip through JSON', () => {
        const { summary } = getAffordabilitySummary(base);
        expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    });
});

describe('affordabilityInputError', () => {
    it("rejects input it can't calculate", () => {
        expect(affordabilityInputError(base)).toBeNull();
        expect(affordabilityInputError({ ...base, income: 0 })).toMatch(/income/);
        expect(affordabilityInputError({ ...base, income: NaN })).toMatch(/income/);
        expect(affordabilityInputError({ ...base, secondIncome: -1 })).toMatch(/second applicant/);
        expect(affordabilityInputError({ ...base, monthlyCommitments: -1 })).toMatch(/commitments/);
        expect(affordabilityInputError({ ...base, deposit: -1 })).toMatch(/deposit/);
        expect(affordabilityInputError({ ...base, incomeMultiple: 0.5 })).toMatch(/income multiple between 1 and 6/);
        expect(affordabilityInputError({ ...base, incomeMultiple: 6.5 })).toMatch(/income multiple/);
        expect(affordabilityInputError({ ...base, rate: 30 })).toMatch(/interest rate/);
        expect(affordabilityInputError({ ...base, termYears: 2.5 })).toMatch(/term/);
        expect(affordabilityInputError({ ...base, stressBuffer: 11 })).toMatch(/stress buffer/);
        expect(affordabilityInputError({ ...base, rate: 24 })).toMatch(/25% or less/);
        expect(affordabilityInputError({ ...base, monthlyCommitments: 5_000 })).toMatch(/nothing to borrow/);
        expect(affordabilityInputError({ ...base, income: 1e9 })).toMatch(/lower income/);
        expect(calculateAffordability({ ...base, income: 0 })).toBeNull();
    });

    it('accepts the limits themselves', () => {
        const { incomeMultiple } = AFFORDABILITY_LIMITS;
        expect(affordabilityInputError({ ...base, incomeMultiple: incomeMultiple.min })).toBeNull();
        expect(affordabilityInputError({ ...base, incomeMultiple: incomeMultiple.max })).toBeNull();
        expect(AFFORDABILITY_DEFAULTS).toMatchObject({ incomeMultiple: 4.5, stressBuffer: 3, buyer: 'home-mover' });
    });
});

describe('getAffordabilitySummary', () => {
    it('gives every figure a display string and a labelled row', () => {
        const { summary, error } = getAffordabilitySummary(base);
        expect(error).toBeNull();
        expect(summary!.formatted).toEqual({
            maxPrice: '£300,000',
            maxLoan: '£270,000',
            deposit: '£30,000',
            ltv: '90%',
            totalIncome: '£60,000',
            countedIncome: '£60,000',
            monthlyPayment: '£1,578.39',
            stressedRate: '8%',
            stressedPayment: '£2,083.90',
            stressedPaymentShare: '41.68%',
            stampDuty: '£5,000',
            cashUpfront: '£35,000',
        });
        expect(summary!.rows.map((row) => row.key)).toEqual(Object.keys(AFFORDABILITY_LABELS));
        expect(summary!.rows[0]).toEqual({
            key: 'maxPrice',
            label: 'Maximum property price',
            value: 300_000,
            formatted: '£300,000',
        });
    });

    it('returns the form error instead of a summary', () => {
        expect(getAffordabilitySummary({ ...base, rate: 30 })).toEqual({
            summary: null,
            error: 'Enter an interest rate between 0% and 25%.',
        });
    });
});

describe('calculateIncomeNeeded', () => {
    it('divides the loan by the income multiple', () => {
        expect(calculateIncomeNeeded({ price: 300_000, deposit: 30_000 })).toEqual({
            loan: 270_000,
            ltv: 90,
            incomeNeeded: 60_000,
            formatted: { loan: '£270,000', ltv: '90%', incomeNeeded: '£60,000' },
        });
        expect(calculateIncomeNeeded({ price: 500_000, deposit: 100_000, incomeMultiple: 4 })!.incomeNeeded).toBe(
            100_000,
        );
    });

    it('adds a year of commitments and rounds up to the pound', () => {
        expect(calculateIncomeNeeded({ price: 300_000, deposit: 30_000, monthlyCommitments: 500 })!.incomeNeeded).toBe(
            66_000,
        );
        // £400,000 ÷ 4.5 is £88,888.89.
        expect(calculateIncomeNeeded({ price: 500_000, deposit: 100_000 })!.incomeNeeded).toBe(88_889);
    });

    it('is the reverse of calculateAffordability', () => {
        const cases = [
            { price: 300_000, deposit: 30_000 },
            { price: 500_000, deposit: 100_000 },
            { price: 425_500, deposit: 37_250, monthlyCommitments: 315, incomeMultiple: 4.45 },
            { price: 1_234_567, deposit: 123_456, monthlyCommitments: 1_000, incomeMultiple: 5.5 },
            { price: 185_000, deposit: 0, incomeMultiple: 3 },
        ];
        for (const target of cases) {
            const { loan, incomeNeeded } = calculateIncomeNeeded(target)!;
            const forward = { ...target, rate: 5, termYears: 25 };
            // The income needed is enough, and a pound less is not.
            const enough = calculateAffordability({ ...forward, income: incomeNeeded })!;
            expect(enough.maxLoan).toBeGreaterThanOrEqual(loan);
            expect(enough.maxPrice).toBeGreaterThanOrEqual(target.price);
            expect(enough.maxLoan - loan).toBeLessThan(forward.incomeMultiple ?? 4.5);
            expect(calculateAffordability({ ...forward, income: incomeNeeded - 1 })!.maxLoan).toBeLessThan(loan);
        }
    });

    it("rejects input it can't calculate", () => {
        const target = { price: 300_000, deposit: 30_000 };
        expect(incomeNeededInputError(target)).toBeNull();
        expect(incomeNeededInputError({ ...target, price: 0 })).toMatch(/price/);
        expect(incomeNeededInputError({ ...target, deposit: -1 })).toMatch(/deposit/);
        expect(incomeNeededInputError({ ...target, deposit: 300_000 })).toMatch(/nothing to borrow/);
        expect(incomeNeededInputError({ ...target, monthlyCommitments: NaN })).toMatch(/commitments/);
        expect(incomeNeededInputError({ ...target, incomeMultiple: 7 })).toMatch(/income multiple/);
        expect(calculateIncomeNeeded({ ...target, incomeMultiple: 7 })).toBeNull();
    });
});
