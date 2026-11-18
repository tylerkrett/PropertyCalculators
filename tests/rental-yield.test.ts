import { describe, expect, it } from 'vitest';

import { rentalYieldPdf, rentalYieldReport } from '../src/pdf/index';
import {
    calculateRentalYield,
    getPortfolioYield,
    getRentalYieldSummary,
    rentalYieldInputError,
} from '../src/rental-yield/index';

describe('calculateRentalYield', () => {
    it('gives gross yield on the price and net yield on the full cost of buying', () => {
        const result = calculateRentalYield({ price: 400_000, rent: 2_000, annualCosts: 4_000, purchaseCosts: 3_000 });
        // Additional-property stamp duty on £400,000: 5% of 125k + 7% of 125k + 10% of 150k.
        expect(result).toEqual({
            annualRent: 24_000,
            rentReceived: 24_000,
            annualCosts: 4_000,
            netIncome: 20_000,
            stampDuty: 30_000,
            totalCost: 433_000,
            grossYield: 6,
            netYield: 4.62,
        });
    });

    it('reads weekly and yearly rents, and takes empty weeks off the rent received', () => {
        expect(calculateRentalYield({ price: 520_000, rent: 500, rentPeriod: 'week' })?.annualRent).toBe(26_000);
        expect(calculateRentalYield({ price: 520_000, rent: 26_000, rentPeriod: 'year' })?.grossYield).toBe(5);
        const withVoids = calculateRentalYield({ price: 520_000, rent: 500, rentPeriod: 'week', voidWeeks: 4 });
        expect(withVoids?.rentReceived).toBe(24_000);
        // Gross yield is the quoted figure: a full year, whatever the voids.
        expect(withVoids?.grossYield).toBe(5);
    });

    it('charges the stamp duty of the buyer type given', () => {
        const input = { price: 400_000, rent: 2_000 };
        expect(calculateRentalYield({ ...input, buyer: 'home-mover' })?.stampDuty).toBe(10_000);
        expect(calculateRentalYield({ ...input, nonUkResident: true })?.stampDuty).toBe(38_000);
    });

    it('shows a loss as a negative yield', () => {
        const { summary } = getRentalYieldSummary({ price: 400_000, rent: 500, annualCosts: 9_000 });
        expect(summary?.netIncome).toBe(-3_000);
        expect(summary?.netYield).toBeLessThan(0);
        expect(summary?.formatted.netIncome).toBe('-£3,000');
    });

    it('explains what is missing or out of range', () => {
        expect(rentalYieldInputError({ price: Number.NaN, rent: 1 })).toBe('Enter the property price.');
        expect(rentalYieldInputError({ price: 1, rent: 0 })).toBe('Enter the rent.');
        expect(rentalYieldInputError({ price: 1, rent: 1, voidWeeks: 60 })).toContain('between 0 and 52');
        expect(rentalYieldInputError({ price: 1, rent: 1, annualCosts: -1 })).toContain('running costs');
        expect(calculateRentalYield({ price: 0, rent: 1 })).toBeNull();
        expect(getRentalYieldSummary({ price: 0, rent: 1 })).toEqual({
            summary: null,
            error: 'Enter the property price.',
        });
    });
});

describe('getRentalYieldSummary', () => {
    it('leads with the net yield and formats every figure', () => {
        const { summary } = getRentalYieldSummary({ price: 400_000, rent: 2_000, annualCosts: 4_000 });
        expect(summary?.rows[0]).toEqual({ key: 'netYield', label: 'Net yield', value: 4.65, formatted: '4.65%' });
        expect(summary?.formatted).toMatchObject({ grossYield: '6%', annualRent: '£24,000', totalCost: '£430,000' });
    });
});

describe('getPortfolioYield', () => {
    it('adds the properties up before dividing, and skips the ones it cannot calculate', () => {
        const portfolio = getPortfolioYield([
            { price: 400_000, rent: 2_000, buyer: 'home-mover' },
            { price: 100_000, rent: 1_000, buyer: 'home-mover' },
            { price: 0, rent: 1_000 },
        ]);
        expect(portfolio).toMatchObject({ properties: 2, price: 500_000, annualRent: 36_000, grossYield: 7.2 });
        expect(portfolio?.formatted.grossYield).toBe('7.2%');
        expect(getPortfolioYield([])).toBeNull();
    });
});

describe('rentalYieldPdf', () => {
    it('prints the calculation, and refuses one that cannot be calculated', async () => {
        const input = { price: 400_000, rent: 2_000, voidWeeks: 2 };
        expect(rentalYieldReport(input)?.facts).toContainEqual({ label: 'Rent', value: '£2,000 per month' });
        const body = new TextDecoder('latin1').decode(await rentalYieldPdf(input, { date: false }));
        expect(body).toContain('(Rental yield estimate)');
        expect(body).toContain('(Net yield)');
        await expect(rentalYieldPdf({ price: 0, rent: 1 })).rejects.toThrow(RangeError);
    });
});
