import { describe, expect, it } from 'vitest';

import {
    calculateSellingCosts,
    getSellingCostsSummary,
    SELLING_COST_FEES,
    type SellingCostsInput,
    sellingCostsInputError,
    VAT_RATE,
} from '../src/selling-costs/index';

const base: SellingCostsInput = { price: 350_000 };
const sale: SellingCostsInput = {
    price: 350_000,
    mortgage: 180_000,
    earlyRepaymentCharge: 1_800,
    agentFeePercent: 1.25,
    legalFees: 1_500,
    epc: 85,
    removals: 900,
};

describe('calculateSellingCosts', () => {
    it('leaves the whole price when nothing is entered', () => {
        expect(calculateSellingCosts(base)).toMatchObject({
            price: 350_000,
            agentFee: 0,
            agentFeeVat: 0,
            totalCosts: 0,
            mortgageRepaid: 0,
            netProceeds: 350_000,
            shortfall: false,
        });
    });

    it('works a typical sale out by hand', () => {
        // Agent: 1.25% of 350,000 = 4,375, plus VAT at 20% = 875.
        // Costs: 4,375 + 875 + 1,500 + 85 + 900 = 7,735.
        // Mortgage repaid: 180,000 + 1,800 = 181,800.
        // Left: 350,000 - 7,735 - 181,800 = 160,465.
        expect(VAT_RATE).toBe(20);
        expect(calculateSellingCosts(sale)).toMatchObject({
            agentFee: 4_375,
            agentFeeVat: 875,
            totalCosts: 7_735,
            mortgageRepaid: 181_800,
            netProceeds: 160_465,
            shortfall: false,
        });
    });

    it('takes a fixed agent fee, adding VAT on top', () => {
        // 2,000 + 20% VAT (400) = 2,400; left 350,000 - 2,400 = 347,600.
        expect(calculateSellingCosts({ ...base, agentFeeFixed: 2_000 })).toMatchObject({
            agentFee: 2_000,
            agentFeeVat: 400,
            totalCosts: 2_400,
            netProceeds: 347_600,
        });
    });

    it('splits a fee that already includes VAT', () => {
        // 3,000 including VAT is 3,000 x 100/120 = 2,500 of fee and 500 of VAT.
        const fixed = calculateSellingCosts({ ...base, agentFeeFixed: 3_000, agentFeeIncludesVat: true })!;
        expect(fixed).toMatchObject({ agentFee: 2_500, agentFeeVat: 500, totalCosts: 3_000 });
        // 1.2% of 250,000 including VAT is the same 3,000.
        const percent = calculateSellingCosts({ price: 250_000, agentFeePercent: 1.2, agentFeeIncludesVat: true })!;
        expect(percent).toMatchObject({ agentFee: 2_500, agentFeeVat: 500, netProceeds: 247_000 });
        // 1,999.99 x 100/120 = 1,666.658..., so 1,666.66 of fee and 333.33 of VAT: together what was entered.
        const pence = calculateSellingCosts({ ...base, agentFeeFixed: 1_999.99, agentFeeIncludesVat: true })!;
        expect(pence).toMatchObject({ agentFee: 1_666.66, agentFeeVat: 333.33, totalCosts: 1_999.99 });
    });

    it('keeps amounts to the penny', () => {
        // 1.1% of 123,457 = 1,358.027 -> 1,358.03; VAT 271.606 -> 271.61; costs 1,629.64 + 0.25.
        const result = calculateSellingCosts({
            price: 123_457,
            agentFeePercent: 1.1,
            extras: [{ label: 'Postage', amount: 0.25 }],
        })!;
        expect(result).toMatchObject({ agentFee: 1_358.03, agentFeeVat: 271.61, totalCosts: 1_629.89 });
        expect(result.netProceeds).toBe(121_827.11);
    });

    it('reports a shortfall when the sale does not cover the mortgage and costs', () => {
        // 200,000 - (2,000 + 400) - (205,000 + 5,000) = -12,400.
        const result = calculateSellingCosts({
            price: 200_000,
            mortgage: 205_000,
            earlyRepaymentCharge: 5_000,
            agentFeeFixed: 2_000,
        })!;
        expect(result).toMatchObject({ mortgageRepaid: 210_000, netProceeds: -12_400, shortfall: true });
        // Breaking exactly even is not a shortfall.
        expect(calculateSellingCosts({ price: 200_000, mortgage: 200_000 })).toMatchObject({
            netProceeds: 0,
            shortfall: false,
        });
    });

    it('lists every cost, then the mortgage, in order, with its share of the price', () => {
        const result = calculateSellingCosts({
            ...sale,
            extras: [{ label: 'Staging', amount: 700 }, { label: '  ', amount: 35 }, { amount: 0 }],
        })!;
        expect(result.items.map((item) => item.key)).toEqual([
            'agentFee',
            'agentFeeVat',
            ...SELLING_COST_FEES.map((fee) => fee.key),
            'extra-0',
            'extra-1',
            'extra-2',
            'mortgage',
            'earlyRepaymentCharge',
        ]);
        // 4,375 / 350,000 = 1.25%; 875 / 350,000 = 0.25%; 700 / 350,000 = 0.2%; 180,000 / 350,000 = 51.43%.
        expect(result.items[0]).toEqual({ key: 'agentFee', label: 'Estate agent fee', value: 4_375, share: 1.25 });
        expect(result.items[1]).toMatchObject({ label: 'VAT on the agent fee', value: 875, share: 0.25 });
        expect(result.items[5]).toEqual({ key: 'extra-0', label: 'Staging', value: 700, share: 0.2 });
        expect(result.items[6]!.label).toBe('Other cost');
        expect(result.items[7]!.label).toBe('Other cost');
        expect(result.items.at(-2)).toEqual({
            key: 'mortgage',
            label: 'Mortgage balance',
            value: 180_000,
            share: 51.43,
        });
        // The lines account for everything that is not left over.
        expect(result.items.reduce((sum, item) => sum + item.value, 0)).toBe(result.price - result.netProceeds);
        expect(result.totalCosts).toBe(7_735 + 735);
    });

    it('invents no fees: every one defaults to 0 and is still listed', () => {
        const result = calculateSellingCosts(base)!;
        expect(result.items).toHaveLength(2 + SELLING_COST_FEES.length + 2);
        expect(result.items.every((item) => item.value === 0 && item.share === 0)).toBe(true);
    });
});

describe('getSellingCostsSummary', () => {
    it('gives every figure its display string and labelled row', () => {
        const { summary, error } = getSellingCostsSummary({ ...sale, removals: 900.5 });
        expect(error).toBeNull();
        expect(summary!.formatted).toEqual({
            netProceeds: '£160,464.50',
            price: '£350,000',
            totalCosts: '£7,735.50',
            mortgageRepaid: '£181,800',
            agentFee: '£4,375',
            agentFeeVat: '£875',
        });
        expect(summary!.rows[0]).toEqual({
            key: 'netProceeds',
            label: 'Money left after the sale',
            value: 160_464.5,
            formatted: '£160,464.50',
        });
        expect(summary!.rows.map((row) => row.key)).toEqual(Object.keys(summary!.formatted));
        expect(summary!.items[0]).toEqual({
            key: 'agentFee',
            label: 'Estate agent fee',
            value: 4_375,
            share: 1.25,
            formatted: '£4,375',
            formattedShare: '1.25%',
        });
    });

    it('writes a shortfall with the minus sign before the pound sign', () => {
        const { summary } = getSellingCostsSummary({ price: 200_000, mortgage: 212_400.5 });
        expect(summary!.formatted.netProceeds).toBe('-£12,400.50');
        expect(summary!.shortfall).toBe(true);
    });

    it('survives a trip through JSON unchanged', () => {
        const result = getSellingCostsSummary({ ...sale, extras: [{ label: 'Staging', amount: 700 }] });
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it('returns the form error instead of a summary', () => {
        expect(getSellingCostsSummary({ price: 0 })).toEqual({ summary: null, error: 'Enter the sale price.' });
    });
});

describe('input that cannot be calculated', () => {
    const errorFor = (extra: object) => getSellingCostsSummary({ ...base, ...extra } as never).error;

    it('needs a sale price from £1 to the maximum', () => {
        expect(sellingCostsInputError(base)).toBeNull();
        expect(sellingCostsInputError({ price: 1 })).toBeNull();
        for (const price of [0, 0.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '350000', null, undefined, {}]) {
            expect(errorFor({ price }), String(price)).toBe('Enter the sale price.');
        }
        expect(errorFor({ price: 2_000_000_000 })).toBe('Enter a lower price.');
    });

    it('refuses an agent fee given both ways, or out of range', () => {
        expect(errorFor({ agentFeePercent: 1, agentFeeFixed: 2_000 })).toBe(
            'Enter the agent fee as a percentage or as a fixed amount, not both.',
        );
        expect(errorFor({ agentFeePercent: 0, agentFeeFixed: 0 })).toMatch(/not both/);
        expect(errorFor({ agentFeePercent: 100 })).toBeNull();
        for (const agentFeePercent of [-1, 100.01, Number.NaN, '1.5', null]) {
            expect(errorFor({ agentFeePercent }), String(agentFeePercent)).toBe('Enter an agent fee from 0% to 100%.');
        }
        for (const agentFeeFixed of [-1, Number.POSITIVE_INFINITY, '2000', null]) {
            expect(errorFor({ agentFeeFixed }), String(agentFeeFixed)).toBe('Enter the agent fee, or leave it at 0.');
        }
        expect(errorFor({ agentFeeIncludesVat: 'yes' })).toBe('Choose whether the agent fee includes VAT.');
    });

    it('refuses amounts that are not numbers of pounds', () => {
        expect(errorFor({ mortgage: -1 })).toBe('Enter the mortgage to repay, or leave it at 0.');
        expect(errorFor({ mortgage: '180000' })).toMatch(/mortgage/);
        expect(errorFor({ earlyRepaymentCharge: Number.NaN })).toMatch(/early repayment charge/);
        expect(errorFor({ legalFees: -1 })).toBe('Enter the legal fees, or leave it at 0.');
        expect(errorFor({ epc: Number.POSITIVE_INFINITY })).toMatch(/energy performance certificate/);
        expect(errorFor({ removals: [] })).toMatch(/removals/);
    });

    it('refuses other costs that are not a list of amounts', () => {
        const each = 'Enter each other cost, or leave it at 0.';
        for (const extra of [null, '5', { label: 'Paint' }, { label: 'Paint', amount: '5' }, { label: 5, amount: 5 }]) {
            expect(errorFor({ extras: [extra] })).toBe(each);
        }
        expect(errorFor({ extras: [{ amount: -5 }] })).toBe(each);
        expect(errorFor({ extras: null })).toBe('Enter the other costs as a list.');
        expect(errorFor({ extras: {} })).toBe('Enter the other costs as a list.');
        expect(errorFor({ extras: Array.from({ length: 51 }, () => ({ amount: 1 })) })).toMatch(/up to 50/);
    });

    it('never throws, whatever it is given', () => {
        for (const input of [null, undefined, 5, 'sale', [], () => 0, Symbol('x')]) {
            expect(sellingCostsInputError(input as never)).toBe('Enter the sale price.');
            expect(calculateSellingCosts(input as never)).toBeNull();
            expect(getSellingCostsSummary(input as never).summary).toBeNull();
        }
    });
});
