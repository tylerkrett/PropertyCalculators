import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AffordabilityCalculator } from '../src/react/AffordabilityCalculator';
import { BuyToLetCalculator } from '../src/react/BuyToLetCalculator';

const html = renderToStaticMarkup;

/** Every input and select has an id, and a label pointing at it. */
function expectLabelled(element: ReactElement, controls: number) {
    const markup = html(element);
    const ids = [...markup.matchAll(/<(?:input|select)\b[^>]*>/g)].map((match) => / id="([^"]+)"/.exec(match[0])?.[1]);
    expect(ids).toHaveLength(controls);
    for (const id of ids) {
        expect(id).toBeTruthy();
        expect(markup).toContain(`<label class="pc-label" for="${id}">`);
    }
}

describe('AffordabilityCalculator', () => {
    const couple = (
        <AffordabilityCalculator
            defaultIncome={45_000}
            defaultSecondIncome={30_000}
            defaultMonthlyCommitments={400}
            defaultDeposit={50_000}
            defaultRate={4.5}
            defaultTermYears={30}
        />
    );

    it('renders a finished result from its defaults', () => {
        const markup = html(couple);
        expect(markup).toContain('value="45,000"');
        expect(markup).toContain('data-lead="true"><dt>Maximum property price</dt><dd>£365,900</dd>');
        expect(markup).toContain('<dt>Maximum loan</dt><dd>£315,900</dd>');
        expect(markup).toContain('<dt>Income after commitments</dt><dd>£70,200</dd>');
        expect(markup).toContain('<dt>Loan to value</dt><dd>86.34%</dd>');
        expect(markup).toContain('<dt>Monthly repayment</dt><dd>£1,600.62</dd>');
        expect(markup).toContain('<dt>Stressed interest rate</dt><dd>7.5%</dd>');
        expect(markup).toContain('<dt>Cash needed upfront</dt>');
    });

    it('needs only the first income, and honours the multiple and the buyer', () => {
        const markup = html(
            <AffordabilityCalculator
                defaultIncome={60_000}
                defaultIncomeMultiple={5}
                defaultBuyer="first-time-buyer"
            />,
        );
        expect(markup).toContain('<dt>Maximum property price</dt><dd>£300,000</dd>');
        expect(markup).toContain('<dt>Stamp duty</dt><dd>£0</dd>');
        expect(markup).toContain('<option value="first-time-buyer" selected="">');
    });

    it('shows the form error instead of results', () => {
        const empty = html(<AffordabilityCalculator pdf />);
        expect(empty).toContain('<p class="pc-hint" role="status">Enter your yearly income before tax.</p>');
        expect(empty).not.toContain('class="pc-rows"');
        expect(empty).not.toContain('class="pc-download"');
        expect(html(<AffordabilityCalculator defaultIncome={45_000} defaultRate={40} />)).toContain(
            'Enter an interest rate between 0% and 25%.',
        );
        expect(html(<AffordabilityCalculator defaultIncome={12_000} defaultMonthlyCommitments={1_000} />)).toContain(
            'The monthly commitments use up all the income',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(couple)).not.toContain('class="pc-download"');
        expect(html(<AffordabilityCalculator defaultIncome={45_000} pdf />)).toContain('Download PDF</button>');
        expect(html(<AffordabilityCalculator defaultIncome={45_000} pdf={{ label: 'Save as PDF' }} />)).toContain(
            'Save as PDF</button>',
        );
    });

    it('labels every control', () => expectLabelled(<AffordabilityCalculator />, 8));

    it('ships its styles by default, drops them when unstyled, and passes other props to the root', () => {
        expect(html(couple)).toContain('--pc-accent');
        expect(html(couple)).toContain('class="pc pc-styled pc-affordability"');
        const bare = html(<AffordabilityCalculator unstyled id="a" theme="dark" className="card" />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="a" data-theme="dark" class="pc pc-affordability card">');
    });
});

describe('BuyToLetCalculator', () => {
    const letting = { defaultRent: 1_200, defaultPrice: 250_000, defaultDeposit: 62_500 };

    it('renders the verdict and the rows from its defaults', () => {
        const markup = html(<BuyToLetCalculator {...letting} defaultBorrower="higher-rate" />);
        expect(markup).toContain(
            '<p class="pc-hint" role="status">Falls short: the rent covers the stressed interest by 139.63%, and the lender needs 145%.</p>',
        );
        expect(markup).toContain('data-lead="true"><dt>Interest cover ratio</dt><dd>139.63%</dd>');
        expect(markup).toContain('<dt>Loan amount</dt><dd>£187,500</dd>');
        expect(markup).toContain('<dt>Monthly interest at the stress rate</dt><dd>£859.38</dd>');
        expect(markup).toContain('<dt>Minimum rent per month for the loan</dt><dd>£1,246.10</dd>');
        expect(markup).toContain('<dt>Rent shortfall per month</dt><dd>£46.10</dd>');
        expect(markup).toContain('<dt>Loan to value</dt><dd>75%</dd>');
        // The verdict comes before the figures.
        expect(markup.indexOf('Falls short')).toBeLessThan(markup.indexOf('class="pc-rows"'));
    });

    it('passes a basic-rate borrower on the same figures, and reads weekly rent', () => {
        const basic = html(<BuyToLetCalculator {...letting} />);
        expect(basic).toContain('Passes: the rent covers the stressed interest by 139.63%, and the lender needs 125%.');
        expect(basic).toContain('<dt>Rent headroom per month</dt>');
        const weekly = html(<BuyToLetCalculator {...letting} defaultRent={300} defaultRentPeriod="week" />);
        expect(weekly).toContain('<dt>Rent per month</dt><dd>£1,300.00</dd>');
    });

    it('shows the form error instead of results', () => {
        const markup = html(<BuyToLetCalculator defaultPrice={250_000} defaultDeposit={62_500} pdf />);
        expect(markup).toContain('<p class="pc-hint" role="status">Enter the rent.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('class="pc-download"');
        expect(html(<BuyToLetCalculator defaultRent={1_200} />)).toContain('Enter the property price.');
        expect(html(<BuyToLetCalculator {...letting} defaultDeposit={250_000} />)).toContain(
            'The deposit covers the whole price, so there is nothing to borrow.',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(<BuyToLetCalculator {...letting} />)).not.toContain('class="pc-download"');
        expect(html(<BuyToLetCalculator {...letting} pdf />)).toContain('Download PDF</button>');
    });

    it('labels every control', () => expectLabelled(<BuyToLetCalculator />, 6));

    it('ships its styles by default, drops them when unstyled, and passes other props to the root', () => {
        expect(html(<BuyToLetCalculator {...letting} />)).toContain('--pc-accent');
        expect(html(<BuyToLetCalculator {...letting} />)).toContain('class="pc pc-styled pc-buy-to-let"');
        const bare = html(
            <BuyToLetCalculator unstyled id="b" theme="auto" classNames={{ row: 'py-1' }} {...letting} />,
        );
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="b" data-theme="auto" class="pc pc-buy-to-let">');
        expect(bare).toContain('class="pc-row py-1"');
    });
});
