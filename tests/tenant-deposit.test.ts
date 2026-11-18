import { describe, expect, it } from 'vitest';

import {
    calculateTenantDeposit,
    checkTenantDeposit,
    getTenantDepositSummary,
    TENANT_DEPOSIT_JURISDICTION,
    TENANT_DEPOSIT_LABELS,
    TENANT_DEPOSIT_RULES,
    tenantDepositInputError,
} from '../src/tenant-deposit/index';

describe('calculateTenantDeposit', () => {
    it('GOV.UK statutory guidance example: £240 a week caps the deposit at £1,200 and the holding deposit at £240', () => {
        expect(calculateTenantDeposit({ rent: 240, rentPeriod: 'week' })).toEqual({
            jurisdiction: 'England',
            annualRent: 12_480,
            weeklyRent: 240,
            capWeeks: 5,
            maxTenancyDeposit: 1_200,
            maxHoldingDeposit: 240,
            maxRentInAdvance: 960,
            rentInAdvanceBasis: '28-days',
        });
    });

    it('takes a week of a monthly rent as the rent times 12 over 52 (Schedule 1, paragraph 2(4))', () => {
        const result = calculateTenantDeposit({ rent: 1_200 });
        expect(result?.annualRent).toBe(14_400);
        expect(result?.weeklyRent).toBe(276.92);
        expect(result?.maxHoldingDeposit).toBe(276.92);
        expect(result?.maxRentInAdvance).toBe(1_200);
        expect(result?.rentInAdvanceBasis).toBe('one-month');
    });

    it('rounds every maximum down to the penny, so the figure never exceeds the cap', () => {
        // Five weeks of £1,200 a month is £1,384.6153…: £1,384.62 would be a prohibited payment.
        expect(calculateTenantDeposit({ rent: 1_200 })?.maxTenancyDeposit).toBe(1_384.61);
        // One week of £1,000 a month is £230.7692…: shown to the nearest penny, capped a penny lower.
        const result = calculateTenantDeposit({ rent: 1_000 });
        expect(result?.weeklyRent).toBe(230.77);
        expect(result?.maxHoldingDeposit).toBe(230.76);
        expect(result?.maxTenancyDeposit).toBe(1_153.84);
    });

    it('does not lose a penny to floating point when the cap is a whole number', () => {
        expect(calculateTenantDeposit({ rent: 5_200, rentPeriod: 'year' })?.maxTenancyDeposit).toBe(500);
        expect(calculateTenantDeposit({ rent: 100.1, rentPeriod: 'week' })?.maxTenancyDeposit).toBe(500.5);
        expect(calculateTenantDeposit({ rent: 100.1, rentPeriod: 'week' })?.maxHoldingDeposit).toBe(100.1);
    });

    it('moves from five weeks to six at exactly £50,000 a year: £49,999.99 is five, £50,000 is six', () => {
        const below = calculateTenantDeposit({ rent: 49_999.99, rentPeriod: 'year' });
        expect(below?.capWeeks).toBe(5);
        expect(below?.maxTenancyDeposit).toBe(4_807.69);
        const at = calculateTenantDeposit({ rent: 50_000, rentPeriod: 'year' });
        expect(at?.capWeeks).toBe(6);
        expect(at?.maxTenancyDeposit).toBe(5_769.23);
        expect(at?.maxHoldingDeposit).toBe(961.53);
    });

    it('applies the threshold to the annual rent of a monthly or weekly rent', () => {
        // £4,166.66 a month is £49,999.92 a year; a penny more is £50,000.04.
        expect(calculateTenantDeposit({ rent: 4_166.66 })?.capWeeks).toBe(5);
        expect(calculateTenantDeposit({ rent: 4_166.67 })?.capWeeks).toBe(6);
        expect(calculateTenantDeposit({ rent: 961.53, rentPeriod: 'week' })?.capWeeks).toBe(5);
        expect(calculateTenantDeposit({ rent: 961.54, rentPeriod: 'week' })?.capWeeks).toBe(6);
    });

    it('gives the same caps for the same rent quoted per week, month or year', () => {
        const weekly = calculateTenantDeposit({ rent: 300, rentPeriod: 'week' });
        const monthly = calculateTenantDeposit({ rent: 1_300, rentPeriod: 'month' });
        const yearly = calculateTenantDeposit({ rent: 15_600, rentPeriod: 'year' });
        for (const result of [weekly, monthly, yearly]) {
            expect(result?.annualRent).toBe(15_600);
            expect(result?.maxTenancyDeposit).toBe(1_500);
            expect(result?.maxHoldingDeposit).toBe(300);
        }
    });

    it('limits rent before the tenancy starts to one month, or 28 days for a weekly rent (Renters’ Rights Act 2025)', () => {
        expect(calculateTenantDeposit({ rent: 15_600, rentPeriod: 'year' })?.maxRentInAdvance).toBe(1_300);
        expect(calculateTenantDeposit({ rent: 1_300 })?.maxRentInAdvance).toBe(1_300);
        const weekly = calculateTenantDeposit({ rent: 300, rentPeriod: 'week' });
        expect(weekly?.maxRentInAdvance).toBe(1_200);
        expect(weekly?.rentInAdvanceBasis).toBe('28-days');
    });

    it('explains what is missing, and refuses rents above £100,000 a year as outside the Act', () => {
        expect(tenantDepositInputError({ rent: Number.NaN })).toBe('Enter the rent.');
        expect(tenantDepositInputError({ rent: 0 })).toBe('Enter the rent.');
        expect(tenantDepositInputError({ rent: -500 })).toBe('Enter the rent.');
        expect(tenantDepositInputError({ rent: Number.POSITIVE_INFINITY })).toBe('Enter the rent.');
        expect(tenantDepositInputError({ rent: '1200' as unknown as number })).toBe('Enter the rent.');
        expect(tenantDepositInputError({ rent: 1, rentPeriod: 'day' as never })).toContain('week, month or year');
        expect(tenantDepositInputError({ rent: 100_000, rentPeriod: 'year' })).toBeNull();
        expect(tenantDepositInputError({ rent: 100_000.01, rentPeriod: 'year' })).toContain('£100,000');
        expect(calculateTenantDeposit({ rent: 100_000, rentPeriod: 'year' })?.maxTenancyDeposit).toBe(11_538.46);
        expect(calculateTenantDeposit({ rent: 9_000 })).toBeNull();
        expect(calculateTenantDeposit({ rent: 0 })).toBeNull();
        expect(getTenantDepositSummary({ rent: 0 })).toEqual({ summary: null, error: 'Enter the rent.' });
    });
});

describe('getTenantDepositSummary', () => {
    it('formats every figure and lists them as labelled rows, tenancy deposit first', () => {
        const { summary, error } = getTenantDepositSummary({ rent: 1_200 });
        expect(error).toBeNull();
        expect(summary?.formatted).toEqual({
            maxTenancyDeposit: '£1,384.61',
            maxHoldingDeposit: '£276.92',
            maxRentInAdvance: '£1,200.00',
            capWeeks: '5 weeks’ rent',
            weeklyRent: '£276.92',
            annualRent: '£14,400',
        });
        expect(summary?.rows.map((row) => row.key)).toEqual(Object.keys(TENANT_DEPOSIT_LABELS));
        expect(summary?.rows[0]).toEqual({
            key: 'maxTenancyDeposit',
            label: 'Maximum tenancy deposit',
            value: 1_384.61,
            formatted: '£1,384.61',
        });
        expect(getTenantDepositSummary({ rent: 5_000 }).summary?.formatted.capWeeks).toBe('6 weeks’ rent');
        expect(getTenantDepositSummary({ rent: 49_999.99, rentPeriod: 'year' }).summary?.formatted.annualRent).toBe(
            '£49,999.99',
        );
    });

    it('survives a trip through JSON unchanged', () => {
        const result = getTenantDepositSummary({ rent: 1_234.56 });
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it('states that the rules are England’s, with the figures they turn on', () => {
        expect(TENANT_DEPOSIT_JURISDICTION).toBe('England');
        expect(getTenantDepositSummary({ rent: 1_200 }).summary?.jurisdiction).toBe('England');
        expect(TENANT_DEPOSIT_RULES.higherCapAnnualRent).toBe(50_000);
        expect(TENANT_DEPOSIT_RULES.sources[0]).toContain('legislation.gov.uk/ukpga/2019/4');
    });
});

describe('checkTenantDeposit', () => {
    it('passes a deposit at the cap and reports the excess of one above it', () => {
        expect(checkTenantDeposit({ rent: 1_200 }, 1_384.61)).toMatchObject({
            kind: 'tenancy',
            cap: 1_384.61,
            withinCap: true,
            over: 0,
        });
        const over = checkTenantDeposit({ rent: 1_200 }, 1_500);
        expect(over).toMatchObject({ withinCap: false, over: 115.39, proposed: 1_500 });
        expect(over?.formatted).toEqual({
            proposed: '£1,500.00',
            cap: '£1,384.61',
            over: '£115.39',
            sentence: '£1,500.00 is £115.39 over the £1,384.61 cap',
        });
        expect(checkTenantDeposit({ rent: 1_200 }, 1_384.62)?.over).toBe(0.01);
        expect(checkTenantDeposit({ rent: 1_200 }, 0)?.formatted.sentence).toBe('£0.00 is within the £1,384.61 cap');
    });

    it('GOV.UK statutory guidance example: £240 from each of three joint tenants breaks the £240 holding deposit cap', () => {
        const check = checkTenantDeposit({ rent: 240, rentPeriod: 'week' }, 720, 'holding');
        expect(check).toMatchObject({ kind: 'holding', cap: 240, withinCap: false, over: 480 });
        expect(checkTenantDeposit({ rent: 240, rentPeriod: 'week' }, 240, 'holding')?.withinCap).toBe(true);
    });

    it('checks rent taken before the tenancy starts against the one-month limit', () => {
        expect(checkTenantDeposit({ rent: 1_200 }, 7_200, 'rent-in-advance')).toMatchObject({
            cap: 1_200,
            withinCap: false,
            over: 6_000,
        });
    });

    it('returns null for an invalid rent or amount, and round-trips through JSON', () => {
        expect(checkTenantDeposit({ rent: 0 }, 500)).toBeNull();
        expect(checkTenantDeposit({ rent: 1_200 }, -1)).toBeNull();
        expect(checkTenantDeposit({ rent: 1_200 }, Number.NaN)).toBeNull();
        const check = checkTenantDeposit({ rent: 1_200 }, 1_500);
        expect(JSON.parse(JSON.stringify(check))).toEqual(check);
    });
});
