import { describe, expect, it } from 'vitest';

import {
    calculateTenantAffordability,
    getTenantAffordabilitySummary,
    maxRentForIncome,
    TENANT_AFFORDABILITY_DEFAULTS,
    TENANT_AFFORDABILITY_LABELS,
    TENANT_AFFORDABILITY_LIMITS,
    type TenantAffordabilityInput,
    tenantAffordabilityInputError,
} from '../src/tenant-affordability/index';

// Short names for the functions under test, so each expectation fits on a line.
const afford = calculateTenantAffordability;
const inputError = tenantAffordabilityInputError;
const summarise = getTenantAffordabilitySummary;
type Input = TenantAffordabilityInput;

describe('calculateTenantAffordability: rent to income', () => {
    it('hand-worked: £1,500 a month for two tenants earning £42,000 between them', () => {
        // Needed: 1,500 × 30 = 45,000, or 22,500 each. Guarantor: 1,500 × 36 = 54,000.
        // Short by 45,000 − 42,000 = 3,000. £42,000 supports 42,000 / 30 = 1,400 a month,
        // which is 1,400 × 12 / 52 = 323.0769… a week, rounded down to 323.07.
        expect(afford({ rent: 1_500, tenants: 2, income: 42_000 })).toEqual({
            monthlyRent: 1_500,
            incomeNeeded: 45_000,
            incomeNeededPerTenant: 22_500,
            guarantorIncomeNeeded: 54_000,
            ...{ multiple: 30, guarantorMultiple: 36, tenants: 2, income: 42_000 },
            ...{ passes: false, shortfall: 3_000, maxMonthlyRent: 1_400, maxWeeklyRent: 323.07 },
        });
    });

    it('hand-worked: £650 a week with no income to check', () => {
        // Month: 650 × 52 / 12 = 2,816.666… → 2,816.67. Needed: 2,816.666… × 30 = 84,500 exactly.
        // Guarantor: 2,816.666… × 36 = 101,400.
        expect(afford({ rent: 650, rentPeriod: 'week' })).toEqual({
            monthlyRent: 2_816.67,
            incomeNeeded: 84_500,
            incomeNeededPerTenant: 84_500,
            guarantorIncomeNeeded: 101_400,
            ...{ multiple: 30, guarantorMultiple: 36, tenants: 1 },
            ...{ income: null, passes: null, shortfall: null, maxMonthlyRent: null, maxWeeklyRent: null },
        });
    });

    it('passes an income exactly at the requirement and fails one a penny under it', () => {
        expect(afford({ rent: 1_500, income: 45_000 })).toMatchObject({ passes: true, shortfall: 0 });
        expect(afford({ rent: 1_500, income: 44_999.99 })).toMatchObject({ passes: false, shortfall: 0.01 });
        expect(afford({ rent: 1_500, income: 45_000.01 })).toMatchObject({ passes: true, shortfall: 0 });
        // 1,234.56 × 30 = 37,036.80: floating point must not make the exact income fall short.
        expect(afford({ rent: 1_234.56, income: 37_036.8 })).toMatchObject({
            incomeNeeded: 37_036.8,
            passes: true,
            shortfall: 0,
            maxMonthlyRent: 1_234.56,
        });
        expect(afford({ rent: 1_500, income: 0 })).toMatchObject({
            passes: false,
            shortfall: 45_000,
            maxMonthlyRent: 0,
            maxWeeklyRent: 0,
        });
    });

    it('works from the same monthly rent whichever period it is entered in', () => {
        // 300 × 52 = 15,600 = 1,300 × 12, so each needs 1,300 × 30 = 39,000.
        const monthly = afford({ rent: 1_300, income: 39_000 });
        expect(monthly).toMatchObject({ monthlyRent: 1_300, incomeNeeded: 39_000, passes: true });
        expect(afford({ rent: 300, rentPeriod: 'week', income: 39_000 })).toEqual(monthly);
        expect(afford({ rent: 15_600, rentPeriod: 'year', income: 39_000 })).toEqual(monthly);
    });

    it('rounds the amounts needed to the nearest penny and splits them equally', () => {
        // 30,000 / 7 = 4,285.714… → 4,285.71; 30,000 / 3 = 10,000.
        expect(afford({ rent: 1_000, tenants: 7 })?.incomeNeededPerTenant).toBe(4_285.71);
        expect(afford({ rent: 1_000, tenants: 3 })?.incomeNeededPerTenant).toBe(10_000);
        // £333.33 a week: 333.33 × 52 / 12 = 1,444.43 a month; × 30 = 43,332.90; × 36 = 51,999.48.
        expect(afford({ rent: 333.33, rentPeriod: 'week' })).toMatchObject({
            monthlyRent: 1_444.43,
            incomeNeeded: 43_332.9,
            guarantorIncomeNeeded: 51_999.48,
        });
    });

    it('uses the multiples given: 2.5 times the annual rent is 30, 3 times is 36', () => {
        expect(TENANT_AFFORDABILITY_DEFAULTS).toMatchObject({ multiple: 30, guarantorMultiple: 36 });
        // 1,000 × 36 = 36,000 for the tenant and 1,000 × 40 = 40,000 for the guarantor.
        expect(afford({ rent: 1_000, multiple: 36, guarantorMultiple: 40 })).toMatchObject({
            incomeNeeded: 36_000,
            guarantorIncomeNeeded: 40_000,
        });
        // 35,000 / 36 = 972.222… → 972.22 a month.
        expect(afford({ rent: 1_000, multiple: 36, income: 35_000 })).toMatchObject({
            passes: false,
            shortfall: 1_000,
            maxMonthlyRent: 972.22,
        });
    });
});

describe('maxRentForIncome: income to rent', () => {
    it('hand-worked: £45,000 a year supports £1,500 a month', () => {
        // 45,000 / 30 = 1,500; × 12 = 18,000 a year; / 52 = 346.1538… → 346.15.
        expect(maxRentForIncome({ income: 45_000 })).toEqual({ monthly: 1_500, weekly: 346.15, annual: 18_000 });
    });

    it('rounds down, so the rent shown never needs more than the income', () => {
        // 50,000 / 30 = 1,666.666… → 1,666.66, not .67; week 20,000 / 52 = 384.615… → 384.61.
        expect(maxRentForIncome({ income: 50_000 })).toEqual({ monthly: 1_666.66, weekly: 384.61, annual: 20_000 });
        // 40,000 / 30 = 1,333.333… → 1,333.33; week 16,000 / 52 = 307.692… → 307.69.
        expect(maxRentForIncome({ income: 40_000 })).toEqual({ monthly: 1_333.33, weekly: 307.69, annual: 16_000 });
        expect(maxRentForIncome({ income: 0 })).toEqual({ monthly: 0, weekly: 0, annual: 0 });
        // 100,000 / 36 = 2,777.777… → 2,777.77.
        expect(maxRentForIncome({ income: 100_000, multiple: 36 })?.monthly).toBe(2_777.77);
    });

    it('round-trips: the rent it gives passes for that income, and a penny more a month does not', () => {
        for (const income of [12_000, 25_000, 31_999.99, 40_000, 50_000, 87_654.32, 250_000]) {
            const max = maxRentForIncome({ income })!;
            expect(afford({ rent: max.monthly, income })?.passes, `${income}`).toBe(true);
            expect(afford({ rent: max.monthly + 0.01, income })?.passes, `${income}`).toBe(false);
            expect(afford({ rent: max.weekly, rentPeriod: 'week', income })?.passes).toBe(true);
            expect(afford({ rent: max.annual, rentPeriod: 'year', income })?.passes).toBe(true);
            // And the check reports the same maximums.
            expect(afford({ rent: 1_000, income })).toMatchObject({
                maxMonthlyRent: max.monthly,
                maxWeeklyRent: max.weekly,
            });
        }
    });

    it('is the inverse of the income needed', () => {
        for (const rent of [500, 1_250, 1_500, 3_200]) {
            const needed = afford({ rent })!.incomeNeeded;
            expect(maxRentForIncome({ income: needed })?.monthly).toBe(rent);
        }
    });

    it('returns null for hostile input and never throws', () => {
        const notObjects: unknown[] = [undefined, null, 45_000, 'income', [], {}];
        const incomes = [Number.NaN, Number.POSITIVE_INFINITY, -1, '45000', 2e9].map((income) => ({ income }));
        const multiples = [0, Number.NaN, '30', 101].map((multiple) => ({ income: 45_000, multiple }));
        const hostile = [...notObjects, ...incomes, ...multiples];
        for (const input of hostile) expect(maxRentForIncome(input as never), JSON.stringify(input)).toBeNull();
    });
});

describe('tenantAffordabilityInputError', () => {
    it('words each problem for the form', () => {
        const ok = { rent: 1_500 };
        expect(inputError(ok)).toBeNull();
        expect(inputError({ rent: 0 })).toBe('Enter the rent.');
        expect(inputError({ rent: 2e9 })).toBe('Enter a lower rent.');
        expect(inputError({ ...ok, rentPeriod: 'day' as never })).toBe(
            'Choose whether the rent is per week, month or year.',
        );
        expect(inputError({ ...ok, multiple: 0 })).toBe('Enter an income multiple from 1 to 100.');
        expect(inputError({ ...ok, guarantorMultiple: 101 })).toBe('Enter a guarantor multiple from 1 to 100.');
        expect(inputError({ ...ok, tenants: 1.5 })).toBe('Enter the number of tenants, from 1 to 20.');
        expect(inputError({ ...ok, income: -1 })).toBe('Enter the combined annual income, or leave it empty.');
        expect(inputError({ ...ok, income: Number.NaN })).toBe('Enter the combined annual income, or leave it empty.');
        expect(inputError({ ...ok, income: 2e9 })).toBe('Enter a lower income.');
    });

    it('accepts the limits themselves', () => {
        const { multiple, tenants, income, rent } = TENANT_AFFORDABILITY_LIMITS;
        for (const edge of [multiple.min, multiple.max]) {
            expect(inputError({ rent: 1_500, multiple: edge, guarantorMultiple: edge })).toBeNull();
        }
        expect(inputError({ rent: 1_500, tenants: tenants.max, income: income.max })).toBeNull();
        expect(inputError({ rent: rent.max, rentPeriod: 'week' })).toBeNull();
        expect(inputError({ rent: 1_500, tenants: tenants.max + 1 })).not.toBeNull();
    });

    it('never throws on hostile input: it is an error, and null from the maths', () => {
        const notObjects: unknown[] = [undefined, null, 1_500, 'rent', [], () => 1, {}];
        const rents = [Number.NaN, Number.NEGATIVE_INFINITY, '1500', null, [1_500]].map((rent) => ({ rent }));
        const fields: object[] = [
            ...[12, 'constructor', {}].map((rentPeriod) => ({ rentPeriod })),
            ...['30', Number.POSITIVE_INFINITY, []].map((multiple) => ({ multiple })),
            ...['36', -1].map((guarantorMultiple) => ({ guarantorMultiple })),
            ...['2', Number.NaN, 2.5].map((tenants) => ({ tenants })),
            ...['45000', Number.POSITIVE_INFINITY, {}].map((income) => ({ income })),
        ];
        const hostile = [...notObjects, ...rents, ...fields.map((field) => ({ rent: 1_500, ...field }))];
        for (const input of hostile) {
            const label = JSON.stringify(input) ?? String(input);
            expect(inputError(input as Input), label).toEqual(expect.any(String));
            expect(afford(input as Input), label).toBeNull();
            expect(summarise(input as Input), label).toEqual({ summary: null, error: expect.any(String) });
        }
    });

    it('takes null as left out, as a value that has been through JSON would be', () => {
        const input = { rent: 1_500, rentPeriod: null, multiple: null, tenants: null, income: null };
        expect(afford(input as never)).toEqual(afford({ rent: 1_500 }));
    });
});

describe('getTenantAffordabilitySummary', () => {
    it('shows only the amounts needed when no income is given', () => {
        const { summary, error } = summarise({ rent: 1_500 });
        expect(error).toBeNull();
        expect(summary?.rows).toEqual([
            { key: 'incomeNeeded', label: 'Annual income needed', value: 45_000, formatted: '£45,000' },
            { key: 'guarantorIncomeNeeded', label: 'Guarantor income needed', value: 54_000, formatted: '£54,000' },
            { key: 'monthlyRent', label: 'Rent per month', value: 1_500, formatted: '£1,500' },
        ]);
        expect(summary?.formatted).toMatchObject({ passes: null, shortfall: null, maxMonthlyRent: null });
        expect(summary?.formatted.multiple).toBe('30 times the monthly rent');
        expect(summary?.formatted.guarantorMultiple).toBe('36 times the monthly rent');
    });

    it('adds the check, the shortfall and the most rent when an income falls short', () => {
        const { summary } = summarise({ rent: 1_500, tenants: 2, income: 42_000 });
        expect(summary?.rows.map((row) => [row.key, row.formatted])).toEqual([
            ['incomeNeeded', '£45,000'],
            ['passes', 'Does not pass'],
            ['shortfall', '£3,000'],
            ['incomeNeededPerTenant', '£22,500'],
            ['guarantorIncomeNeeded', '£54,000'],
            ['monthlyRent', '£1,500'],
            ['maxMonthlyRent', '£1,400'],
            ['maxWeeklyRent', '£323.07'],
        ]);
        expect(summary?.rows[1]?.value).toBe(false);
        for (const row of summary!.rows) expect(row.label).toBe(TENANT_AFFORDABILITY_LABELS[row.key]);
    });

    it('says it passes and leaves out the shortfall row, though the figure is still £0', () => {
        const { summary } = summarise({ rent: 650, rentPeriod: 'week', income: 90_000 });
        const keys = 'incomeNeeded passes guarantorIncomeNeeded monthlyRent maxMonthlyRent maxWeeklyRent';
        expect(summary?.rows.map((row) => row.key)).toEqual(keys.split(' '));
        expect(summary?.formatted).toMatchObject({
            incomeNeeded: '£84,500',
            passes: 'Passes',
            shortfall: '£0',
            monthlyRent: '£2,816.67',
            maxMonthlyRent: '£3,000',
            // 3,000 × 12 / 52 = 692.307… → 692.30.
            maxWeeklyRent: '£692.30',
        });
        expect(summary?.shortfall).toBe(0);
        // A multiple of your own is written without trailing zeros: 1,000 × 32.5 = 32,500.
        const custom = summarise({ rent: 1_000, multiple: 32.5 }).summary?.formatted;
        expect(custom).toMatchObject({ multiple: '32.5 times the monthly rent', incomeNeeded: '£32,500' });
    });
});
