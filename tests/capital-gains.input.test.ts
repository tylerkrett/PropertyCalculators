import { describe, expect, it } from 'vitest';

import {
    calculateCapitalGains,
    type CapitalGainsInput,
    capitalGainsInputError,
    capitalGainsReportBy,
    getCapitalGainsSummary,
} from '../src/capital-gains/index';

/* The capital gains deadline dates, and input the calculator must refuse without throwing. */

const landlord: CapitalGainsInput = {
    salePrice: 300_000,
    purchasePrice: 180_000,
    buyingCosts: 4_000,
    sellingCosts: 6_000,
    improvements: 10_000,
    income: 40_000,
};

describe('the date to report and pay by', () => {
    it('is the 60th day after completion, counting the day after completion as day 1', () => {
        // 25 November + 5 = 30 November, + 31 = 31 December (36), + 24 = 24 January (60).
        expect(capitalGainsReportBy('2026-11-25')).toBe('2027-01-24');
        // The usual example: complete on 1 March (30 days to 31 March, 30 more to 30 April).
        expect(capitalGainsReportBy('2026-03-01')).toBe('2026-04-30');
        // The first completion date the 60 days applied to.
        expect(capitalGainsReportBy('2021-10-27')).toBe('2021-12-26');
    });

    it('counts through month ends and leap years', () => {
        // January (31) and an ordinary February (28) are 59 days: 1 March is day 60.
        expect(capitalGainsReportBy('2026-12-31')).toBe('2027-03-01');
        // In a leap year January and February are the 60 days.
        expect(capitalGainsReportBy('2027-12-31')).toBe('2028-02-29');
        expect(capitalGainsReportBy('2028-01-01')).toBe('2028-03-01');
        expect(capitalGainsReportBy('2027-01-01')).toBe('2027-03-02');
        // From leap day: 31 days to 31 March, 29 more to 29 April.
        expect(capitalGainsReportBy('2028-02-29')).toBe('2028-04-29');
        // Across the tax year end and the clock change.
        expect(capitalGainsReportBy('2027-04-05')).toBe('2027-06-04');
        expect(capitalGainsReportBy('2026-10-24')).toBe('2026-12-23');
    });

    it('comes with the result, as a date and as words', () => {
        const { summary } = getCapitalGainsSummary({ ...landlord, completionDate: '2026-11-25' });
        expect(summary!.reportBy).toBe('2027-01-24');
        expect(summary!.formatted.reportBy).toBe('24 January 2027');
        expect(summary!.notes[0]).toBe(
            'Report the sale to HMRC and pay the tax by 24 January 2027: 60 days after completion.',
        );
        const noTax = calculateCapitalGains({
            salePrice: 201_000,
            purchasePrice: 200_000,
            completionDate: '2026-11-25',
        })!;
        expect(noTax.reportBy).toBe('2027-01-24');
        expect(noTax.notes[1]).toMatch(/does not usually need to send the 60-day return/);
    });

    it('refuses a date that is not a real one, or from before the 60-day rule', () => {
        const errorFor = (completionDate: unknown) => capitalGainsInputError({ ...landlord, completionDate } as never);
        for (const date of [
            '2026-02-30',
            '2027-02-29',
            '2026-13-01',
            '25/11/2026',
            '2026-11-25T00:00:00Z',
            '',
            20261125,
            null,
            {},
        ]) {
            expect(errorFor(date), String(date)).toBe('Enter the completion date as YYYY-MM-DD.');
            expect(capitalGainsReportBy(date as never)).toBeNull();
        }
        expect(errorFor('2021-10-26')).toBe('Enter a completion date on or after 27 October 2021.');
        expect(errorFor('2201-01-01')).toMatch(/completion date/);
        expect(capitalGainsReportBy('2021-10-26')).toBeNull();
        expect(errorFor('2028-02-29')).toBeNull();
    });
});

describe('input that cannot be calculated', () => {
    const errorFor = (extra: object) => getCapitalGainsSummary({ ...landlord, ...extra } as never).error;

    it('needs both prices', () => {
        expect(capitalGainsInputError(landlord)).toBeNull();
        for (const salePrice of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '300000', null, undefined]) {
            expect(errorFor({ salePrice }), String(salePrice)).toBe('Enter the sale price.');
        }
        for (const purchasePrice of [-1, Number.NaN, '180000', null, undefined, []]) {
            expect(errorFor({ purchasePrice }), String(purchasePrice)).toBe('Enter the purchase price.');
        }
        expect(errorFor({ purchasePrice: 0 })).toBeNull();
        expect(errorFor({ salePrice: 2_000_000_000 })).toBe('Enter a lower price.');
        expect(errorFor({ purchasePrice: 2_000_000_000 })).toBe('Enter a lower price.');
    });

    it('refuses amounts, shares, allowances and tax years it cannot use', () => {
        expect(errorFor({ buyingCosts: -1 })).toBe('Enter the costs of buying, or leave it at 0.');
        expect(errorFor({ sellingCosts: Number.NaN })).toBe('Enter the costs of selling, or leave it at 0.');
        expect(errorFor({ improvements: '10000' })).toBe('Enter the cost of improvements, or leave it at 0.');
        expect(errorFor({ income: null })).toBe('Enter the income, or leave it at 0.');
        expect(errorFor({ income: Number.POSITIVE_INFINITY })).toMatch(/income/);
        const allowance = 'Enter the tax-free allowance already used, from £0 to £3,000.';
        for (const allowanceUsed of [-1, 3_000.01, Number.NaN, '0', null])
            expect(errorFor({ allowanceUsed })).toBe(allowance);
        const share = 'Enter the share you own, above 0% and up to 100%.';
        for (const value of [0, -50, 100.01, Number.NaN, '50', null]) expect(errorFor({ share: value })).toBe(share);
        expect(errorFor({ share: 0.01 })).toBeNull();
        for (const taxYear of ['2025-26', '2026', 'constructor', 'toString', 2026, null, {}]) {
            expect(errorFor({ taxYear }), String(taxYear)).toBe('Choose the tax year.');
        }
        expect(calculateCapitalGains({ ...landlord, share: 0 })).toBeNull();
    });

    it('never throws, whatever it is given', () => {
        for (const input of [null, undefined, 5, 'sale', [], () => 0, Symbol('x')]) {
            expect(capitalGainsInputError(input as never)).toBe('Enter the sale price.');
            expect(calculateCapitalGains(input as never)).toBeNull();
            expect(getCapitalGainsSummary(input as never).summary).toBeNull();
        }
    });
});
