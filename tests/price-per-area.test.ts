import { describe, expect, it } from 'vitest';

import {
    calculatePricePerArea,
    comparePricePerArea,
    getPricePerAreaSummary,
    PRICE_PER_AREA_LABELS,
    pricePerAreaFor,
    pricePerAreaInputError,
    SQFT_PER_SQM,
} from '../src/price-per-area/index';

describe('calculatePricePerArea', () => {
    it('divides a sale price by the area, in both units', () => {
        expect(calculatePricePerArea({ amount: 1_000_000, area: 800, areaUnit: 'sqft' })).toEqual({
            basis: 'sale',
            amount: 1_000_000,
            areaSqFt: 800,
            areaSqM: 74.32,
            perSqFt: 1_250,
            perSqM: 13_454.88,
        });
    });

    it('converts square metres to square feet at 10.7639, the desk calculator’s figure', () => {
        expect(SQFT_PER_SQM).toBe(10.7639);
        const result = calculatePricePerArea({ amount: 500_000, area: 100, areaUnit: 'sqm' });
        expect(result?.areaSqM).toBe(100);
        expect(result?.areaSqFt).toBe(1_076.39);
        expect(result?.perSqM).toBe(5_000);
        expect(result?.perSqFt).toBe(464.52);
    });

    it('gives the same answer whichever unit the same area is entered in', () => {
        const metres = calculatePricePerArea({ amount: 750_000, area: 100, areaUnit: 'sqm' });
        const feet = calculatePricePerArea({ amount: 750_000, area: 1_076.39, areaUnit: 'sqft' });
        expect(feet).toEqual(metres);
    });

    it('takes a rent to a full year: weekly, monthly and yearly rents of the same amount agree', () => {
        const weekly = calculatePricePerArea({ amount: 750, area: 1_000, areaUnit: 'sqft', rentPeriod: 'week' });
        const monthly = calculatePricePerArea({ amount: 3_250, area: 1_000, areaUnit: 'sqft', rentPeriod: 'month' });
        const yearly = calculatePricePerArea({ amount: 39_000, area: 1_000, areaUnit: 'sqft', rentPeriod: 'year' });
        expect(weekly).toEqual({
            basis: 'rent',
            amount: 39_000,
            areaSqFt: 1_000,
            areaSqM: 92.9,
            perSqFt: 39,
            perSqM: 419.79,
        });
        expect(monthly).toEqual(weekly);
        expect(yearly).toEqual(weekly);
    });

    it('rounds per-area figures to two decimals', () => {
        // £100 over 3 sq ft is £33.333…; £200 over 3 is £66.666….
        expect(calculatePricePerArea({ amount: 100, area: 3, areaUnit: 'sqft' })?.perSqFt).toBe(33.33);
        expect(calculatePricePerArea({ amount: 200, area: 3, areaUnit: 'sqft' })?.perSqFt).toBe(66.67);
    });

    it('explains what is missing or invalid', () => {
        const valid = { amount: 500_000, area: 900, areaUnit: 'sqft' } as const;
        expect(pricePerAreaInputError(valid)).toBeNull();
        expect(pricePerAreaInputError({ ...valid, amount: 0 })).toBe('Enter the property price.');
        expect(pricePerAreaInputError({ ...valid, amount: Number.NaN })).toBe('Enter the property price.');
        expect(pricePerAreaInputError({ ...valid, amount: -1, rentPeriod: 'month' })).toBe('Enter the rent.');
        expect(pricePerAreaInputError({ ...valid, area: 0 })).toBe('Enter the floor area.');
        expect(pricePerAreaInputError({ ...valid, area: Number.POSITIVE_INFINITY })).toBe('Enter the floor area.');
        expect(pricePerAreaInputError({ ...valid, areaUnit: 'acre' as never })).toContain('square feet');
        expect(pricePerAreaInputError({ ...valid, rentPeriod: 'day' as never })).toContain('week, month or year');
        expect(calculatePricePerArea({ ...valid, area: 0 })).toBeNull();
        expect(getPricePerAreaSummary({ ...valid, area: -5 })).toEqual({
            summary: null,
            error: 'Enter the floor area.',
        });
    });
});

describe('getPricePerAreaSummary', () => {
    it('formats a sale in whole pounds, with labelled rows led by price per sq ft', () => {
        const { summary, error } = getPricePerAreaSummary({ amount: 1_000_000, area: 800, areaUnit: 'sqft' });
        expect(error).toBeNull();
        expect(summary?.formatted).toEqual({
            perSqFt: '£1,250 per sq ft',
            perSqM: '£13,455 per sq m',
            amount: '£1,000,000',
            areaSqFt: '800 sq ft',
            areaSqM: '74.32 sq m',
        });
        expect(summary?.rows.map((row) => row.key)).toEqual(Object.keys(PRICE_PER_AREA_LABELS.sale));
        expect(summary?.rows[0]).toEqual({
            key: 'perSqFt',
            label: 'Price per sq ft',
            value: 1_250,
            formatted: '£1,250 per sq ft',
        });
    });

    it('formats a rent in pounds and pence per year, with rent labels', () => {
        const { summary } = getPricePerAreaSummary({ amount: 2_500, area: 65, areaUnit: 'sqm', rentPeriod: 'month' });
        expect(summary?.formatted).toEqual({
            perSqFt: '£42.88 per sq ft per year',
            perSqM: '£461.54 per sq m per year',
            amount: '£30,000',
            areaSqFt: '699.65 sq ft',
            areaSqM: '65 sq m',
        });
        expect(summary?.rows.map((row) => row.label)).toEqual(Object.values(PRICE_PER_AREA_LABELS.rent));
    });

    it('survives a trip through JSON unchanged', () => {
        const result = getPricePerAreaSummary({ amount: 425_000, area: 83.5, areaUnit: 'sqm' });
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });
});

describe('pricePerAreaFor', () => {
    it('gives just the number for a listing card, per square foot unless asked otherwise', () => {
        expect(pricePerAreaFor(1_000_000, 800)).toBe(1_250);
        expect(pricePerAreaFor(500_000, 100, 'sqm')).toBe(464.52);
        expect(pricePerAreaFor(500_000, 100, 'sqm', { per: 'sqm' })).toBe(5_000);
        expect(pricePerAreaFor(3_250, 1_000, 'sqft', { rentPeriod: 'month' })).toBe(39);
    });

    it('gives null when the price or area is missing or invalid', () => {
        expect(pricePerAreaFor(null, 800)).toBeNull();
        expect(pricePerAreaFor(undefined, 800)).toBeNull();
        expect(pricePerAreaFor(500_000, null)).toBeNull();
        expect(pricePerAreaFor(500_000, 0)).toBeNull();
        expect(pricePerAreaFor(Number.NaN, 800)).toBeNull();
        expect(pricePerAreaFor('500000' as unknown as number, 800)).toBeNull();
        expect(pricePerAreaFor(500_000, 800, 'acre' as never)).toBeNull();
    });
});

describe('comparePricePerArea', () => {
    const property = { amount: 1_000_000, area: 800, areaUnit: 'sqft' } as const;

    it('gives the difference from a comparable average in pounds and percent', () => {
        expect(comparePricePerArea(property, { perArea: 1_150, unit: 'sqft' })).toEqual({
            unit: 'sqft',
            subject: 1_250,
            comparable: 1_150,
            difference: 100,
            differencePercent: 8.7,
            position: 'above',
            formatted: {
                subject: '£1,250 per sq ft',
                comparable: '£1,150 per sq ft',
                difference: '+£100 per sq ft',
                differencePercent: '+8.7%',
                sentence: '8.7% above the comparable average',
            },
        });
    });

    it('shows a cheaper property as below, with negative figures', () => {
        const result = comparePricePerArea(property, { perArea: 1_400, unit: 'sqft' });
        expect(result).toMatchObject({ difference: -150, differencePercent: -10.71, position: 'below' });
        expect(result?.formatted.difference).toBe('-£150 per sq ft');
        expect(result?.formatted.differencePercent).toBe('-10.71%');
        expect(result?.formatted.sentence).toBe('10.71% below the comparable average');
    });

    it('compares in the comparable’s unit, converting the property’s area if need be', () => {
        const result = comparePricePerArea(property, { perArea: 13_454.88, unit: 'sqm' });
        expect(result).toMatchObject({ unit: 'sqm', subject: 13_454.88, difference: 0, position: 'same' });
        expect(result?.formatted.sentence).toBe('In line with the comparable average');
    });

    it('compares rents per year, in pounds and pence', () => {
        const result = comparePricePerArea(
            { amount: 3_250, area: 1_000, areaUnit: 'sqft', rentPeriod: 'month' },
            { perArea: 36.5, unit: 'sqft' },
        );
        expect(result).toMatchObject({ subject: 39, difference: 2.5, differencePercent: 6.85 });
        expect(result?.formatted.difference).toBe('+£2.50 per sq ft per year');
    });

    it('returns null for invalid input, and round-trips through JSON', () => {
        expect(comparePricePerArea({ ...property, area: 0 }, { perArea: 1_150, unit: 'sqft' })).toBeNull();
        expect(comparePricePerArea(property, { perArea: 0, unit: 'sqft' })).toBeNull();
        expect(comparePricePerArea(property, { perArea: 1_150, unit: 'acre' as never })).toBeNull();
        const result = comparePricePerArea(property, { perArea: 1_150, unit: 'sqft' });
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });
});
