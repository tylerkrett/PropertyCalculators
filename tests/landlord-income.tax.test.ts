import { describe, expect, it } from 'vitest';

import {
    CURRENT_LANDLORD_TAX_YEAR,
    incomeTax,
    isLandlordTaxYear,
    LANDLORD_TAX_YEAR_OPTIONS,
    LANDLORD_TAX_YEARS,
    personalAllowance,
    type LandlordTaxYear,
    propertyIncomeTax,
} from '../src/landlord-income/index';

const Y26 = LANDLORD_TAX_YEARS['2026-27'];
const Y27 = LANDLORD_TAX_YEARS['2027-28'];
/** To the penny, so floating point noise in the last digit is not a failure. */
const pence = (value: number) => Math.round(value * 100) / 100;
const taxOf = (otherIncome: number, profit: number, financeCosts = 0, year: LandlordTaxYear = Y26) => {
    const { taxBeforeCredit, financeCredit, tax, unusedFinanceCosts, financeCreditBasis } = propertyIncomeTax(
        { otherIncome, profit, financeCosts },
        year,
    );
    return {
        taxBeforeCredit: pence(taxBeforeCredit),
        financeCredit: pence(financeCredit),
        tax: pence(tax),
        unusedFinanceCosts: pence(unusedFinanceCosts),
        financeCreditBasis,
    };
};

describe('the tax-year table', () => {
    it('holds the 2026 to 2027 figures GOV.UK publishes', () => {
        expect(Y26).toEqual({
            label: '2026 to 2027',
            personalAllowance: 12_570,
            allowanceTaperThreshold: 100_000,
            basicRateBand: 37_700,
            additionalRateThreshold: 125_140,
            mainRates: { basic: 20, higher: 40, additional: 45 },
            propertyRates: { basic: 20, higher: 40, additional: 45 },
            financeCreditRate: 20,
            legislated: true,
        });
        // The basic rate band ends at £50,270 of income.
        expect(Y26.personalAllowance + Y26.basicRateBand).toBe(50_270);
    });

    it('gives property income its own rates from 2027 to 2028, marked as announced', () => {
        expect(Y27.mainRates).toEqual(Y26.mainRates);
        expect(Y27.propertyRates).toEqual({ basic: 24, higher: 44, additional: 49 });
        expect(Y27.financeCreditRate).toBe(Y27.propertyRates.basic);
        expect(Y27.legislated).toBe(false);
        expect(Y27.personalAllowance).toBe(12_570);
    });

    it('defaults to the tax year in force and lists both as options', () => {
        expect(CURRENT_LANDLORD_TAX_YEAR).toBe('2026-27');
        expect(LANDLORD_TAX_YEAR_OPTIONS).toEqual([
            { value: '2026-27', label: '2026 to 2027' },
            { value: '2027-28', label: '2027 to 2028' },
        ]);
        expect(isLandlordTaxYear('2027-28')).toBe(true);
        for (const value of ['2025-26', 'constructor', '__proto__', 2026, null, undefined, {}])
            expect(isLandlordTaxYear(value)).toBe(false);
    });
});

describe('personalAllowance', () => {
    it('falls by £1 for every £2 above £100,000 and is gone at £125,140', () => {
        expect(personalAllowance(50_000, Y26)).toBe(12_570);
        expect(personalAllowance(100_000, Y26)).toBe(12_570);
        // £10,000 over, so £5,000 is lost.
        expect(personalAllowance(110_000, Y26)).toBe(7_570);
        expect(personalAllowance(125_140, Y26)).toBe(0);
        expect(personalAllowance(200_000, Y26)).toBe(0);
    });
});

describe('incomeTax', () => {
    it('matches the bands on GOV.UK', () => {
        expect(incomeTax(12_570, 0, Y26)).toBe(0);
        // £37,700 at 20%.
        expect(incomeTax(50_270, 0, Y26)).toBe(7_540);
        // £7,540, then £49,730 at 40% = £19,892.
        expect(incomeTax(100_000, 0, Y26)).toBe(27_432);
        // No allowance: £7,540 + £87,440 at 40% (£34,976) + £24,860 at 45% (£11,187).
        expect(incomeTax(150_000, 0, Y26)).toBe(53_703);
    });
});

describe('propertyIncomeTax, 2026 to 2027', () => {
    it('charges a basic-rate landlord 20% and credits the finance costs at 20%', () => {
        // Salary £30,000 uses the allowance. Profit £10,000 at 20% = £2,000.
        // Limits: (a) costs £4,000, (b) profit £10,000, (c) £40,000 - £12,570 = £27,430. Lowest is (a).
        // Credit £4,000 at 20% = £800. Tax £2,000 - £800 = £1,200.
        expect(taxOf(30_000, 10_000, 4_000)).toEqual({
            taxBeforeCredit: 2_000,
            financeCredit: 800,
            tax: 1_200,
            unusedFinanceCosts: 0,
            financeCreditBasis: 'finance-costs',
        });
    });

    it('charges a higher-rate landlord 40% but still credits only 20%', () => {
        // Salary £60,000 is already past £50,270. Profit £10,000 at 40% = £4,000.
        // Credit £4,000 at 20% = £800. Tax £3,200.
        expect(taxOf(60_000, 10_000, 4_000)).toMatchObject({ taxBeforeCredit: 4_000, financeCredit: 800, tax: 3_200 });
    });

    it('splits a profit that crosses the higher-rate threshold', () => {
        // Salary £45,000 leaves £50,270 - £45,000 = £5,270 of basic-rate band.
        // £5,270 at 20% = £1,054. The other £12,730 at 40% = £5,092. Together £6,146.
        // Credit £7,000 at 20% = £1,400. Tax £4,746.
        expect(taxOf(45_000, 18_000, 7_000)).toMatchObject({
            taxBeforeCredit: 6_146,
            financeCredit: 1_400,
            tax: 4_746,
        });
    });

    it('counts the personal allowance the rent takes away between £100,000 and £125,140', () => {
        // Salary £105,000: allowance £12,570 - £2,500 = £10,070. With £10,000 of profit: £5,070.
        // Profit £10,000 at 40% = £4,000, plus £5,000 of lost allowance at 40% = £2,000. £6,000, or 60%.
        expect(taxOf(105_000, 10_000)).toMatchObject({ taxBeforeCredit: 6_000, tax: 6_000 });
        // Salary £95,000 (tax £25,432) and profit £24,000: allowance falls to £12,570 - £9,500 = £3,070.
        // Taxable £115,930: £7,540 + £78,230 at 40% (£31,292) = £38,832. Less £25,432 = £13,400.
        // Credit £10,000 at 20% = £2,000. Tax £11,400.
        expect(taxOf(95_000, 24_000, 10_000)).toMatchObject({
            taxBeforeCredit: 13_400,
            financeCredit: 2_000,
            tax: 11_400,
        });
        expect(propertyIncomeTax({ otherIncome: 95_000, profit: 24_000, financeCosts: 0 }, Y26).personalAllowance).toBe(
            3_070,
        );
    });

    it('charges the additional rate above £125,140', () => {
        // Salary £150,000 has no allowance and is all past the threshold. £10,000 at 45% = £4,500.
        expect(taxOf(150_000, 10_000).tax).toBe(4_500);
        // Salary £120,000 (allowance £2,570, tax £39,432) and profit £10,000 (no allowance left):
        // taxable £130,000 is £7,540 + £87,440 at 40% (£34,976) + £4,860 at 45% (£2,187) = £44,703. Less £39,432.
        expect(taxOf(120_000, 10_000).tax).toBe(5_271);
    });

    it('limits the credit to the property profits: (b)', () => {
        // HMRC's own example 4 (Brian): salary £36,000, profit £13,000, finance costs £15,000.
        // Limits: (a) £15,000, (b) £13,000, (c) £49,000 - £12,570 = £36,430. Lowest is (b).
        // Credit £13,000 at 20% = £2,600, which is all the tax on the profit. £2,000 is carried forward.
        expect(taxOf(36_000, 13_000, 15_000)).toEqual({
            taxBeforeCredit: 2_600,
            financeCredit: 2_600,
            tax: 0,
            unusedFinanceCosts: 2_000,
            financeCreditBasis: 'property-profits',
        });
    });

    it('limits the credit to income above the personal allowance: (c)', () => {
        // Other income £5,000, profit £12,000, finance costs £9,000. Total £17,000.
        // Limits: (a) £9,000, (b) £12,000, (c) £17,000 - £12,570 = £4,430. Lowest is (c).
        // Tax: £4,430 at 20% = £886. Credit £4,430 at 20% = £886. £9,000 - £4,430 = £4,570 carried forward.
        expect(taxOf(5_000, 12_000, 9_000)).toEqual({
            taxBeforeCredit: 886,
            financeCredit: 886,
            tax: 0,
            unusedFinanceCosts: 4_570,
            financeCreditBasis: 'adjusted-total-income',
        });
    });

    it('taxes a loss as no profit and carries every finance cost forward', () => {
        expect(taxOf(30_000, -2_000, 3_000)).toEqual({
            taxBeforeCredit: 0,
            financeCredit: 0,
            tax: 0,
            unusedFinanceCosts: 3_000,
            financeCreditBasis: 'property-profits',
        });
        expect(taxOf(30_000, 5_000).financeCreditBasis).toBeNull();
    });

    it('never credits more than the tax on the property', () => {
        for (const other of [0, 5_000, 12_570, 30_000, 50_000, 99_000, 124_000, 200_000])
            for (const profit of [0, 1, 4_000, 20_000, 60_000])
                for (const year of [Y26, Y27]) {
                    const result = propertyIncomeTax({ otherIncome: other, profit, financeCosts: 1e6 }, year);
                    expect(result.tax).toBeGreaterThanOrEqual(0);
                    expect(result.financeCredit).toBeLessThanOrEqual(result.taxBeforeCredit);
                }
    });
});

describe('propertyIncomeTax, 2027 to 2028', () => {
    it('charges the property rates on the profit and credits at the property basic rate', () => {
        // Salary £30,000, profit £3,000 at 24% = £720. Credit £1,000 at 24% = £240. Tax £480.
        expect(taxOf(30_000, 3_000, 1_000, Y27)).toMatchObject({ taxBeforeCredit: 720, financeCredit: 240, tax: 480 });
        // Salary £60,000, profit £10,000 at 44% = £4,400. Credit £4,000 at 24% = £960. Tax £3,440.
        expect(taxOf(60_000, 10_000, 4_000, Y27)).toMatchObject({
            taxBeforeCredit: 4_400,
            financeCredit: 960,
            tax: 3_440,
        });
        // Salary £150,000, profit £10,000 at 49%.
        expect(taxOf(150_000, 10_000, 0, Y27).tax).toBe(4_900);
    });

    it('sets the allowance against other income first, and taxes that at the main rates', () => {
        // Other income £5,000 leaves £7,570 of allowance for the profit: £12,000 - £7,570 = £4,430 at 24% = £1,063.20.
        expect(taxOf(5_000, 12_000, 0, Y27).tax).toBe(1_063.2);
        // Salary £105,000, profit £10,000: £10,000 at 44% = £4,400. The £5,000 of allowance lost
        // exposes £5,000 more salary, taxed at the main higher rate of 40% = £2,000. £6,400.
        expect(taxOf(105_000, 10_000, 0, Y27).tax).toBe(6_400);
        // Other income is untouched by the property rates.
        expect(incomeTax(60_000, 0, Y27)).toBe(incomeTax(60_000, 0, Y26));
    });
});
