import { describe, expect, it } from 'vitest';

import {
    BUYING_COST_FEES,
    buyingCostsInputError,
    calculateBuyingCosts,
    getBuyingCostsSummary,
    type BuyingCostsInput,
} from '../src/buying-costs/index';
import { calculateStampDuty } from '../src/stamp-duty/estimate';

const base: BuyingCostsInput = { price: 500_000, deposit: 100_000 };
const fees = {
    legalFees: 2_000,
    survey: 600,
    arrangementFee: 999,
    valuationFee: 250,
    brokerFee: 500,
    removals: 651,
};

describe('calculateBuyingCosts', () => {
    it('is the deposit plus stamp duty when no fees are entered', () => {
        const result = calculateBuyingCosts(base)!;
        // A home mover pays £15,000 on £500,000, as in the mortgage tests.
        expect(result).toMatchObject({
            deposit: 100_000,
            stampDuty: 15_000,
            totalFees: 0,
            cashUpfront: 115_000,
            totalCost: 515_000,
            loan: 400_000,
        });
    });

    it('adds every fee to the cash needed and to the total cost', () => {
        // Fees: 2,000 + 600 + 999 + 250 + 500 + 651 = 5,000. First-time buyer duty on £500,000 is £10,000.
        const result = calculateBuyingCosts({ ...base, ...fees, buyer: 'first-time-buyer' })!;
        expect(result.stampDuty).toBe(10_000);
        expect(result.totalFees).toBe(5_000);
        expect(result.cashUpfront).toBe(115_000);
        expect(result.totalCost).toBe(515_000);
        expect(result.cashUpfront).toBe(result.deposit + result.stampDuty + result.totalFees);
    });

    it('takes stamp duty from the stamp duty calculator for the buyer type and residency', () => {
        for (const buyer of ['home-mover', 'first-time-buyer', 'additional-property'] as const) {
            for (const nonUkResident of [false, true]) {
                const expected = calculateStampDuty({ price: 500_000, buyer, nonUkResident }).stampDuty;
                expect(calculateBuyingCosts({ ...base, buyer, nonUkResident })!.stampDuty).toBe(expected);
            }
        }
        expect(calculateBuyingCosts({ ...base, buyer: 'additional-property' })!.stampDuty).toBe(40_000);
    });

    it('lists the deposit, stamp duty, each fee and each extra, in order, with its share of the cash', () => {
        const result = calculateBuyingCosts({
            ...base,
            ...fees,
            buyer: 'first-time-buyer',
            extras: [
                { label: 'Furniture', amount: 5_000 },
                { label: '  ', amount: 5_000 },
            ],
        })!;
        // Cash needed: 100,000 + 10,000 + 5,000 + 10,000 = 125,000.
        expect(result.cashUpfront).toBe(125_000);
        expect(result.items.map((item) => item.key)).toEqual([
            'deposit',
            'stampDuty',
            ...BUYING_COST_FEES.map((fee) => fee.key),
            'extra-0',
            'extra-1',
        ]);
        expect(result.items[0]).toEqual({ key: 'deposit', label: 'Deposit', value: 100_000, share: 80 });
        expect(result.items[1]).toEqual({ key: 'stampDuty', label: 'Stamp duty', value: 10_000, share: 8 });
        expect(result.items[2]).toEqual({ key: 'legalFees', label: 'Legal fees', value: 2_000, share: 1.6 });
        expect(result.items.at(-2)).toEqual({ key: 'extra-0', label: 'Furniture', value: 5_000, share: 4 });
        expect(result.items.at(-1)!.label).toBe('Other cost');
        expect(result.items.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(100, 1);
        expect(result.items.reduce((sum, item) => sum + item.value, 0)).toBe(result.cashUpfront);
    });

    it('invents no fees: every one defaults to 0 and is still listed', () => {
        const result = calculateBuyingCosts(base)!;
        const feeItems = result.items.slice(2);
        expect(feeItems).toHaveLength(BUYING_COST_FEES.length);
        expect(feeItems.every((item) => item.value === 0 && item.share === 0)).toBe(true);
    });

    it('handles a cash purchase and a purchase with nothing to pay upfront', () => {
        const cash = calculateBuyingCosts({ price: 300_000, deposit: 300_000 })!;
        expect(cash).toMatchObject({ loan: 0, stampDuty: 5_000, cashUpfront: 305_000, totalCost: 305_000 });

        // Below the stamp duty threshold with no deposit: no cash, so every share is 0.
        const nothing = calculateBuyingCosts({ price: 100_000, deposit: 0 })!;
        expect(nothing).toMatchObject({ stampDuty: 0, cashUpfront: 0, totalCost: 100_000, loan: 100_000 });
        expect(nothing.items.every((item) => item.share === 0)).toBe(true);
    });

    it('keeps pence in fees', () => {
        const result = calculateBuyingCosts({
            ...base,
            legalFees: 1_499.5,
            extras: [{ label: 'Search', amount: 0.25 }],
        })!;
        expect(result.totalFees).toBe(1_499.75);
        expect(result.cashUpfront).toBe(116_499.75);
    });

    it("rejects input it can't calculate", () => {
        expect(buyingCostsInputError(base)).toBeNull();
        expect(buyingCostsInputError({ ...base, price: 0 })).toMatch(/price/);
        expect(buyingCostsInputError({ ...base, price: Number.NaN })).toMatch(/price/);
        expect(buyingCostsInputError({ ...base, price: 2_000_000_000 })).toMatch(/lower price/);
        expect(buyingCostsInputError({ ...base, deposit: -1 })).toMatch(/deposit/);
        expect(buyingCostsInputError({ ...base, deposit: 500_001 })).toMatch(/more than the price/);
        expect(buyingCostsInputError({ ...base, legalFees: -1 })).toBe('Enter the legal fees, or leave it at 0.');
        expect(buyingCostsInputError({ ...base, survey: Number.POSITIVE_INFINITY })).toMatch(/survey/);
        expect(buyingCostsInputError({ ...base, extras: [{ label: 'Skip', amount: -5 }] })).toMatch(/other cost/);
        const tooMany = Array.from({ length: 51 }, () => ({ label: 'Extra', amount: 1 }));
        expect(buyingCostsInputError({ ...base, extras: tooMany })).toMatch(/up to 50/);
        expect(calculateBuyingCosts({ ...base, deposit: -1 })).toBeNull();
    });
});

describe('getBuyingCostsSummary', () => {
    it('gives every figure its display string and labelled row', () => {
        const { summary, error } = getBuyingCostsSummary({
            price: 300_000,
            deposit: 30_000,
            legalFees: 1_500,
            survey: 500,
            removals: 800.5,
            extras: [{ label: 'Furniture', amount: 2_000 }],
        });
        expect(error).toBeNull();
        expect(summary!.formatted).toEqual({
            cashUpfront: '£39,800.50',
            deposit: '£30,000',
            stampDuty: '£5,000',
            totalFees: '£4,800.50',
            totalCost: '£309,800.50',
            loan: '£270,000',
        });
        expect(summary!.rows[0]).toEqual({
            key: 'cashUpfront',
            label: 'Cash needed upfront',
            value: 39_800.5,
            formatted: '£39,800.50',
        });
        expect(summary!.rows.map((row) => row.key)).toEqual(Object.keys(summary!.formatted));
        expect(summary!.items[0]).toEqual({
            key: 'deposit',
            label: 'Deposit',
            value: 30_000,
            share: 75.38,
            formatted: '£30,000',
            formattedShare: '75.38%',
        });
        expect(summary!.items.at(-1)).toMatchObject({
            label: 'Furniture',
            formatted: '£2,000',
            formattedShare: '5.03%',
        });
    });

    it('survives a trip through JSON unchanged', () => {
        const result = getBuyingCostsSummary({ ...base, ...fees, extras: [{ label: 'Furniture', amount: 2_000 }] });
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it('returns the form error instead of a summary', () => {
        expect(getBuyingCostsSummary({ ...base, deposit: 600_000 })).toEqual({
            summary: null,
            error: 'The deposit is more than the price.',
        });
    });
});
