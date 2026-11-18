import { describe, expect, it } from 'vitest';

import {
    buyingCostsPdf,
    buyingCostsReport,
    overpaymentPdf,
    overpaymentReport,
    remortgagePdf,
    remortgageReport,
} from '../src/pdf/reports/mortgage-extras';

const DATE = new Date(2026, 10, 18);
/** The PDF as text, with the pound sign written back from its octal escape. */
const text = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf).replaceAll('\\243', '£');
/** Printed strings appear in the file as `(literal)`. */
const expectPrinted = (body: string, strings: string[]) => {
    for (const value of strings) expect(body, value).toContain(`(${value})`);
};

describe('overpaymentPdf', () => {
    const input = { balance: 200_000, rate: 5, termYears: 25, monthlyOverpayment: 200, lumpSum: 10_000 };

    it('leads with the interest saved, then the inputs and the other rows', () => {
        const report = overpaymentReport(input)!;
        expect(report.title).toBe('Mortgage overpayment estimate');
        expect(report.headline).toEqual({ label: 'Interest saved', value: '£56,501' });
        expect(report.facts.slice(0, 5)).toEqual([
            { label: 'Mortgage balance', value: '£200,000' },
            { label: 'Interest rate', value: '5%' },
            { label: 'Time left', value: '25 years' },
            { label: 'Monthly overpayment', value: '£200' },
            { label: 'Lump sum paid today', value: '£10,000' },
        ]);
        expect(report.facts).toContainEqual({ label: 'Time saved', value: '7 years 8 months' });
        expect(report.facts.map((fact) => fact.label)).not.toContain('Interest saved');
        expect(report.notes).toHaveLength(1);
    });

    it('prints the report', async () => {
        const pdf = await overpaymentPdf(input, { date: DATE, name: 'Acme' });
        const body = text(pdf);
        expect(body.startsWith('%PDF')).toBe(true);
        expect(body).toContain('/Author (Acme)');
        expectPrinted(body, ['Mortgage overpayment estimate', 'Interest saved', '£56,501', '7 years 8 months']);
        expectPrinted(body, ['£200,000', '25 years', '£1,169.18', '18 November 2026']);
        expect(body).toContain('no charge for overpaying');
    });

    it('counts a term given in months, and refuses what cannot be calculated', async () => {
        const months = overpaymentReport({ balance: 200_000, rate: 5, termYears: 18, termMonths: 4 })!;
        expect(months.facts).toContainEqual({ label: 'Time left', value: '18 years 4 months' });
        expect(months.facts).toContainEqual({ label: 'Monthly overpayment', value: '£0' });
        expect(overpaymentReport({ ...input, balance: 0 })).toBeNull();
        await expect(overpaymentPdf({ ...input, balance: 0 })).rejects.toThrow(RangeError);
        await expect(overpaymentPdf({ ...input, rate: 40 })).rejects.toThrow('Enter an interest rate between');
    });
});

describe('remortgagePdf', () => {
    const input = {
        balance: 200_000,
        currentRate: 5.5,
        newRate: 4.5,
        termYears: 25,
        productFee: 999,
        earlyRepaymentCharge: 1_000,
    };

    it('leads with the monthly saving, then the inputs and the other rows', () => {
        const report = remortgageReport(input)!;
        expect(report.title).toBe('Remortgage comparison');
        expect(report.headline).toEqual({ label: 'Monthly saving', value: '£116.51' });
        for (const fact of [
            { label: 'Current rate', value: '5.5%' },
            { label: 'New rate', value: '4.5%' },
            { label: 'Product fee', value: '£999' },
            { label: 'Product fee is', value: 'Paid upfront' },
            { label: 'Early repayment charge', value: '£1,000' },
            { label: 'Fixed period', value: '2 years' },
            { label: 'Cost of switching', value: '£1,999' },
            { label: 'Time to break even', value: '1 year 1 month' },
        ])
            expect(report.facts).toContainEqual(fact);
        expect(report.notes).toHaveLength(1);
        const borrowed = remortgageReport({ ...input, feePayment: 'add-to-loan', fixedYears: 5 })!;
        expect(borrowed.facts).toContainEqual({ label: 'Product fee is', value: 'Added to the loan' });
        expect(borrowed.facts).toContainEqual({ label: 'Fixed period', value: '5 years' });
        expect(borrowed.facts).toContainEqual({ label: 'New loan amount', value: '£200,999' });
    });

    it('prints the report', async () => {
        const body = text(await remortgagePdf(input, { date: DATE }));
        expect(body.startsWith('%PDF')).toBe(true);
        expectPrinted(body, ['Remortgage comparison', 'Monthly saving', '£116.51', '1 year 1 month']);
        expectPrinted(body, ['5.5%', '4.5%', '£1,999', 'Paid upfront']);
        expect(body).toContain('same remaining term');
    });

    it('refuses what cannot be calculated', async () => {
        expect(remortgageReport({ ...input, newRate: Number.NaN })).toBeNull();
        await expect(remortgagePdf({ ...input, newRate: Number.NaN })).rejects.toThrow(RangeError);
        await expect(remortgagePdf({ ...input, fixedYears: 20 })).rejects.toThrow('Enter a fixed period');
    });
});

describe('buyingCostsPdf', () => {
    const input = { price: 300_000, deposit: 30_000, legalFees: 1_500, survey: 500, removals: 800 };

    it('leads with the cash needed, then the inputs and the other rows', () => {
        const report = buyingCostsReport(input)!;
        expect(report.title).toBe('Cost of buying estimate');
        expect(report.headline).toEqual({ label: 'Cash needed upfront', value: '£37,800' });
        expect(report.facts.slice(0, 2)).toEqual([
            { label: 'Property price', value: '£300,000' },
            { label: 'Buyer', value: 'Home mover' },
        ]);
        expect(report.facts).toContainEqual({ label: 'Stamp duty', value: '£5,000' });
        expect(report.facts).toContainEqual({ label: 'Loan amount', value: '£270,000' });
        expect(report.notes).toHaveLength(1);
    });

    it('lists the items worth something as a table', () => {
        const [table] = buyingCostsReport(input)!.tables!;
        expect(table!.columns).toEqual(['Item', 'Amount', 'Share of cash upfront']);
        expect(table!.rows).toEqual([
            ['Deposit', '£30,000', '79.37%'],
            ['Stamp duty', '£5,000', '13.23%'],
            ['Legal fees', '£1,500', '3.97%'],
            ['Survey', '£500', '1.32%'],
            ['Removals', '£800', '2.12%'],
        ]);
        const extras = buyingCostsReport({ ...input, extras: [{ label: 'Furniture', amount: 2_000 }] })!;
        expect(extras.tables![0]!.rows.at(-1)![0]).toBe('Furniture');
    });

    it('prints the report', async () => {
        const body = text(await buyingCostsPdf(input, { date: DATE, subtitle: '14 Elgin Avenue' }));
        expect(body.startsWith('%PDF')).toBe(true);
        expectPrinted(body, ['Cost of buying estimate', '14 Elgin Avenue', 'Cash needed upfront', '£37,800']);
        expectPrinted(body, ['£300,000', 'Home mover', 'Legal fees', '£1,500', '79.37%', 'Share of cash upfront']);
        expect(body).not.toContain('(Valuation fee)');
    });

    it('refuses what cannot be calculated', async () => {
        expect(buyingCostsReport({ ...input, deposit: 400_000 })).toBeNull();
        await expect(buyingCostsPdf({ ...input, deposit: 400_000 })).rejects.toThrow(RangeError);
        await expect(buyingCostsPdf({ ...input, price: 0 })).rejects.toThrow('Enter the property price.');
    });
});
