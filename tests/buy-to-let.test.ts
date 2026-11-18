import { describe, expect, it } from 'vitest';

import {
    BORROWER_TYPES,
    BUY_TO_LET_DEFAULTS,
    BUY_TO_LET_LABELS,
    BUY_TO_LET_LIMITS,
    BUY_TO_LET_SHORTFALL_LABEL,
    buyToLetInputError,
    calculateBuyToLet,
    getBuyToLetSummary,
    PRA_MINIMUM_STRESS_RATE,
    type BuyToLetInput,
} from '../src/buy-to-let/index';

// £240,000 at 5.5% is £13,200 a year, £1,100 a month, of interest.
const base: BuyToLetInput = { rent: 1_500, loan: 240_000 };

describe('calculateBuyToLet', () => {
    it('divides the rent by the interest at the stress rate', () => {
        expect(calculateBuyToLet(base)).toEqual({
            monthlyRent: 1_500,
            loan: 240_000,
            stressRate: 5.5,
            requiredCoverRatio: 125,
            stressedInterest: 1_100,
            // 1,500 ÷ 1,100.
            coverRatio: 136.36,
            passes: true,
            // £18,000 of rent ÷ 1.25 ÷ 5.5%.
            maxLoan: 261_818,
            // £1,100 × 1.25.
            minRent: 1_375,
            monthlyHeadroom: 125,
            ltv: null,
        });
    });

    it('asks more cover of a higher-rate taxpayer than of a basic-rate one or a company', () => {
        const higher = calculateBuyToLet({ ...base, borrower: 'higher-rate' })!;
        expect(higher.requiredCoverRatio).toBe(145);
        // £1,100 × 1.45 is £1,595, so £1,500 is £95 short.
        expect(higher).toMatchObject({ passes: false, minRent: 1_595, monthlyHeadroom: -95, maxLoan: 225_705 });
        expect(calculateBuyToLet({ ...base, borrower: 'limited-company' })!.requiredCoverRatio).toBe(125);
        expect(BORROWER_TYPES.map(({ value, coverRatio }) => [value, coverRatio])).toEqual([
            ['basic-rate', 125],
            ['higher-rate', 145],
            ['limited-company', 125],
        ]);
    });

    it('lets the stress rate and the required cover be set', () => {
        // £200,000 at 6% is £1,000 a month; 140% of that is £1,400.
        const result = calculateBuyToLet({ rent: 1_400, loan: 200_000, stressRate: 6, coverRatio: 140 })!;
        expect(result).toMatchObject({ stressedInterest: 1_000, coverRatio: 140, passes: true, minRent: 1_400 });
        expect(result).toMatchObject({ maxLoan: 200_000, monthlyHeadroom: 0 });
        // An explicit ratio wins over the borrower type.
        expect(calculateBuyToLet({ ...base, borrower: 'higher-rate', coverRatio: 130 })!.requiredCoverRatio).toBe(130);
    });

    it('passes exactly at the required ratio and fails a penny below', () => {
        for (const [borrower, rent] of [
            ['basic-rate', 1_375],
            ['higher-rate', 1_595],
        ] as const) {
            const at = calculateBuyToLet({ ...base, borrower, rent })!;
            expect(at.passes).toBe(true);
            expect(at.coverRatio).toBe(at.requiredCoverRatio);
            expect(at.monthlyHeadroom).toBe(0);
            expect(at.maxLoan).toBe(240_000);
            const below = calculateBuyToLet({ ...base, borrower, rent: rent - 0.01 })!;
            expect(below.passes).toBe(false);
            expect(below.monthlyHeadroom).toBe(-0.01);
            expect(below.maxLoan).toBe(239_998);
        }
    });

    it('takes the rent by the week or the year', () => {
        expect(calculateBuyToLet({ ...base, rent: 300, rentPeriod: 'week' })!.monthlyRent).toBe(1_300);
        expect(calculateBuyToLet({ ...base, rent: 18_000, rentPeriod: 'year' })).toEqual(calculateBuyToLet(base));
    });

    it('borrows the price less the deposit, and adds loan to value when there is a price', () => {
        const result = calculateBuyToLet({ rent: 1_500, price: 320_000, deposit: 80_000 })!;
        expect(result).toEqual({ ...calculateBuyToLet(base), ltv: 75 });
        expect(calculateBuyToLet({ ...base, price: 300_000 })!.ltv).toBe(80);
        // A loan given outright wins over the deposit.
        expect(calculateBuyToLet({ ...base, price: 300_000, deposit: 1 })!.loan).toBe(240_000);
    });

    it('gives a maximum loan and a minimum rent that agree with the pass', () => {
        const cases: BuyToLetInput[] = [
            base,
            { rent: 950, loan: 187_500, borrower: 'higher-rate' },
            { rent: 1_234.56, loan: 199_999, stressRate: 4.79, coverRatio: 133 },
            { rent: 2_100, loan: 400_000, stressRate: 7.25 },
            { rent: 275, rentPeriod: 'week', loan: 150_000, coverRatio: 145 },
        ];
        for (const input of cases) {
            const result = calculateBuyToLet(input)!;
            const monthly = { ...input, rentPeriod: 'month' } as const;
            // The maximum loan passes on this rent and a pound more does not.
            expect(calculateBuyToLet({ ...input, loan: result.maxLoan })!.passes).toBe(true);
            expect(calculateBuyToLet({ ...input, loan: result.maxLoan + 1 })!.passes).toBe(false);
            // The minimum rent passes on this loan and a penny less does not.
            expect(calculateBuyToLet({ ...monthly, rent: result.minRent })!.passes).toBe(true);
            expect(calculateBuyToLet({ ...monthly, rent: result.minRent - 0.01 })!.passes).toBe(false);
            expect(result.passes).toBe(result.loan <= result.maxLoan);
            expect(result.passes).toBe(result.monthlyHeadroom >= 0);
        }
    });

    it('survives a trip through JSON', () => {
        for (const input of [base, { ...base, price: 300_000, borrower: 'higher-rate' } as const]) {
            const { summary } = getBuyToLetSummary(input);
            expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
        }
    });
});

describe('buyToLetInputError', () => {
    it("rejects input it can't calculate", () => {
        expect(buyToLetInputError(base)).toBeNull();
        expect(buyToLetInputError({ ...base, rent: 0 })).toMatch(/rent/);
        expect(buyToLetInputError({ ...base, rentPeriod: 'day' as never })).toMatch(/rent/);
        expect(buyToLetInputError({ rent: 1_500 })).toMatch(/loan amount, or the property price/);
        expect(buyToLetInputError({ ...base, loan: 0 })).toMatch(/loan amount/);
        expect(buyToLetInputError({ ...base, loan: NaN })).toMatch(/loan amount/);
        expect(buyToLetInputError({ ...base, price: 200_000 })).toMatch(/more than the property price/);
        expect(buyToLetInputError({ ...base, price: 0 })).toMatch(/price/);
        expect(buyToLetInputError({ rent: 1_500, price: 300_000 })).toMatch(/deposit/);
        expect(buyToLetInputError({ rent: 1_500, price: 300_000, deposit: -1 })).toMatch(/deposit/);
        expect(buyToLetInputError({ rent: 1_500, price: 300_000, deposit: 300_000 })).toMatch(/nothing to borrow/);
        expect(buyToLetInputError({ ...base, stressRate: 0 })).toMatch(/stress rate between 1% and 25%/);
        expect(buyToLetInputError({ ...base, stressRate: 26 })).toMatch(/stress rate/);
        expect(buyToLetInputError({ ...base, coverRatio: 99 })).toMatch(/cover between 100% and 300%/);
        expect(buyToLetInputError({ ...base, borrower: 'trust' as never })).toMatch(/type of borrower/);
        expect(calculateBuyToLet({ ...base, stressRate: 0 })).toBeNull();
    });

    it('defaults to the PRA minimum stress rate and accepts the limits themselves', () => {
        expect(PRA_MINIMUM_STRESS_RATE).toBe(5.5);
        expect(BUY_TO_LET_DEFAULTS).toEqual({ rentPeriod: 'month', stressRate: 5.5, borrower: 'basic-rate' });
        expect(buyToLetInputError({ ...base, stressRate: BUY_TO_LET_LIMITS.stressRate.min })).toBeNull();
        expect(buyToLetInputError({ ...base, coverRatio: BUY_TO_LET_LIMITS.coverRatio.max })).toBeNull();
    });
});

describe('getBuyToLetSummary', () => {
    it('gives every figure a display string and a labelled row', () => {
        const { summary, error } = getBuyToLetSummary({ ...base, price: 300_000 });
        expect(error).toBeNull();
        expect(summary!.verdict).toBe('Passes');
        expect(summary!.formatted).toEqual({
            coverRatio: '136.36%',
            requiredCoverRatio: '125%',
            monthlyRent: '£1,500.00',
            stressedInterest: '£1,100.00',
            stressRate: '5.5%',
            loan: '£240,000',
            maxLoan: '£261,818',
            minRent: '£1,375.00',
            monthlyHeadroom: '£125.00',
            ltv: '80%',
        });
        expect(summary!.rows.map((row) => row.key)).toEqual(Object.keys(BUY_TO_LET_LABELS));
        expect(summary!.rows[0]).toEqual({
            key: 'coverRatio',
            label: 'Interest cover ratio',
            value: 136.36,
            formatted: '136.36%',
        });
    });

    it('names a shortfall and leaves loan to value out without a price', () => {
        const { summary } = getBuyToLetSummary({ ...base, borrower: 'higher-rate' });
        expect(summary).toMatchObject({ passes: false, verdict: 'Falls short', monthlyHeadroom: -95, ltv: null });
        expect(summary!.formatted).toMatchObject({ monthlyHeadroom: '-£95.00', ltv: null });
        expect(summary!.rows.find((row) => row.key === 'monthlyHeadroom')).toEqual({
            key: 'monthlyHeadroom',
            label: BUY_TO_LET_SHORTFALL_LABEL,
            value: 95,
            formatted: '£95.00',
        });
        expect(summary!.rows.some((row) => row.key === 'ltv')).toBe(false);
    });

    it('returns the form error instead of a summary', () => {
        expect(getBuyToLetSummary({ ...base, stressRate: 30 })).toEqual({
            summary: null,
            error: 'Enter a stress rate between 1% and 25%.',
        });
    });
});

describe('the verdict at the boundary', () => {
    const rowFor = (input: BuyToLetInput, key: string) =>
        getBuyToLetSummary(input).summary!.rows.find((row) => row.key === key)!;

    it('shows a fail as short of the cover and the rent, never level with them', () => {
        // £1,374.9958 a month against £1,375: short by less than a penny.
        const input: BuyToLetInput = { rent: 16_499.95, rentPeriod: 'year', loan: 240_000 };
        const { summary } = getBuyToLetSummary(input);
        expect(summary).toMatchObject({ passes: false, verdict: 'Falls short', coverRatio: 124.99 });
        expect(summary).toMatchObject({ requiredCoverRatio: 125, monthlyHeadroom: -0.01 });
        expect(summary!.formatted).toMatchObject({ coverRatio: '124.99%', monthlyHeadroom: '-£0.01' });
        expect(rowFor(input, 'monthlyHeadroom')).toMatchObject({
            label: BUY_TO_LET_SHORTFALL_LABEL,
            value: 0.01,
            formatted: '£0.01',
        });
    });

    it('shows a pass with no shortfall and cover of at least the requirement', () => {
        // The rent passes unrounded, though the minimum rent rounds up a penny past it.
        const input: BuyToLetInput = { rent: 16_500.03, rentPeriod: 'year', loan: 240_000.17 };
        const { summary } = getBuyToLetSummary(input);
        expect(summary).toMatchObject({ passes: true, verdict: 'Passes', coverRatio: 125, monthlyHeadroom: 0 });
        expect(Object.is(summary!.monthlyHeadroom, 0)).toBe(true);
        expect(rowFor(input, 'monthlyHeadroom')).toMatchObject({
            label: BUY_TO_LET_LABELS.monthlyHeadroom,
            formatted: '£0.00',
        });
    });

    it('never writes a minus zero, and rounds the cover down', () => {
        for (const rent of [16_499.95, 16_499.99, 16_500, 16_500.03, 16_500.06]) {
            const { summary } = getBuyToLetSummary({ rent, rentPeriod: 'year', loan: 240_000 });
            const texts = [...Object.values(summary!.formatted), ...summary!.rows.map((row) => row.formatted)];
            expect(texts.some((text) => text !== null && /^-£?0(\.00)?%?$/.test(text))).toBe(false);
            expect(summary!.coverRatio >= summary!.requiredCoverRatio).toBe(summary!.passes);
            expect(summary!.monthlyHeadroom >= 0).toBe(summary!.passes);
        }
        // 1,536 ÷ 1,100 is 139.6363…: shown as 139.63, not rounded up to 139.64.
        expect(calculateBuyToLet({ ...base, rent: 1_536 })!.coverRatio).toBe(139.63);
    });

    it('rejects a rent too large to calculate with', () => {
        expect(buyToLetInputError({ ...base, rent: 1e308 })).toBe('Enter a lower rent.');
        expect(getBuyToLetSummary({ ...base, rent: 1_000_000_001 }).error).toBe('Enter a lower rent.');
    });
});
