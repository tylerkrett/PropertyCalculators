import { describe, expect, it } from 'vitest';

import {
    calculateLandlordIncome,
    getLandlordIncomeSummary,
    LANDLORD_INCOME_DEFAULTS,
    LANDLORD_INCOME_LABELS,
    LANDLORD_INCOME_LIMITS,
    LANDLORD_INCOME_NOTICE,
    type LandlordIncomeInput,
    landlordIncomeInputError,
} from '../src/landlord-income/index';

// £1,000 a month is £12,000 a year. Fee 10% = £1,200, plus VAT £240. Insurance £360 and repairs
// £1,200 make expenses £3,000 and profit £9,000. With a £30,000 salary the profit is all basic
// rate: £9,000 at 20% = £1,800. Interest £4,000 at 20% is a £800 credit, so tax is £1,000.
// Net: £9,000 - £4,000 - £1,000 = £4,000.
const base: LandlordIncomeInput = {
    rent: 1_000,
    managementFeePercent: 10,
    insurance: 360,
    maintenance: 1_200,
    mortgageInterest: 4_000,
    otherIncome: 30_000,
};

describe('landlordIncomeInputError', () => {
    it('explains what is missing or out of range', () => {
        const error = (change: object) => landlordIncomeInputError({ ...base, ...change } as LandlordIncomeInput);
        expect(error({})).toBeNull();
        expect(error({ rent: 0 })).toBe('Enter the rent.');
        expect(error({ rent: 2e9 })).toBe('Enter a lower rent.');
        expect(error({ rentPeriod: 'day' })).toBe('Choose whether the rent is weekly, monthly or yearly.');
        expect(error({ voidWeeks: 53 })).toBe('Empty weeks must be between 0 and 52.');
        expect(error({ managementFeePercent: 101 })).toBe('Enter a management fee between 0% and 100%.');
        expect(error({ feesIncludeVat: 'yes' })).toBe('Choose whether the management fee includes VAT.');
        expect(error({ mortgageInterest: -1 })).toBe('Enter the yearly mortgage interest, or leave it at 0.');
        expect(error({ groundRent: -5 })).toBe('Enter the ground rent, or leave it at 0.');
        expect(error({ otherIncome: Infinity })).toBe('Enter your other yearly income, or leave it at 0.');
        expect(error({ taxYear: '2025-26' })).toBe('Choose the tax year.');
        expect(error({ taxYear: 'constructor' })).toBe('Choose the tax year.');
    });

    it('never throws on hostile input, and never calculates from it', () => {
        const hostile: unknown[] = [undefined, null, 42, 'rent', [], () => 1, {}, { rent: '1000' }, { rent: NaN }];
        hostile.push({ rent: Infinity }, { rent: -1 }, { rent: [1_000] }, { rent: 1_000, rentPeriod: null });
        for (const key of [
            'voidWeeks',
            'managementFeePercent',
            'mortgageInterest',
            'insurance',
            'otherCosts',
            'otherIncome',
        ])
            for (const value of [NaN, Infinity, -Infinity, -1, '5', null, {}, [], true])
                hostile.push({ rent: 1_000, [key]: value });
        hostile.push(
            { rent: 1_000, feesIncludeVat: 1 },
            { rent: 1_000, taxYear: '__proto__' },
            { rent: 1_000, taxYear: 2026 },
        );
        for (const input of hostile) {
            expect(typeof landlordIncomeInputError(input as LandlordIncomeInput)).toBe('string');
            expect(calculateLandlordIncome(input as LandlordIncomeInput)).toBeNull();
            const { summary, error } = getLandlordIncomeSummary(input as LandlordIncomeInput);
            expect(summary).toBeNull();
            expect(error).toBe(landlordIncomeInputError(input as LandlordIncomeInput));
        }
    });

    it('states its defaults and limits', () => {
        expect(LANDLORD_INCOME_DEFAULTS).toEqual({
            rentPeriod: 'month',
            voidWeeks: 0,
            managementFeePercent: 0,
            feesIncludeVat: false,
            cost: 0,
            taxYear: '2026-27',
        });
        expect(LANDLORD_INCOME_LIMITS.voidWeeks).toEqual({ min: 0, max: 52 });
        expect(LANDLORD_INCOME_LIMITS.managementFeePercent).toEqual({ min: 0, max: 100 });
    });
});

describe('getLandlordIncomeSummary', () => {
    it('formats every figure and lists them as labelled rows, net income first', () => {
        const { summary, error } = getLandlordIncomeSummary(base);
        expect(error).toBeNull();
        expect(summary!.formatted).toEqual({
            netIncome: '£4,000',
            netMonthly: '£333.33',
            rentCollected: '£12,000',
            voidLoss: '£0',
            managementFee: '£1,200',
            managementFeeVat: '£240',
            expenses: '£3,000',
            profitBeforeFinance: '£9,000',
            financeCosts: '£4,000',
            taxBeforeCredit: '£1,800',
            financeCredit: '£800',
            tax: '£1,000',
            unusedFinanceCosts: '£0',
            effectiveTaxRate: '11.11%',
        });
        expect(summary!.rows.map((row) => row.key)).toEqual(Object.keys(LANDLORD_INCOME_LABELS));
        expect(summary!.rows[0]).toEqual({
            key: 'netIncome',
            label: 'Net income per year',
            value: 4_000,
            formatted: '£4,000',
        });
        expect(summary!.notes).toEqual([]);
    });

    it('writes a loss with the sign ahead of the pound', () => {
        const { summary } = getLandlordIncomeSummary({ rent: 500, maintenance: 8_000, mortgageInterest: 3_000 });
        expect(summary!.formatted).toMatchObject({
            profitBeforeFinance: '-£2,000',
            netIncome: '-£5,000',
            netMonthly: '-£416.67',
        });
    });

    it('says what it leaves out', () => {
        for (const text of ['Scottish', '£1,000 property allowance', 'companies', 'furnished holiday lets'])
            expect(LANDLORD_INCOME_NOTICE).toContain(text);
        for (const text of ['National Insurance', 'joint owners', 'A guide only, not tax advice.'])
            expect(LANDLORD_INCOME_NOTICE).toContain(text);
    });
});
