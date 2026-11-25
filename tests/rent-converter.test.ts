import { describe, expect, it } from 'vitest';

import {
    convertRent,
    getRentConversionSummary,
    RENT_CONVERTER_DEFAULTS,
    RENT_CONVERTER_LABELS,
    RENT_CONVERTER_LIMITS,
    type RentConverterInput,
    rentConverterInputError,
} from '../src/rent-converter/index';

describe('convertRent', () => {
    it('hand-worked: £650 a week between two tenants', () => {
        // Year: 650 × 52 = 33,800. Month: 33,800 / 12 = 2,816.666… → 2,816.67.
        // Day: 33,800 / 365 = 92.6027… → 92.60.
        // Each: 650 / 2 = 325; 2,816.666… / 2 = 1,408.333… → 1,408.33; 33,800 / 2 = 16,900.
        expect(convertRent({ rent: 650, period: 'week', tenants: 2 })).toEqual({
            weekly: 650,
            monthly: 2_816.67,
            annual: 33_800,
            daily: 92.6,
            tenants: 2,
            perPerson: { weekly: 325, monthly: 1_408.33, annual: 16_900 },
        });
    });

    it('hand-worked: £1,200 a month, with a monthly rent and one tenant as the defaults', () => {
        // Year: 1,200 × 12 = 14,400. Week: 14,400 / 52 = 276.923… → 276.92. Day: 14,400 / 365 = 39.452… → 39.45.
        expect(RENT_CONVERTER_DEFAULTS).toEqual({ period: 'month', tenants: 1 });
        expect(convertRent({ rent: 1_200 })).toEqual({
            weekly: 276.92,
            monthly: 1_200,
            annual: 14_400,
            daily: 39.45,
            tenants: 1,
            perPerson: { weekly: 276.92, monthly: 1_200, annual: 14_400 },
        });
    });

    it('gives the same answer whichever period the same rent is entered in', () => {
        // 300 × 52 = 15,600 = 1,300 × 12.
        const fromYear = convertRent({ rent: 15_600, period: 'year' });
        expect(convertRent({ rent: 1_300, period: 'month' })).toEqual(fromYear);
        expect(convertRent({ rent: 300, period: 'week' })).toEqual(fromYear);
        expect(fromYear).toMatchObject({ weekly: 300, monthly: 1_300, annual: 15_600, daily: 42.74 });
    });

    it('round-trips between week and month to within the pennies rounding can move', () => {
        for (const rent of [1, 99.99, 450, 1_234.56, 2_816.67, 9_999.99, 125_000]) {
            const weekly = convertRent({ rent, period: 'month' })!.weekly;
            // A weekly figure up to half a penny out is 52/12 times that out as a month: under 3p.
            expect(Math.abs(convertRent({ rent: weekly, period: 'week' })!.monthly - rent)).toBeLessThan(0.03);
            const monthly = convertRent({ rent, period: 'week' })!.monthly;
            expect(Math.abs(convertRent({ rent: monthly, period: 'month' })!.weekly - rent)).toBeLessThan(0.01);
        }
    });

    it('rounds each figure once, from the unrounded annual rent', () => {
        // £1,000 a month between three: 333.333… → 333.33; week 12,000 / 52 / 3 = 76.923… → 76.92.
        expect(convertRent({ rent: 1_000, tenants: 3 })?.perPerson).toEqual({
            weekly: 76.92,
            monthly: 333.33,
            annual: 4_000,
        });
        // £2,000 a month between three: 666.666… rounds up to 666.67.
        expect(convertRent({ rent: 2_000, tenants: 3 })?.perPerson.monthly).toBe(666.67);
        // 6p a year is half a penny a month, which rounds up; a week of it is nothing.
        expect(convertRent({ rent: 0.06, period: 'year' })).toMatchObject({ monthly: 0.01, weekly: 0, annual: 0.06 });
        // £100.10 a week: 100.1 × 52 is 5,205.2 exactly, not 5,205.199999….
        expect(convertRent({ rent: 100.1, period: 'week' })).toMatchObject({ weekly: 100.1, annual: 5_205.2 });
        // £365 a year is £1 a day; a leap year is not allowed for.
        expect(convertRent({ rent: 365, period: 'year' })?.daily).toBe(1);
    });

    it('accepts the limits and refuses anything past them', () => {
        const { rent, tenants } = RENT_CONVERTER_LIMITS;
        expect(convertRent({ rent: rent.max, period: 'year', tenants: tenants.max })?.perPerson.annual).toBe(
            rent.max / tenants.max,
        );
        expect(convertRent({ rent: rent.max + 1 })).toBeNull();
        expect(convertRent({ rent: 1_000, tenants: tenants.max + 1 })).toBeNull();
        expect(convertRent({ rent: 1_000, tenants: tenants.min - 1 })).toBeNull();
    });
});

describe('rentConverterInputError', () => {
    it('words each problem for the form', () => {
        expect(rentConverterInputError({ rent: 1_200 })).toBeNull();
        expect(rentConverterInputError({ rent: 0 })).toBe('Enter the rent.');
        expect(rentConverterInputError({ rent: -5 })).toBe('Enter the rent.');
        expect(rentConverterInputError({ rent: 2e9 })).toBe('Enter a lower rent.');
        expect(rentConverterInputError({ rent: 1_200, period: 'day' as never })).toBe(
            'Choose whether the rent is per week, month or year.',
        );
        for (const tenants of [0, -1, 1.5, 21, Number.NaN, Number.POSITIVE_INFINITY, '2', {}, true]) {
            expect(rentConverterInputError({ rent: 1_200, tenants: tenants as never }), String(tenants)).toBe(
                'Enter the number of tenants, from 1 to 20.',
            );
        }
    });

    it('never throws on hostile input: it is an error, and null from the maths', () => {
        const hostile: unknown[] = [
            undefined,
            null,
            42,
            'rent',
            [],
            () => 1,
            {},
            { rent: Number.NaN },
            { rent: Number.POSITIVE_INFINITY },
            { rent: '1200' },
            { rent: null },
            { rent: [1_200] },
            { rent: 1_200, period: 7 },
            { rent: 1_200, period: 'toString' },
            { rent: 1_200, period: {} },
        ];
        for (const input of hostile) {
            const label = JSON.stringify(input) ?? String(input);
            expect(rentConverterInputError(input as RentConverterInput), label).toEqual(expect.any(String));
            expect(convertRent(input as RentConverterInput), label).toBeNull();
            expect(getRentConversionSummary(input as RentConverterInput), label).toEqual({
                summary: null,
                error: expect.any(String),
            });
        }
    });

    it('takes a null period or tenants as left out', () => {
        expect(convertRent({ rent: 1_200, period: null as never, tenants: null as never })).toEqual(
            convertRent({ rent: 1_200 }),
        );
    });
});

describe('getRentConversionSummary', () => {
    it('leads with the monthly rent for a weekly one, and formats every figure with pence', () => {
        const { summary, error } = getRentConversionSummary({ rent: 650, period: 'week', tenants: 2 });
        expect(error).toBeNull();
        expect(summary).toMatchObject({ period: 'week', tenants: 2, monthly: 2_816.67 });
        expect(summary?.formatted).toEqual({
            weekly: '£650.00',
            monthly: '£2,816.67',
            annual: '£33,800.00',
            daily: '£92.60',
            perPersonWeekly: '£325.00',
            perPersonMonthly: '£1,408.33',
            perPersonAnnual: '£16,900.00',
        });
        expect(summary?.rows.map((row) => row.key)).toEqual([
            'monthly',
            'weekly',
            'annual',
            'daily',
            'perPersonWeekly',
            'perPersonMonthly',
            'perPersonAnnual',
        ]);
        expect(summary?.rows[0]).toEqual({
            key: 'monthly',
            label: 'Rent per month',
            value: 2_816.67,
            formatted: '£2,816.67',
        });
        for (const row of summary!.rows) expect(row.label).toBe(RENT_CONVERTER_LABELS[row.key]);
    });

    it('leads with the weekly rent otherwise, and leaves out the per-person rows for one tenant', () => {
        for (const period of ['month', 'year'] as const) {
            const { summary } = getRentConversionSummary({ rent: 1_200, period });
            expect(summary?.rows.map((row) => row.key)).toEqual(['weekly', 'monthly', 'annual', 'daily']);
        }
        const { summary } = getRentConversionSummary({ rent: 1_200 });
        expect(summary?.rows[0]?.formatted).toBe('£276.92');
        // The figures are still there for a caller who wants them.
        expect(summary?.formatted.perPersonMonthly).toBe('£1,200.00');
    });

    it('returns the form error and no summary for invalid input', () => {
        expect(getRentConversionSummary({ rent: Number.NaN })).toEqual({ summary: null, error: 'Enter the rent.' });
    });
});
