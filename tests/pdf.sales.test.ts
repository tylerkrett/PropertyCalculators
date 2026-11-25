import { describe, expect, it } from 'vitest';

import { CAPITAL_GAINS_NOTICE } from '../src/capital-gains/index';
import {
    capitalGainsPdf,
    capitalGainsReport,
    SELLING_COSTS_NOTICE,
    sellingCostsPdf,
    sellingCostsReport,
} from '../src/pdf/reports/sales';
import { expectWellFormed, readText } from './pdf.helpers';

const DATE = new Date(2026, 10, 25);
/** The PDF as text: strings are printed as `(literals)`, with `£` written as the octal escape `\243`. */
const text = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);

describe('sellingCostsPdf', () => {
    const sale = {
        price: 350_000,
        mortgage: 180_000,
        earlyRepaymentCharge: 1_800,
        agentFeePercent: 1.25,
        legalFees: 1_500,
        epc: 85,
        removals: 900,
    };

    it('prints the money left, the headline figures and where the price goes', async () => {
        const pdf = await sellingCostsPdf(sale, { date: DATE, name: 'Acme' });
        expectWellFormed(pdf);
        const body = text(pdf);
        expect(body).toContain('(Cost of selling estimate)');
        expect(body).toContain('(Money left after the sale)');
        expect(body).toContain('(\\243160,465)');
        expect(body).toContain('(\\243350,000)');
        expect(body).toContain('(Selling costs)');
        expect(body).toContain('(\\2437,735)');
        expect(body).toContain('(Where the sale price goes)');
        expect(body).toContain('(Estate agent fee)');
        expect(body).toContain('(1.25%)');
        expect(body).toContain('(Mortgage balance)');
        expect(body).toContain('(25 November 2026)');
        expect(body).toContain('/Author (Acme)');
        expect(body).toContain('figures for your sale');
        expect(body).not.toContain('for your purchase');
    });

    it('leads with the money left and lists only the lines with an amount', () => {
        const report = sellingCostsReport(sale)!;
        expect(report.headline).toEqual({ label: 'Money left after the sale', value: '£160,465' });
        expect(report.facts.map((fact) => fact.label)).toEqual([
            'Sale price',
            'Selling costs',
            'Mortgage repaid',
            'Estate agent fee',
            'VAT on the agent fee',
        ]);
        expect(report.tables![0]!.rows).toEqual([
            ['Estate agent fee', '£4,375', '1.25%'],
            ['VAT on the agent fee', '£875', '0.25%'],
            ['Legal fees', '£1,500', '0.43%'],
            ['Energy performance certificate', '£85', '0.02%'],
            ['Removals', '£900', '0.26%'],
            ['Mortgage balance', '£180,000', '51.43%'],
            ['Early repayment charge', '£1,800', '0.51%'],
        ]);
        expect(report.notes).toHaveLength(1);
    });

    it('says when the sale leaves a shortfall', () => {
        const report = sellingCostsReport({ price: 200_000, mortgage: 212_400.5 })!;
        expect(report.headline.value).toBe('-£12,400.50');
        expect(report.notes![0]).toBe(
            'The sale does not cover the costs and the mortgage: £12,400.50 would have to be found from elsewhere.',
        );
    });

    it('keeps a notice of your own', async () => {
        expect(readText(await sellingCostsPdf(sale, { notice: 'Ours.' }))).toContain('Ours.');
        expect(SELLING_COSTS_NOTICE).toContain('not tax or financial advice');
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(sellingCostsReport({ price: 0 })).toBeNull();
        await expect(sellingCostsPdf({ price: 0 })).rejects.toThrow(RangeError);
        await expect(sellingCostsPdf({ price: 350_000, agentFeePercent: 1, agentFeeFixed: 1 })).rejects.toThrow(
            'not both',
        );
    });
});

describe('capitalGainsPdf', () => {
    const landlord = {
        salePrice: 300_000,
        purchasePrice: 180_000,
        buyingCosts: 4_000,
        sellingCosts: 6_000,
        improvements: 10_000,
        income: 40_000,
        completionDate: '2026-11-25',
    };

    it('prints the tax, the inputs, the working and the deadline', async () => {
        const pdf = await capitalGainsPdf(landlord, { date: DATE });
        expectWellFormed(pdf);
        const body = text(pdf);
        expect(body).toContain('(Capital gains tax estimate)');
        expect(body).toContain('(Capital gains tax to pay)');
        expect(body).toContain('(\\24322,663.80)');
        expect(body).toContain('(2026 to 2027)');
        expect(body).toContain('(\\243300,000)');
        expect(body).toContain('(\\243180,000)');
        expect(body).toContain('(\\24320,000)');
        expect(body).toContain('(18% and 24%)');
        expect(body).toContain('(Report and pay by)');
        expect(body).toContain('(24 January 2027)');
        expect(body).toContain('(\\24397,000)');
        expect(body).toContain('(22.66%)');
    });

    it('carries the guide-only notice in place of the default one', async () => {
        const printed = readText(await capitalGainsPdf(landlord)).join(' ');
        expect(printed).toContain('This is a guide only, not tax advice.');
        expect(printed).toContain('Private residence relief and lettings relief are not modelled.');
        expect(printed).not.toContain('not tax or financial advice');
        expect(capitalGainsReport(landlord)!.notes!.at(-1)).toBe(CAPITAL_GAINS_NOTICE);
        expect(readText(await capitalGainsPdf(landlord, { notice: 'Ours.' }))).toContain('Ours.');
    });

    it('leads with the tax and lists the inputs before the rest', () => {
        const report = capitalGainsReport({ ...landlord, share: 50, completionDate: undefined })!;
        expect(report.headline).toEqual({ label: 'Capital gains tax to pay', value: '£10,663.80' });
        expect(report.facts.slice(0, 7)).toEqual([
            { label: 'Tax year', value: '2026 to 2027' },
            { label: 'Sale price', value: '£300,000' },
            { label: 'Purchase price', value: '£180,000' },
            { label: 'Buying, selling and improvement costs', value: '£20,000' },
            { label: 'Share owned', value: '50%' },
            { label: 'Income', value: '£40,000' },
            { label: 'Lower and higher rate', value: '18% and 24%' },
        ]);
        expect(report.facts[7]).toEqual({ label: 'Gain', value: '£50,000' });
        expect(report.facts.map((fact) => fact.label)).not.toContain('Report and pay by');
    });

    it('prints a loss with no tax', () => {
        const report = capitalGainsReport({ salePrice: 200_000, purchasePrice: 220_000 })!;
        expect(report.headline.value).toBe('£0');
        expect(report.facts).toContainEqual({ label: 'Gain', value: '-£20,000' });
        expect(report.notes![0]).toMatch(/carried forward/);
    });

    it('refuses an input that cannot be calculated, with the form error', async () => {
        expect(capitalGainsReport({ salePrice: 0, purchasePrice: 0 })).toBeNull();
        await expect(capitalGainsPdf({ salePrice: 0, purchasePrice: 0 })).rejects.toThrow(RangeError);
        await expect(capitalGainsPdf({ ...landlord, completionDate: '2026-02-30' })).rejects.toThrow(
            'Enter the completion date as YYYY-MM-DD.',
        );
    });
});
