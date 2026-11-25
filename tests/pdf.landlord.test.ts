import { describe, expect, it } from 'vitest';

import { LANDLORD_INCOME_NOTICE } from '../src/landlord-income/index';
import { DEFAULT_NOTICE } from '../src/pdf/layout';
import { landlordIncomePdf, landlordIncomeReport } from '../src/pdf/reports/landlord';
import { DATE, expectWellFormed, readText } from './pdf.helpers';

/** The PDF as text: strings appear as `(literal)`, with `£` written as the octal escape `\243`. */
const text = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);

describe('landlordIncomePdf', () => {
    // £12,000 of rent, £3,000 of expenses, £4,000 of interest and £1,000 of tax leave £4,000.
    const input = {
        rent: 1_000,
        managementFeePercent: 10,
        insurance: 360,
        maintenance: 1_200,
        mortgageInterest: 4_000,
        otherIncome: 30_000,
    };

    it('leads with the net income, then the inputs, then the other rows', () => {
        const report = landlordIncomeReport(input)!;
        expect(report.title).toBe('Landlord net income');
        expect(report.headline).toEqual({ label: 'Net income per year', value: '£4,000' });
        expect(report.facts.slice(0, 7)).toEqual([
            { label: 'Tax year', value: '2026 to 2027' },
            { label: 'Rent', value: '£1,000 per month' },
            { label: 'Management fee rate', value: '10% of rent, plus VAT at 20%' },
            { label: 'Landlord insurance', value: '£360' },
            { label: 'Repairs and maintenance', value: '£1,200' },
            { label: 'Other income', value: '£30,000' },
            { label: 'Net income per month', value: '£333.33' },
        ]);
        expect(report.facts).toContainEqual({ label: 'Income tax on the property', value: '£1,000' });
        expect(report.facts.at(-1)).toEqual({ label: 'Tax as a share of profit', value: '11.11%' });
        expect(report.notes).toEqual([LANDLORD_INCOME_NOTICE]);
    });

    it('describes empty weeks and a fee including VAT, and leaves out what was not given', () => {
        const report = landlordIncomeReport({
            rent: 300,
            rentPeriod: 'week',
            voidWeeks: 3,
            managementFeePercent: 12,
            feesIncludeVat: true,
        })!;
        expect(report.facts.slice(0, 5)).toEqual([
            { label: 'Tax year', value: '2026 to 2027' },
            { label: 'Rent', value: '£300 per week' },
            { label: 'Empty weeks per year', value: '3' },
            { label: 'Management fee rate', value: '12% of rent, including VAT' },
            { label: 'Net income per month', value: report.facts[4]!.value },
        ]);
        const labels = landlordIncomeReport({ rent: 1_000 })!.facts.map((fact) => fact.label);
        for (const label of ['Empty weeks per year', 'Management fee rate', 'Landlord insurance', 'Other income'])
            expect(labels).not.toContain(label);
    });

    it('prints the notes for the result ahead of the notice', () => {
        const report = landlordIncomeReport({
            rent: 1_000,
            mortgageInterest: 9_000,
            otherIncome: 5_000,
            taxYear: '2027-28',
        })!;
        expect(report.facts[0]).toEqual({ label: 'Tax year', value: '2027 to 2028' });
        expect(report.notes).toHaveLength(3);
        expect(report.notes![0]).toContain(
            'The tax credit is limited to the £4,430 of income above the personal allowance',
        );
        expect(report.notes![1]).toContain('announced at Budget 2026 and are not yet law');
        expect(report.notes![2]).toBe(LANDLORD_INCOME_NOTICE);
    });

    it('prints what the calculator shows, with its own small print in place of the default', async () => {
        const pdf = await landlordIncomePdf(input, { date: DATE, name: 'Acme' });
        expectWellFormed(pdf);
        const body = text(pdf);
        expect(body.endsWith('%%EOF\n')).toBe(true);
        expect(body).toContain('(Landlord net income)');
        expect(body).toContain('(Net income per year)');
        expect(body).toContain('(\\2434,000)');
        expect(body).toContain('(\\2431,000 per month)');
        expect(body).toContain('(\\243333.33)');
        expect(body).toContain('(11.11%)');
        expect(body).toContain('(18 November 2026)');
        expect(body).toContain('/Author (Acme)');
        const printed = readText(pdf).join(' ');
        expect(printed).toContain('A guide only, not tax advice.');
        expect(printed).not.toContain(DEFAULT_NOTICE.slice(0, 40));
        // A notice of your own is printed after the report's.
        const own = readText(await landlordIncomePdf(input, { date: DATE, notice: 'Ask your accountant.' })).join(' ');
        expect(own).toContain('Ask your accountant.');
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(landlordIncomeReport({ ...input, rent: 0 })).toBeNull();
        await expect(landlordIncomePdf({ ...input, rent: 0 })).rejects.toThrow(RangeError);
        await expect(landlordIncomePdf({ ...input, voidWeeks: 60 })).rejects.toThrow(
            'Empty weeks must be between 0 and 52.',
        );
    });
});
