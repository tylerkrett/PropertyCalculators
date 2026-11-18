import { describe, expect, it } from 'vitest';

import {
    pricePerAreaPdf,
    pricePerAreaReport,
    TENANT_DEPOSIT_NOTICE,
    tenantDepositPdf,
    tenantDepositReport,
} from '../src/pdf/reports/lettings';

const DATE = new Date(2026, 10, 18);
/** The PDF as text: strings are printed as `(literals)`, with `£` written as the octal escape `\243`. */
const text = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);

describe('pricePerAreaPdf', () => {
    const sale = { amount: 1_000_000, area: 800, areaUnit: 'sqft' as const };

    it('prints a sale with its headline, inputs and remaining rows', async () => {
        const pdf = await pricePerAreaPdf(sale, { date: DATE, name: 'Acme' });
        const body = text(pdf);
        expect(body.startsWith('%PDF')).toBe(true);
        expect(body).toContain('(Price per area)');
        expect(body).toContain('(Price per sq ft)');
        expect(body).toContain('(\\2431,250 per sq ft)');
        expect(body).toContain('(For sale)');
        expect(body).toContain('(800 sq ft)');
        expect(body).toContain('(\\24313,455 per sq m)');
        expect(body).toContain('(\\2431,000,000)');
        expect(body).toContain('(74.32 sq m)');
        expect(body).toContain('(18 November 2026)');
        expect(body).toContain('/Author (Acme)');
    });

    it('leads with the headline row and lists the inputs before the rest', () => {
        const report = pricePerAreaReport(sale)!;
        expect(report.headline).toEqual({ label: 'Price per sq ft', value: '£1,250 per sq ft' });
        expect(report.facts.map((fact) => fact.label)).toEqual([
            'Listing',
            'Floor area',
            'Price per sq m',
            'Price',
            'Area in sq ft',
            'Area in sq m',
        ]);
    });

    it('adds the comparison when a comparable is given', async () => {
        const input = { ...sale, comparable: { perArea: 1_150, unit: 'sqft' as const } };
        expect(pricePerAreaReport(input)!.facts.slice(-3)).toEqual([
            { label: 'Comparable average', value: '£1,150 per sq ft' },
            { label: 'Difference', value: '+£100 per sq ft' },
            { label: 'Comparison', value: '8.7% above the comparable average' },
        ]);
        expect(text(await pricePerAreaPdf(input))).toContain('(8.7% above the comparable average)');
    });

    it('prints a letting per year, with the rent as entered', () => {
        const report = pricePerAreaReport({ amount: 3_000, area: 100, areaUnit: 'sqm', rentPeriod: 'month' })!;
        expect(report.title).toBe('Rent per area');
        expect(report.headline.value).toBe('£33.45 per sq ft per year');
        expect(report.facts).toContainEqual({ label: 'Listing', value: 'To let' });
        expect(report.facts).toContainEqual({ label: 'Rent', value: '£3,000 per month' });
        expect(report.facts).toContainEqual({ label: 'Floor area', value: '100 sq m' });
        expect(report.facts).toContainEqual({ label: 'Rent per year', value: '£36,000' });
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(pricePerAreaReport({ ...sale, area: 0 })).toBeNull();
        await expect(pricePerAreaPdf({ ...sale, area: 0 })).rejects.toThrow(RangeError);
        await expect(pricePerAreaPdf({ ...sale, area: 0 })).rejects.toThrow('Enter the floor area.');
    });
});

describe('tenantDepositPdf', () => {
    it('prints the caps with the rent, the check and the legal note', async () => {
        const pdf = await tenantDepositPdf({ rent: 1_200, proposedDeposit: 1_500 }, { date: DATE });
        const body = text(pdf);
        expect(body.startsWith('%PDF')).toBe(true);
        expect(body).toContain('(Tenant deposit caps)');
        expect(body).toContain('(Maximum tenancy deposit)');
        expect(body).toContain('(\\2431,384.61)');
        expect(body).toContain('(\\2431,200 per month)');
        expect(body).toContain('(Maximum holding deposit)');
        expect(body).toContain('(\\243276.92)');
        expect(body).toContain('(\\2431,500.00 is \\243115.39 over the \\2431,384.61 cap)');
        // The notes are wrapped over lines, so look for phrases short enough to stay on one.
        expect(body).toContain('Tenant Fees Act 2019');
        expect(body).toContain('England');
        expect(body).toContain('not legal advice');
        expect(body).not.toContain('not tax or financial advice');
    });

    it('keeps a notice of your own', async () => {
        expect(text(await tenantDepositPdf({ rent: 1_200 }, { notice: 'Ours.' }))).toContain('(Ours.)');
    });

    it('leads with the tenancy deposit and notes the law it comes from', () => {
        const report = tenantDepositReport({ rent: 300, rentPeriod: 'week' })!;
        expect(report.headline).toEqual({ label: 'Maximum tenancy deposit', value: '£1,500.00' });
        expect(report.facts[0]).toEqual({ label: 'Rent', value: '£300 per week' });
        expect(report.facts.map((fact) => fact.label)).not.toContain('Proposed deposit');
        expect(report.facts).toContainEqual({ label: 'Maximum holding deposit', value: '£300.00' });
        expect(report.notes).toContain(TENANT_DEPOSIT_NOTICE);
        expect(TENANT_DEPOSIT_NOTICE).toContain('Tenant Fees Act 2019, which applies in England');
        expect(TENANT_DEPOSIT_NOTICE).toContain('not legal advice');
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(tenantDepositReport({ rent: 0 })).toBeNull();
        await expect(tenantDepositPdf({ rent: 0 })).rejects.toThrow(RangeError);
        await expect(tenantDepositPdf({ rent: 9_000 })).rejects.toThrow('does not cover rents above');
    });
});
