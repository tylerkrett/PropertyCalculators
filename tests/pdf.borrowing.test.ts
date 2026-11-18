import { describe, expect, it } from 'vitest';

import { affordabilityPdf, affordabilityReport, buyToLetPdf, buyToLetReport } from '../src/pdf/reports/borrowing';

const DATE = new Date(2026, 10, 18);
/** The PDF as text: strings appear as `(literal)`, with `£` written as the octal escape `\243`. */
const text = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);

describe('affordabilityPdf', () => {
    const input = {
        income: 45_000,
        secondIncome: 30_000,
        monthlyCommitments: 400,
        deposit: 50_000,
        rate: 4.5,
        termYears: 30,
    };

    it('leads with the maximum price, then the inputs, then the other rows', () => {
        const report = affordabilityReport(input)!;
        expect(report.title).toBe('Borrowing estimate');
        expect(report.headline).toEqual({ label: 'Maximum property price', value: '£365,900' });
        expect(report.facts.slice(0, 8)).toEqual([
            { label: 'Yearly income', value: '£45,000' },
            { label: "Second applicant's income", value: '£30,000' },
            { label: 'Monthly commitments', value: '£400' },
            { label: 'Income multiple', value: '4.5 times' },
            { label: 'Interest rate', value: '4.5%' },
            { label: 'Term', value: '30 years' },
            { label: 'Buyer', value: 'Home mover' },
            { label: 'Maximum loan', value: '£315,900' },
        ]);
        expect(report.facts.at(-1)?.label).toBe('Cash needed upfront');
        expect(report.notes).toHaveLength(1);
        expect(report.notes![0]).toContain('lenders set their own criteria');
    });

    it('leaves out the optional inputs that were not given', () => {
        const labels = affordabilityReport({ income: 60_000, deposit: 0, rate: 5, termYears: 25 })!.facts.map(
            (fact) => fact.label,
        );
        expect(labels).not.toContain("Second applicant's income");
        expect(labels).not.toContain('Monthly commitments');
    });

    it('prints what the calculator shows', async () => {
        const pdf = await affordabilityPdf(input, { date: DATE, name: 'Acme' });
        const body = text(pdf);
        expect(body.startsWith('%PDF')).toBe(true);
        expect(body.endsWith('%%EOF\n')).toBe(true);
        expect(body).toContain('(Borrowing estimate)');
        expect(body).toContain('(Maximum property price)');
        expect(body).toContain('(\\243365,900)');
        expect(body).toContain('(\\24345,000)');
        expect(body).toContain('(\\243315,900)');
        expect(body).toContain('(\\2431,600.62)');
        expect(body).toContain('(4.5 times)');
        expect(body).toContain('(30 years)');
        expect(body).toContain('(18 November 2026)');
        expect(body).toContain('/Author (Acme)');
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(affordabilityReport({ ...input, income: 0 })).toBeNull();
        await expect(affordabilityPdf({ ...input, income: 0 })).rejects.toThrow(RangeError);
        await expect(affordabilityPdf({ ...input, rate: 40 })).rejects.toThrow(
            'Enter an interest rate between 0% and 25%.',
        );
    });
});

describe('buyToLetPdf', () => {
    const input = { rent: 1_200, price: 250_000, deposit: 62_500, borrower: 'higher-rate' as const };

    it('leads with the cover ratio, then the verdict and the inputs, then the other rows', () => {
        const report = buyToLetReport(input)!;
        expect(report.title).toBe('Buy-to-let mortgage check');
        expect(report.headline).toEqual({ label: 'Interest cover ratio', value: '139.63%' });
        expect(report.facts.slice(0, 6)).toEqual([
            { label: 'Result', value: 'Falls short' },
            { label: 'Rent', value: '£1,200 per month' },
            { label: 'Property price', value: '£250,000' },
            { label: 'Deposit', value: '£62,500' },
            { label: 'Borrower', value: 'Higher or additional-rate taxpayer' },
            { label: 'Cover required', value: '145%' },
        ]);
        expect(report.facts).toContainEqual({ label: 'Rent shortfall per month', value: '£46.10' });
        expect(report.notes).toHaveLength(1);
        expect(report.notes![0]).toContain('the cover required and the stress rate are lender conventions');
    });

    it('describes a loan given outright without a deposit or, with its own cover, a borrower', () => {
        const report = buyToLetReport({ rent: 300, rentPeriod: 'week', loan: 150_000, coverRatio: 140 })!;
        expect(report.facts.slice(0, 3)).toEqual([
            { label: 'Result', value: 'Passes' },
            { label: 'Rent', value: '£300 per week' },
            { label: 'Cover required', value: '140%' },
        ]);
    });

    it('prints what the calculator shows', async () => {
        const body = text(await buyToLetPdf(input, { date: DATE }));
        expect(body.startsWith('%PDF')).toBe(true);
        expect(body).toContain('(Buy-to-let mortgage check)');
        expect(body).toContain('(Interest cover ratio)');
        expect(body).toContain('(139.63%)');
        expect(body).toContain('(Falls short)');
        expect(body).toContain('(\\2431,200 per month)');
        expect(body).toContain('(\\243187,500)');
        expect(body).toContain('(Higher or additional-rate taxpayer)');
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(buyToLetReport({ ...input, rent: 0 })).toBeNull();
        await expect(buyToLetPdf({ ...input, rent: 0 })).rejects.toThrow(RangeError);
        await expect(buyToLetPdf({ ...input, rent: 0 })).rejects.toThrow('Enter the rent.');
    });
});
