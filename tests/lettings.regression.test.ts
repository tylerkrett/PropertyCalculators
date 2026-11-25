import { describe, expect, it } from 'vitest';

import {
    calculatePricePerArea,
    comparePricePerArea,
    getPricePerAreaSummary,
    PRICE_PER_AREA_LIMITS,
    pricePerAreaFor,
    pricePerAreaInputError,
} from '../src/price-per-area/index';
import { MAX_PRICE } from '../src/stamp-duty/estimate';
import {
    calculateTenantDeposit,
    checkTenantDeposit,
    getTenantDepositSummary,
    RENT_PAID_OPTIONS,
    TENANT_DEPOSIT_KINDS,
    tenantDepositInputError,
} from '../src/tenant-deposit/index';

/* Defects found in review, each pinned with the input that showed it. */

describe('tenant deposit thresholds use the unrounded annual rent', () => {
    it('keeps the five-week cap for £49,999.9992 a year, which only rounds to £50,000', () => {
        const result = calculateTenantDeposit({ rent: 4_166.6666, rentPeriod: 'month' });
        expect(result).toMatchObject({ capWeeks: 5, maxTenancyDeposit: 4_807.69, annualRent: 50_000 });
        expect(calculateTenantDeposit({ rent: 50_000, rentPeriod: 'year' })?.capWeeks).toBe(6);
    });

    it('refuses £100,000.0044 a year as over £100,000', () => {
        const input = { rent: 8_333.3337, rentPeriod: 'month' } as const;
        expect(tenantDepositInputError(input)).toBe('The Tenant Fees Act does not cover rents above £100,000 a year.');
        expect(calculateTenantDeposit(input)).toBeNull();
        expect(calculateTenantDeposit({ rent: 100_000, rentPeriod: 'year' })).not.toBeNull();
    });
});

describe('rent in advance follows how the rent is paid, not how it is quoted', () => {
    it('limits a yearly or monthly rent paid weekly to 28 days, below one month', () => {
        const yearly = { rent: 15_600, rentPeriod: 'year' } as const;
        expect(calculateTenantDeposit(yearly)).toMatchObject({
            maxRentInAdvance: 1_300,
            rentInAdvanceBasis: 'one-month',
        });
        expect(calculateTenantDeposit({ ...yearly, rentPaid: 'more-often' })).toMatchObject({
            maxRentInAdvance: 1_200,
            rentInAdvanceBasis: '28-days',
        });
        expect(calculateTenantDeposit({ rent: 1_300, rentPaid: 'more-often' })?.maxRentInAdvance).toBe(1_200);
    });

    it('defaults from the rent period, and lets a weekly quote be paid monthly', () => {
        expect(calculateTenantDeposit({ rent: 300, rentPeriod: 'week' })?.rentInAdvanceBasis).toBe('28-days');
        expect(calculateTenantDeposit({ rent: 300, rentPeriod: 'week', rentPaid: 'monthly' })).toMatchObject({
            maxRentInAdvance: 1_300,
            rentInAdvanceBasis: 'one-month',
        });
        expect(RENT_PAID_OPTIONS.map((option) => option.label)).toEqual(['Monthly', 'More often than monthly']);
        expect(tenantDepositInputError({ rent: 300, rentPaid: 'yearly' as never })).toBe(
            'Choose whether the rent is paid monthly or more often.',
        );
    });
});

describe('tenant deposit edge cases', () => {
    it('returns null, not a TypeError, for a missing input', () => {
        expect(calculateTenantDeposit(null as never)).toBeNull();
        expect(getTenantDepositSummary(undefined as never)).toEqual({ summary: null, error: 'Enter the rent.' });
    });

    it('returns null for an unknown kind of payment instead of checking the tenancy cap', () => {
        expect(checkTenantDeposit({ rent: 1_200 }, 500, 'bogus' as never)).toBeNull();
        expect(checkTenantDeposit({ rent: 1_200 }, 500, 'toString' as never)).toBeNull();
        expect(TENANT_DEPOSIT_KINDS).toEqual(['tenancy', 'holding', 'rent-in-advance']);
        for (const kind of TENANT_DEPOSIT_KINDS)
            expect(checkTenantDeposit({ rent: 1_200 }, 500, kind)?.kind).toBe(kind);
    });

    it('shows one week’s rent and the holding deposit cap as the same floored figure', () => {
        const { summary } = getTenantDepositSummary({ rent: 1_000 });
        expect(summary?.formatted.weeklyRent).toBe('£230.76');
        expect(summary?.formatted.maxHoldingDeposit).toBe('£230.76');
    });
});

describe('price per area', () => {
    const sale = { amount: 1_000_000, area: 800, areaUnit: 'sqft' } as const;

    it('bounds the amount and the area instead of overflowing', () => {
        expect(pricePerAreaInputError({ amount: 1e308, area: 1, areaUnit: 'sqft', rentPeriod: 'week' })).toBe(
            'Enter a lower rent.',
        );
        expect(pricePerAreaInputError({ amount: 1e300, area: 1e-20, areaUnit: 'sqft' })).toBe('Enter a lower price.');
        expect(pricePerAreaInputError({ ...sale, area: 1e-20 })).toBe('Enter a floor area of at least 1.');
        expect(pricePerAreaInputError({ ...sale, area: 1e12 })).toBe('Enter a smaller floor area.');
        expect(calculatePricePerArea({ amount: 1e308, area: 1, areaUnit: 'sqft', rentPeriod: 'week' })).toBeNull();
        expect(pricePerAreaFor(1e300, 1e-20)).toBeNull();
        expect(pricePerAreaInputError({ ...sale, amount: MAX_PRICE, area: PRICE_PER_AREA_LIMITS.area.max })).toBeNull();
    });

    it('rounds 1.005 up to 1.01', () => {
        expect(calculatePricePerArea({ amount: 201, area: 200, areaUnit: 'sqft' })?.perSqFt).toBe(1.01);
    });

    it('shows pence for a sale figure under £100', () => {
        const { summary } = getPricePerAreaSummary({ amount: 2_000, area: 5_000, areaUnit: 'sqft' });
        expect(summary?.formatted.perSqFt).toBe('£0.40 per sq ft');
        expect(getPricePerAreaSummary(sale).summary?.formatted.perSqFt).toBe('£1,250 per sq ft');
    });

    it('shows pence when the difference is under £1, and never "-£0"', () => {
        const comparison = comparePricePerArea(sale, { perArea: 1_250.4, unit: 'sqft' });
        expect(comparison).toMatchObject({ difference: -0.4, differencePercent: -0.03, position: 'below' });
        expect(comparison?.formatted).toMatchObject({
            subject: '£1,250.00 per sq ft',
            comparable: '£1,250.40 per sq ft',
            difference: '-£0.40 per sq ft',
            sentence: '0.03% below the comparable average',
        });
        const level = comparePricePerArea(sale, { perArea: 1_250, unit: 'sqft' });
        expect(level?.formatted.difference).not.toContain('-');
        expect(level?.formatted.sentence).toBe('In line with the comparable average');
    });

    it('takes the position and the percentage from the same comparison', () => {
        const comparison = comparePricePerArea(
            { amount: 149, area: 10_000, areaUnit: 'sqft' },
            { perArea: 0.01, unit: 'sqft' },
        );
        expect(comparison).toMatchObject({ position: 'above', differencePercent: 49 });
        expect(comparison?.formatted.differencePercent).toBe('+49%');
        expect(comparison?.formatted.sentence).toBe('49% above the comparable average');
    });

    it('returns null, not a TypeError, for a missing comparable or input', () => {
        expect(comparePricePerArea(sale, null)).toBeNull();
        expect(comparePricePerArea(sale, undefined)).toBeNull();
        expect(pricePerAreaInputError(null as never)).toBe('Enter the property price.');
        expect(calculatePricePerArea(null as never)).toBeNull();
    });
});
