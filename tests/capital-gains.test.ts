import { describe, expect, it } from 'vitest';

import {
    calculateCapitalGains,
    CAPITAL_GAINS_RATES,
    type CapitalGainsInput,
    capitalGainsInputError,
    capitalGainsReportBy,
    getCapitalGainsSummary,
} from '../src/capital-gains/index';

/** A gain of exactly `gain` with nothing else entered. */
const gainOf = (gain: number, extra: Partial<CapitalGainsInput> = {}): CapitalGainsInput => ({
    salePrice: 200_000 + gain,
    purchasePrice: 200_000,
    ...extra,
});
const landlord: CapitalGainsInput = {
    salePrice: 300_000,
    purchasePrice: 180_000,
    buyingCosts: 4_000,
    sellingCosts: 6_000,
    improvements: 10_000,
    income: 40_000,
};

describe('the figures for each tax year', () => {
    it('are the published ones for 2026-27, unchanged for 2027-28', () => {
        expect(CAPITAL_GAINS_RATES['2026-27']).toEqual({
            lowerRate: 18,
            higherRate: 24,
            annualExemptAmount: 3_000,
            personalAllowance: 12_570,
            allowanceTaperThreshold: 100_000,
            basicRateBand: 37_700,
        });
        expect(CAPITAL_GAINS_RATES['2027-28']).toEqual(CAPITAL_GAINS_RATES['2026-27']);
    });
});

describe('calculateCapitalGains', () => {
    it('works a landlord sale out by hand', () => {
        // Gain: 300,000 - 180,000 - 4,000 - 6,000 - 10,000 = 100,000. Less the 3,000 allowance: 97,000.
        // Taxable income: 40,000 - 12,570 = 27,430, so 37,700 - 27,430 = 10,270 of the basic-rate band is left.
        // 10,270 x 18% = 1,848.60. The other 86,730 x 24% = 20,815.20. Tax: 22,663.80.
        // 22,663.80 / 100,000 = 22.66%. Kept: 100,000 - 22,663.80 = 77,336.20.
        expect(calculateCapitalGains(landlord)).toMatchObject({
            taxYear: '2026-27',
            gain: 100_000,
            loss: false,
            allowance: 3_000,
            taxableGain: 97_000,
            basicRateBandLeft: 10_270,
            lowerRate: 18,
            lowerRateAmount: 10_270,
            lowerRateTax: 1_848.6,
            higherRate: 24,
            higherRateAmount: 86_730,
            higherRateTax: 20_815.2,
            tax: 22_663.8,
            effectiveRate: 22.66,
            gainAfterTax: 77_336.2,
        });
    });

    it('matches the GOV.UK example of a gain that straddles the basic-rate band', () => {
        // https://www.gov.uk/capital-gains-tax/rates: taxable income 20,000 (income 32,570) leaves
        // 17,700 of the band. A 52,600 gain is 49,600 after the allowance: 17,700 at 18% = 3,186
        // and 31,900 at 24% = 7,656. Tax: 10,842.
        expect(calculateCapitalGains(gainOf(52_600, { income: 32_570 }))).toMatchObject({
            taxableGain: 49_600,
            lowerRateAmount: 17_700,
            lowerRateTax: 3_186,
            higherRateAmount: 31_900,
            higherRateTax: 7_656,
            tax: 10_842,
        });
    });

    it('charges nothing on a gain exactly at the allowance, and 18p on a pound more', () => {
        expect(calculateCapitalGains(gainOf(3_000))).toMatchObject({ allowance: 3_000, taxableGain: 0, tax: 0 });
        // 1 x 18% = 0.18.
        expect(calculateCapitalGains(gainOf(3_001))).toMatchObject({ taxableGain: 1, tax: 0.18, effectiveRate: 0.01 });
        expect(calculateCapitalGains(gainOf(0))).toMatchObject({ gain: 0, loss: false, allowance: 0, tax: 0 });
    });

    it('uses the higher rate throughout once income reaches the top of the basic-rate band', () => {
        // 12,570 + 37,700 = 50,270. A 13,000 gain is 10,000 taxable.
        // At 50,270 no band is left: 10,000 x 24% = 2,400.
        expect(calculateCapitalGains(gainOf(13_000, { income: 50_270 }))).toMatchObject({
            basicRateBandLeft: 0,
            lowerRateAmount: 0,
            higherRateAmount: 10_000,
            tax: 2_400,
        });
        // At 50,269 one pound is left: 0.18 + 9,999 x 24% (2,399.76) = 2,399.94.
        expect(calculateCapitalGains(gainOf(13_000, { income: 50_269 }))).toMatchObject({
            basicRateBandLeft: 1,
            lowerRateAmount: 1,
            higherRateAmount: 9_999,
            tax: 2_399.94,
        });
    });

    it('uses the lower rate throughout while the gain fits in the band', () => {
        // Income 32,570 leaves 17,700. A taxable gain of exactly 17,700 (20,700 before the allowance) x 18% = 3,186.
        expect(calculateCapitalGains(gainOf(20_700, { income: 32_570 }))).toMatchObject({
            lowerRateAmount: 17_700,
            higherRateAmount: 0,
            tax: 3_186,
            effectiveRate: 15.39,
        });
        // A pound more of gain is taxed at 24%: 3,186 + 0.24.
        expect(calculateCapitalGains(gainOf(20_701, { income: 32_570 }))!.tax).toBe(3_186.24);
    });

    it('gives the whole band to someone with income at or below the personal allowance, and no more', () => {
        // An unused personal allowance cannot be set against a gain: the band left is 37,700 either way.
        for (const income of [0, 5_000, 12_570]) {
            expect(calculateCapitalGains(gainOf(50_000, { income }))!.basicRateBandLeft).toBe(37_700);
        }
        // 47,000 taxable: 37,700 x 18% = 6,786 and 9,300 x 24% = 2,232. Tax: 9,018.
        expect(calculateCapitalGains(gainOf(50_000))!.tax).toBe(9_018);
        expect(calculateCapitalGains(gainOf(50_000, { income: 12_571 }))!.basicRateBandLeft).toBe(37_699);
    });

    it('leaves no band for high incomes, where the personal allowance is tapered away', () => {
        for (const income of [100_000, 110_000, 125_140, 500_000]) {
            // 97,000 x 24% = 23,280.
            expect(calculateCapitalGains({ ...landlord, income })).toMatchObject({ basicRateBandLeft: 0, tax: 23_280 });
        }
    });

    it('takes off only the allowance that is left', () => {
        // 13,000 gain, 1,000 of the 3,000 already used: 2,000 off, 11,000 x 18% = 1,980.
        expect(calculateCapitalGains(gainOf(13_000, { allowanceUsed: 1_000 }))).toMatchObject({
            allowance: 2_000,
            taxableGain: 11_000,
            tax: 1_980,
        });
        // All used: 13,000 x 18% = 2,340.
        expect(calculateCapitalGains(gainOf(13_000, { allowanceUsed: 3_000 }))).toMatchObject({
            allowance: 0,
            tax: 2_340,
        });
        // A small gain uses only what it needs.
        expect(calculateCapitalGains(gainOf(500))).toMatchObject({ allowance: 500, taxableGain: 0, tax: 0 });
    });

    it('scales the gain to the share owned', () => {
        // Half of the 100,000 gain: 50,000, 47,000 taxable. 10,270 x 18% = 1,848.60; 36,730 x 24% = 8,815.20.
        const half = calculateCapitalGains({ ...landlord, share: 50 })!;
        expect(half).toMatchObject({ gain: 50_000, taxableGain: 47_000, tax: 10_663.8 });
        expect(half.notes).toContain('The figures are for your 50% share of the property.');
        // A third of 100,000 is kept to the penny.
        expect(calculateCapitalGains({ ...landlord, share: 33.33 })!.gain).toBe(33_330);
        expect(calculateCapitalGains(gainOf(100, { share: 33.335 }))!.gain).toBe(33.34);
    });

    it('charges nothing on a loss and says it can be carried forward', () => {
        // 200,000 - 215,000 - 5,000 = -20,000.
        const result = calculateCapitalGains({ salePrice: 200_000, purchasePrice: 215_000, sellingCosts: 5_000 })!;
        expect(result).toMatchObject({
            gain: -20_000,
            loss: true,
            allowance: 0,
            taxableGain: 0,
            tax: 0,
            effectiveRate: 0,
            gainAfterTax: -20_000,
        });
        expect(result.notes[0]).toMatch(/loss.*carried forward/);
        expect(calculateCapitalGains({ ...landlord, salePrice: 150_000, share: 50 })!.gain).toBe(-25_000);
    });

    it('always says what is not modelled', () => {
        for (const input of [landlord, gainOf(0), gainOf(-5_000)]) {
            const { notes } = calculateCapitalGains(input)!;
            expect(
                notes.some((note) => /Private residence relief and lettings relief are not modelled/.test(note)),
            ).toBe(true);
        }
        expect(calculateCapitalGains(gainOf(2_000))!.notes[0]).toMatch(/covered by the tax-free allowance/);
        expect(calculateCapitalGains(landlord)!.reportBy).toBeUndefined();
        expect('reportBy' in calculateCapitalGains(landlord)!).toBe(false);
    });
});

describe('getCapitalGainsSummary', () => {
    it('gives every figure its display string and labelled row', () => {
        const { summary, error } = getCapitalGainsSummary(landlord);
        expect(error).toBeNull();
        expect(summary!.formatted).toEqual({
            tax: '£22,663.80',
            gain: '£100,000',
            allowance: '£3,000',
            taxableGain: '£97,000',
            lowerRateAmount: '£10,270',
            lowerRateTax: '£1,848.60',
            higherRateAmount: '£86,730',
            higherRateTax: '£20,815.20',
            effectiveRate: '22.66%',
            gainAfterTax: '£77,336.20',
            lowerRate: '18%',
            higherRate: '24%',
        });
        expect(summary!.rows[0]).toEqual({
            key: 'tax',
            label: 'Capital gains tax to pay',
            value: 22_663.8,
            formatted: '£22,663.80',
        });
        expect(summary!.rows).toHaveLength(10);
        expect(summary!.rows.every((row) => summary!.formatted[row.key] === row.formatted)).toBe(true);
    });

    it('writes a loss with the minus sign before the pound sign', () => {
        const { summary } = getCapitalGainsSummary(gainOf(-20_000.5));
        expect(summary!.formatted).toMatchObject({ gain: '-£20,000.50', tax: '£0', gainAfterTax: '-£20,000.50' });
    });

    it('survives a trip through JSON unchanged', () => {
        const result = getCapitalGainsSummary({ ...landlord, completionDate: '2026-11-25', taxYear: '2027-28' });
        expect(result.summary!.taxYear).toBe('2027-28');
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });
});
