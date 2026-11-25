import { describe, expect, it } from 'vitest';

import {
    RENT_CONVERTER_NOTICE,
    rentConverterPdf,
    rentConverterReport,
    tenantAffordabilityPdf,
    tenantAffordabilityReport,
} from '../src/pdf/reports/rentals';
import { TENANT_AFFORDABILITY_NOTICE } from '../src/tenant-affordability/index';
import { DATE, expectWellFormed, readText } from './pdf.helpers';

/** Everything printed, joined, so a phrase in a wrapped note is found wherever the lines break. */
const printed = (pdf: Uint8Array) => readText(pdf).join(' ');

describe('rentConverterPdf', () => {
    it('prints a weekly rent in every period, with the rent as entered', async () => {
        const pdf = await rentConverterPdf({ rent: 650, period: 'week', tenants: 2 }, { date: DATE, name: 'Acme' });
        expectWellFormed(pdf);
        const lines = readText(pdf);
        for (const line of [
            'Rent conversion',
            'Rent per month',
            '£2,816.67',
            '£650 per week',
            'Tenants',
            '£33,800.00',
            'Rent per day',
            '£92.60',
            'Per person per month',
            '£1,408.33',
            '18 November 2026',
        ]) {
            expect(lines, line).toContain(line);
        }
        expect(printed(pdf)).toContain('A year is taken as 52 weeks or 12 months');
        // Not a purchase, so the default notice about solicitors and lenders is left out.
        expect(printed(pdf)).not.toContain('not tax or financial advice');
    });

    it('leads with the converted rent and lists the input first', () => {
        const report = rentConverterReport({ rent: 1_200 })!;
        expect(report.title).toBe('Rent conversion');
        expect(report.headline).toEqual({ label: 'Rent per week', value: '£276.92' });
        expect(report.facts).toEqual([
            { label: 'Rent', value: '£1,200 per month' },
            { label: 'Rent per month', value: '£1,200.00' },
            { label: 'Rent per year', value: '£14,400.00' },
            { label: 'Rent per day', value: '£39.45' },
        ]);
        expect(report.notes).toEqual([RENT_CONVERTER_NOTICE]);
        expect(rentConverterReport({ rent: 1_234.5, period: 'year' })!.facts[0]).toEqual({
            label: 'Rent',
            value: '£1,234.50 per year',
        });
    });

    it('keeps a notice of your own', async () => {
        expect(readText(await rentConverterPdf({ rent: 1_200 }, { notice: 'Ours.' }))).toContain('Ours.');
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(rentConverterReport({ rent: 0 })).toBeNull();
        expect(rentConverterReport(null as never)).toBeNull();
        await expect(rentConverterPdf({ rent: 0 })).rejects.toThrow(RangeError);
        await expect(rentConverterPdf({ rent: 1_200, tenants: 99 })).rejects.toThrow('Enter the number of tenants');
    });
});

describe('tenantAffordabilityPdf', () => {
    it('prints the check with the rent, the tests applied, the income and the small print', async () => {
        const input = { rent: 1_500, tenants: 2, income: 42_000 };
        const pdf = await tenantAffordabilityPdf(input, { date: DATE });
        expectWellFormed(pdf);
        const lines = readText(pdf);
        for (const line of [
            'Tenant affordability check',
            'Annual income needed',
            '£45,000',
            '£1,500 per month',
            '30 times the monthly rent',
            '36 times the monthly rent',
            'Combined annual income',
            '£42,000',
            'Does not pass',
            'Income shortfall',
            '£3,000',
            '£22,500',
            '£54,000',
            '£323.07',
        ]) {
            expect(lines, line).toContain(line);
        }
        const all = printed(pdf);
        expect(all).toContain('not law');
        expect(all).toContain('Renters’ Rights Act 2025');
        expect(all).toContain('1 May 2026');
        expect(all).toContain('not financial or legal advice');
        expect(all).not.toContain('not tax or financial advice');
    });

    it('leads with the income needed and leaves out what needs an income when none is given', () => {
        const report = tenantAffordabilityReport({ rent: 650, rentPeriod: 'week' })!;
        expect(report.headline).toEqual({ label: 'Annual income needed', value: '£84,500' });
        expect(report.facts).toEqual([
            { label: 'Rent', value: '£650 per week' },
            { label: 'Income test', value: '30 times the monthly rent' },
            { label: 'Guarantor test', value: '36 times the monthly rent' },
            { label: 'Guarantor income needed', value: '£101,400' },
            { label: 'Rent per month', value: '£2,816.67' },
        ]);
        expect(report.notes).toEqual([TENANT_AFFORDABILITY_NOTICE]);
    });

    it('says in its small print that the multiples are convention and what the Renters’ Rights Act changed', () => {
        for (const phrase of [
            '30 times the monthly rent for tenants and 36 times for a guarantor',
            'not law',
            'In England, for tenancies starting on or after 1 May 2026',
            'more than one month’s rent in advance',
            'not financial or legal advice',
        ]) {
            expect(TENANT_AFFORDABILITY_NOTICE).toContain(phrase);
        }
    });

    it('says when the income passes', () => {
        const report = tenantAffordabilityReport({ rent: 1_500, income: 45_000 })!;
        expect(report.facts).toContainEqual({ label: 'Affordability check', value: 'Passes' });
        expect(report.facts.map((fact) => fact.label)).not.toContain('Income shortfall');
    });

    it('keeps a notice of your own', async () => {
        expect(readText(await tenantAffordabilityPdf({ rent: 1_500 }, { notice: 'Ours.' }))).toContain('Ours.');
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(tenantAffordabilityReport({ rent: 0 })).toBeNull();
        expect(tenantAffordabilityReport(undefined as never)).toBeNull();
        await expect(tenantAffordabilityPdf({ rent: 0 })).rejects.toThrow(RangeError);
        await expect(tenantAffordabilityPdf({ rent: 1_500, multiple: 0 })).rejects.toThrow(
            'Enter an income multiple from 1 to 100.',
        );
    });
});
