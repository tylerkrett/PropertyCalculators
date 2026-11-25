import { describe, expect, it } from 'vitest';

import {
    calculateLandlordIncome,
    LANDLORD_COSTS,
    LANDLORD_VAT_RATE,
    type LandlordIncomeInput,
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

describe('calculateLandlordIncome', () => {
    it('works out every step for a basic-rate landlord', () => {
        expect(calculateLandlordIncome(base)).toEqual({
            taxYear: '2026-27',
            annualRent: 12_000,
            voidLoss: 0,
            rentCollected: 12_000,
            managementFee: 1_200,
            managementFeeVat: 240,
            expenses: 3_000,
            profitBeforeFinance: 9_000,
            financeCosts: 4_000,
            taxBeforeCredit: 1_800,
            financeCredit: 800,
            financeCreditBasis: 'finance-costs',
            tax: 1_000,
            netIncome: 4_000,
            // £4,000 ÷ 12.
            netMonthly: 333.33,
            unusedFinanceCosts: 0,
            // £1,000 of tax on £9,000 of profit.
            effectiveTaxRate: 11.11,
            notes: [],
        });
    });

    it('takes empty weeks off the rent before the fee, to the penny', () => {
        // £1,200 a month is £14,400. Two empty weeks: £14,400 × 50 ÷ 52 = £13,846.15, so £553.85 is lost.
        // Fee 10% = £1,384.62, VAT £276.92. With £300 and £900 of costs, expenses are £2,861.54.
        // Profit £10,984.61 at 20% = £2,196.92. Credit £6,000 at 20% = £1,200. Tax £996.92.
        // Net: £10,984.61 - £6,000 - £996.92 = £3,987.69.
        const result = calculateLandlordIncome({
            rent: 1_200,
            voidWeeks: 2,
            managementFeePercent: 10,
            insurance: 300,
            maintenance: 900,
            mortgageInterest: 6_000,
            otherIncome: 30_000,
        })!;
        expect(result).toMatchObject({ rentCollected: 13_846.15, voidLoss: 553.85 });
        expect(result).toMatchObject({ managementFee: 1_384.62, managementFeeVat: 276.92, expenses: 2_861.54 });
        expect(result).toMatchObject({ profitBeforeFinance: 10_984.61, taxBeforeCredit: 2_196.92, tax: 996.92 });
        expect(result).toMatchObject({ netIncome: 3_987.69, netMonthly: 332.31, effectiveTaxRate: 9.08 });
    });

    it('works out a higher-rate landlord, with a fee quoted including VAT', () => {
        // £1,500 a month is £18,000. 12% including VAT is £2,160: £1,800 of fee and £360 of VAT.
        // Insurance £400 and service charge £1,200 make expenses £3,760 and profit £14,240.
        // Salary £60,000 is past £50,270, so £14,240 at 40% = £5,696. Credit £9,000 at 20% = £1,800.
        // Tax £3,896. Net: £14,240 - £9,000 - £3,896 = £1,344.
        const result = calculateLandlordIncome({
            rent: 1_500,
            managementFeePercent: 12,
            feesIncludeVat: true,
            insurance: 400,
            serviceCharge: 1_200,
            mortgageInterest: 9_000,
            otherIncome: 60_000,
        })!;
        expect(result).toMatchObject({ managementFee: 1_800, managementFeeVat: 360, expenses: 3_760 });
        expect(result).toMatchObject({ profitBeforeFinance: 14_240, taxBeforeCredit: 5_696, financeCredit: 1_800 });
        expect(result).toMatchObject({ tax: 3_896, netIncome: 1_344, netMonthly: 112, effectiveTaxRate: 27.36 });
    });

    it('works out a landlord whose rent crosses the higher-rate threshold', () => {
        // Profit £18,000 on a £45,000 salary: £5,270 at 20% (£1,054) and £12,730 at 40% (£5,092) = £6,146.
        // Credit £7,000 at 20% = £1,400. Tax £4,746. Net: £18,000 - £7,000 - £4,746 = £6,254.
        const result = calculateLandlordIncome({ rent: 1_500, mortgageInterest: 7_000, otherIncome: 45_000 })!;
        expect(result).toMatchObject({ taxBeforeCredit: 6_146, financeCredit: 1_400, tax: 4_746, netIncome: 6_254 });
        expect(result.notes).toEqual([]);
    });

    it('works out a landlord in the personal allowance taper, and says so', () => {
        // Profit £24,000 on a £95,000 salary takes total income to £119,000 and the allowance to £3,070.
        // Tax on £119,000 is £38,832 and on £95,000 is £25,432: £13,400 for the property (see the tax tests).
        // Credit £10,000 at 20% = £2,000. Tax £11,400. Net: £24,000 - £10,000 - £11,400 = £2,600.
        const result = calculateLandlordIncome({ rent: 2_000, mortgageInterest: 10_000, otherIncome: 95_000 })!;
        expect(result).toMatchObject({ taxBeforeCredit: 13_400, financeCredit: 2_000, tax: 11_400, netIncome: 2_600 });
        expect(result.effectiveTaxRate).toBe(47.5);
        expect(result.notes).toEqual([
            'Total income is over £100,000, so the personal allowance is reduced to £3,070.',
        ]);
    });

    it('limits the credit to the finance costs (a), the profit (b) or income above the allowance (c)', () => {
        // (a) The base case: £4,000 of interest is the lowest of £4,000, £9,000 and £26,430.
        expect(calculateLandlordIncome(base)).toMatchObject({
            financeCreditBasis: 'finance-costs',
            financeCredit: 800,
        });

        // (b) Rent £12,000 less £6,000 of repairs is £6,000 of profit; interest is £9,000; salary £30,000.
        // Lowest of £9,000, £6,000 and £23,430 is the profit: credit £1,200 wipes out the £1,200 of tax.
        // £3,000 of interest is carried forward. Net: £6,000 - £9,000 - £0 = -£3,000.
        const b = calculateLandlordIncome({
            rent: 1_000,
            maintenance: 6_000,
            mortgageInterest: 9_000,
            otherIncome: 30_000,
        })!;
        expect(b).toMatchObject({
            financeCreditBasis: 'property-profits',
            taxBeforeCredit: 1_200,
            financeCredit: 1_200,
        });
        expect(b).toMatchObject({ tax: 0, unusedFinanceCosts: 3_000, netIncome: -3_000, netMonthly: -250 });
        expect(b.notes).toEqual([
            'The tax credit is limited to the rental profit of £6,000, so £3,000 of finance costs earn no credit this year and are carried forward.',
            'After mortgage interest and tax, the property costs £3,000 a year to hold.',
        ]);

        // (c) Profit £12,000 with £5,000 of other income: £17,000 - £12,570 = £4,430 is above the allowance.
        // Lowest of £9,000, £12,000 and £4,430 is (c): tax £886, credit £886, £4,570 carried forward.
        const c = calculateLandlordIncome({ rent: 1_000, mortgageInterest: 9_000, otherIncome: 5_000 })!;
        expect(c).toMatchObject({
            financeCreditBasis: 'adjusted-total-income',
            taxBeforeCredit: 886,
            financeCredit: 886,
        });
        expect(c).toMatchObject({ tax: 0, unusedFinanceCosts: 4_570, netIncome: 3_000 });
        expect(c.notes).toEqual([
            'The tax credit is limited to the £4,430 of income above the personal allowance, so £4,570 of finance costs earn no credit this year and are carried forward.',
        ]);
    });

    it('gives a loss no tax, and notes what is carried forward', () => {
        // Rent £6,000 less £8,000 of repairs is a £2,000 loss. Net: -£2,000 - £3,000 = -£5,000.
        const loss = calculateLandlordIncome({
            rent: 500,
            maintenance: 8_000,
            mortgageInterest: 3_000,
            otherIncome: 30_000,
        })!;
        expect(loss).toMatchObject({ profitBeforeFinance: -2_000, taxBeforeCredit: 0, financeCredit: 0, tax: 0 });
        expect(loss).toMatchObject({ unusedFinanceCosts: 3_000, netIncome: -5_000, effectiveTaxRate: 0 });
        expect(loss.notes).toEqual([
            'The property makes a loss of £2,000 before finance costs, so there is no income tax on it. The loss is carried forward against later rental profits and cannot reduce the tax on other income.',
            'With no rental profit, the £3,000 of finance costs earn no tax credit this year and are carried forward.',
            'After mortgage interest and tax, the property costs £5,000 a year to hold.',
        ]);
        // A year standing empty collects nothing.
        expect(calculateLandlordIncome({ rent: 1_000, voidWeeks: 52 })).toMatchObject({
            rentCollected: 0,
            tax: 0,
            netIncome: 0,
        });
    });

    it('reads weekly and yearly rent as the other lettings calculators do', () => {
        expect(calculateLandlordIncome({ rent: 300, rentPeriod: 'week' })!.annualRent).toBe(15_600);
        expect(calculateLandlordIncome({ rent: 15_600, rentPeriod: 'year' })!.annualRent).toBe(15_600);
        // With no other income: £12,000 is inside the allowance, so no tax.
        expect(calculateLandlordIncome({ rent: 1_000 })).toMatchObject({
            tax: 0,
            netIncome: 12_000,
            netMonthly: 1_000,
        });
    });

    it('adds every named cost, and VAT only to the fee', () => {
        const costs = { insurance: 100, maintenance: 200, serviceCharge: 300, groundRent: 400, otherCosts: 500 };
        expect(calculateLandlordIncome({ rent: 1_000, ...costs })!.expenses).toBe(1_500);
        expect(LANDLORD_COSTS.map((cost) => cost.key)).toEqual(Object.keys(costs));
        expect(LANDLORD_VAT_RATE).toBe(20);
    });

    it('uses the 2027 to 2028 property rates when asked, and flags them as announced', () => {
        // The base case at 24%: £9,000 × 24% = £2,160. Credit £4,000 × 24% = £960. Tax £1,200. Net £3,800.
        const result = calculateLandlordIncome({ ...base, taxYear: '2027-28' })!;
        expect(result).toMatchObject({ taxBeforeCredit: 2_160, financeCredit: 960, tax: 1_200, netIncome: 3_800 });
        expect(result.notes).toEqual([
            'The 2027 to 2028 property rates of 24%, 44% and 49% were announced at Budget 2026 and are not yet law. Finance Act 2026 set 22%, 42% and 47%.',
        ]);
    });
});
