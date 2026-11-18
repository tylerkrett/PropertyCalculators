import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BUYING_COST_FEES } from '../src/buying-costs/index';
import { BuyingCostsCalculator } from '../src/react/BuyingCostsCalculator';
import { OverpaymentCalculator } from '../src/react/OverpaymentCalculator';
import { RemortgageCalculator } from '../src/react/RemortgageCalculator';

const html = renderToStaticMarkup;
const row = (label: string, value: string) => `<dt>${label}</dt><dd>${value}</dd>`;

/** Every input and select has an id that a label points at, and the count is the one expected. */
function expectLabelled(element: ReactElement, controls: number) {
    const markup = html(element);
    const ids = [...markup.matchAll(/<(?:input|select)\b[^>]*>/g)].map((match) => / id="([^"]+)"/.exec(match[0])?.[1]);
    expect(ids).toHaveLength(controls);
    expect(new Set(ids).size).toBe(controls);
    for (const id of ids) expect(markup, String(id)).toContain(`<label class="pc-label" for="${id}">`);
}

/** The behaviour every calculator shares: the PDF button, the stylesheet and the root element. */
function expectShared(name: string, finished: (props: object) => ReactElement, empty: ReactElement) {
    expect(html(finished({}))).not.toContain('class="pc-download"');
    expect(html(finished({ pdf: true }))).toContain('Download PDF</button>');
    expect(html(finished({ pdf: { label: 'Save as PDF' } }))).toContain('Save as PDF</button>');
    // No result, no download.
    expect(html(empty)).not.toContain('<button');

    expect(html(finished({}))).toContain('--pc-accent');
    expect(html(finished({}))).toContain(`class="pc pc-styled ${name}"`);
    const bare = html(finished({ unstyled: true, id: 'x', theme: 'dark', className: 'card' }));
    expect(bare).not.toContain('<style');
    expect(bare).toContain(`<div id="x" data-theme="dark" class="pc ${name} card">`);
}

describe('OverpaymentCalculator', () => {
    const finished = (props: object = {}) => (
        <OverpaymentCalculator
            defaultBalance={200_000}
            defaultRate={5}
            defaultTermYears={25}
            defaultMonthlyOverpayment={200}
            defaultLumpSum={10_000}
            {...props}
        />
    );

    it('renders the saving from its defaults, interest saved first', () => {
        const markup = html(finished());
        expect(markup).toContain('value="200,000"');
        expect(markup).toContain(row('Interest saved', '£56,501'));
        expect(markup).toContain(row('Time saved', '7 years 8 months'));
        expect(markup).toContain(row('Paid off in', '17 years 4 months'));
        expect(markup).toContain(row('Standard monthly payment', '£1,169.18'));
        expect(markup).toContain('data-key="interestSaved" data-lead="true"');
    });

    it('shows the form error instead of results', () => {
        const markup = html(<OverpaymentCalculator />);
        expect(markup).toContain('<p class="pc-hint" role="status">Enter the mortgage balance.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(html(finished({ defaultRate: 40 }))).toContain('Enter an interest rate between 0% and 25%.');
    });

    it('labels every control', () => expectLabelled(finished(), 5));

    it('offers a PDF only when asked, and can go unstyled', () =>
        expectShared('pc-overpayment', finished, <OverpaymentCalculator pdf />));
});

describe('RemortgageCalculator', () => {
    const finished = (props: object = {}) => (
        <RemortgageCalculator
            defaultBalance={200_000}
            defaultCurrentRate={5.5}
            defaultNewRate={4.5}
            defaultTermYears={25}
            defaultProductFee={999}
            defaultEarlyRepaymentCharge={1_000}
            {...props}
        />
    );

    it('renders the comparison from its defaults', () => {
        const markup = html(finished());
        expect(markup).toContain(row('Monthly saving', '£116.51'));
        expect(markup).toContain(row('Current monthly payment', '£1,228.17'));
        expect(markup).toContain(row('New monthly payment', '£1,111.66'));
        expect(markup).toContain(row('Cost of switching', '£1,999'));
        expect(markup).toContain(row('Time to break even', '1 year 1 month'));
        expect(markup).toContain(row('New loan amount', '£200,000'));
        expect(markup).toContain('<option value="upfront" selected="">Paid upfront</option>');
    });

    it('borrows the fee when asked, and says when a dearer deal never pays back', () => {
        expect(html(finished({ defaultFeePayment: 'add-to-loan' }))).toContain(row('New loan amount', '£200,999'));
        expect(html(finished({ defaultNewRate: 6 }))).toContain(row('Time to break even', 'Never'));
    });

    it('shows the form error instead of results', () => {
        const markup = html(<RemortgageCalculator defaultBalance={200_000} defaultCurrentRate={5.5} />);
        expect(markup).toContain('<p class="pc-hint" role="status">Enter a new interest rate between 0% and 25%.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(html(<RemortgageCalculator />)).toContain('Enter the mortgage balance.');
        expect(html(finished({ defaultFixedYears: 20 }))).toContain('Enter a fixed period of 1 to 15 whole years.');
    });

    it('labels every control', () => expectLabelled(finished(), 8));

    it('offers a PDF only when asked, and can go unstyled', () =>
        expectShared('pc-remortgage', finished, <RemortgageCalculator pdf />));
});

describe('BuyingCostsCalculator', () => {
    const finished = (props: object = {}) => (
        <BuyingCostsCalculator
            defaultPrice={300_000}
            defaultDeposit={30_000}
            defaultFees={{ legalFees: 1_500, survey: 500, removals: 800 }}
            {...props}
        />
    );

    it('renders the cash needed from its defaults', () => {
        const markup = html(finished());
        expect(markup).toContain(row('Cash needed upfront', '£37,800'));
        expect(markup).toContain(row('Stamp duty', '£5,000'));
        expect(markup).toContain(row('Fees and other costs', '£2,800'));
        expect(markup).toContain(row('Total cost of the purchase', '£307,800'));
        expect(markup).toContain(row('Loan amount', '£270,000'));
    });

    it('lists the items worth something, each with its share', () => {
        const markup = html(finished());
        for (const heading of ['Item', 'Amount', 'Share of cash upfront']) expect(markup).toContain(`>${heading}</th>`);
        expect(markup).toContain(
            '<td data-align="left">Deposit</td><td data-align="right">£30,000</td><td data-align="right">79.37%</td>',
        );
        expect(markup).toContain('<td data-align="left">Legal fees</td><td data-align="right">£1,500</td>');
        expect(markup.match(/<tr data-key=/g)).toHaveLength(5);
        expect(markup).not.toContain('<td data-align="left">Valuation fee</td>');
        expect(html(finished({ showBreakdown: false }))).not.toContain('<table');
    });

    it('works the stamp duty out for the buyer type', () => {
        const markup = html(finished({ defaultBuyer: 'additional-property' }));
        expect(markup).toContain(row('Stamp duty', '£20,000'));
    });

    it('shows the form error instead of results', () => {
        const markup = html(<BuyingCostsCalculator />);
        expect(markup).toContain('<p class="pc-hint" role="status">Enter the property price.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('<table');
        expect(html(finished({ defaultDeposit: 400_000 }))).toContain('The deposit is more than the price.');
    });

    it('has a labelled box for every named fee', () => {
        expectLabelled(finished(), 3 + BUYING_COST_FEES.length);
        for (const fee of BUYING_COST_FEES) expect(html(finished())).toContain(`>${fee.label}</label>`);
    });

    it('offers a PDF only when asked, and can go unstyled', () =>
        expectShared('pc-buying-costs', finished, <BuyingCostsCalculator pdf />));
});
