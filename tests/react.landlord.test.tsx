import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LANDLORD_INCOME_NOTICE } from '../src/landlord-income/index';
import { LandlordIncomeCalculator } from '../src/react/LandlordIncomeCalculator';

const html = renderToStaticMarkup;

/** Every input and select has an id, and a label pointing at it. */
function expectLabelled(element: ReactElement, controls: number) {
    const markup = html(element);
    const ids = [...markup.matchAll(/<(?:input|select)\b[^>]*>/g)].map((match) => / id="([^"]+)"/.exec(match[0])?.[1]);
    expect(ids).toHaveLength(controls);
    for (const id of ids) {
        expect(id).toBeTruthy();
        expect(markup).toMatch(new RegExp(`<label class="pc-(label|check)" for="${id}">`));
    }
}

describe('LandlordIncomeCalculator', () => {
    // The basic-rate landlord of the calculator's own tests: £4,000 a year after £1,000 of tax.
    const letting = {
        defaultRent: 1_000,
        defaultManagementFeePercent: 10,
        defaultCosts: { insurance: 360, maintenance: 1_200 },
        defaultMortgageInterest: 4_000,
        defaultOtherIncome: 30_000,
    };

    it('renders a finished result from its defaults', () => {
        const markup = html(<LandlordIncomeCalculator {...letting} />);
        expect(markup).toContain('value="1,000"');
        expect(markup).toContain('value="30,000"');
        expect(markup).toContain('data-lead="true"><dt>Net income per year</dt><dd>£4,000</dd>');
        expect(markup).toContain('<dt>Net income per month</dt><dd>£333.33</dd>');
        expect(markup).toContain('<dt>Management fee</dt><dd>£1,200</dd>');
        expect(markup).toContain('<dt>VAT on the management fee</dt><dd>£240</dd>');
        expect(markup).toContain('<dt>Profit before finance costs</dt><dd>£9,000</dd>');
        expect(markup).toContain('<dt>Finance cost tax credit</dt><dd>£800</dd>');
        expect(markup).toContain('<dt>Income tax on the property</dt><dd>£1,000</dd>');
        expect(markup).toContain('<option value="2026-27" selected="">2026 to 2027</option>');
        expect(markup).toContain('role="status" data-state="result">Net income per year: £4,000</p>');
    });

    it('honours the rent period, the VAT tick box and the tax year', () => {
        const markup = html(
            <LandlordIncomeCalculator
                {...letting}
                defaultRent={12_000}
                defaultRentPeriod="year"
                defaultFeesIncludeVat
                defaultTaxYear="2027-28"
            />,
        );
        // 10% including VAT is £1,200: £1,000 of fee and £200 of VAT.
        expect(markup).toContain('<dt>Management fee</dt><dd>£1,000</dd>');
        expect(markup).toContain('type="checkbox" checked=""');
        expect(markup).toContain('<option value="year" selected="">');
        expect(markup).toContain('<option value="2027-28" selected="">');
        expect(markup).toContain('were announced at Budget 2026 and are not yet law.');
        // A starting value that is not an option falls back to the default.
        const odd = html(<LandlordIncomeCalculator {...letting} defaultTaxYear={'1999-00' as never} />);
        expect(odd).toContain('<option value="2026-27" selected="">');
    });

    it('shows the notes for the result, then what the estimate leaves out', () => {
        const markup = html(
            <LandlordIncomeCalculator defaultRent={1_000} defaultMortgageInterest={9_000} defaultOtherIncome={5_000} />,
        );
        expect(markup).toContain(
            '<p class="pc-hint">The tax credit is limited to the £4,430 of income above the personal allowance',
        );
        expect(markup).toContain('<dt>Finance costs carried forward</dt><dd>£4,570</dd>');
        expect(markup).toContain(`<p class="pc-hint">${LANDLORD_INCOME_NOTICE}</p>`);
        expect(markup.indexOf('class="pc-rows"')).toBeLessThan(markup.indexOf('The tax credit is limited'));
        expect(markup.indexOf('The tax credit is limited')).toBeLessThan(
            markup.indexOf('A guide only, not tax advice.'),
        );
    });

    it('shows the form error instead of results, and keeps the notice', () => {
        const empty = html(<LandlordIncomeCalculator pdf />);
        expect(empty).toContain('class="pc-status" role="status" data-state="error">Enter the rent.</p>');
        expect(empty).not.toContain('class="pc-rows"');
        expect(empty).not.toContain('class="pc-download"');
        expect(empty).toContain('A guide only, not tax advice.');
        expect(html(<LandlordIncomeCalculator defaultRent={1_000} defaultVoidWeeks={60} />)).toContain(
            'Empty weeks must be between 0 and 52.',
        );
        expect(html(<LandlordIncomeCalculator defaultRent={1_000} defaultManagementFeePercent={150} />)).toContain(
            'Enter a management fee between 0% and 100%.',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(<LandlordIncomeCalculator {...letting} />)).not.toContain('class="pc-download"');
        expect(html(<LandlordIncomeCalculator {...letting} pdf />)).toContain('Download PDF</button>');
        expect(html(<LandlordIncomeCalculator {...letting} pdf={{ label: 'Save as PDF' }} />)).toContain(
            'Save as PDF</button>',
        );
    });

    it('labels every control', () => expectLabelled(<LandlordIncomeCalculator />, 13));

    it('ships its styles by default, drops them when unstyled, and passes other props to the root', () => {
        expect(html(<LandlordIncomeCalculator {...letting} />)).toContain('--pc-accent');
        expect(html(<LandlordIncomeCalculator {...letting} />)).toContain('class="pc pc-styled pc-landlord-income"');
        const bare = html(
            <LandlordIncomeCalculator unstyled id="l" theme="auto" classNames={{ row: 'py-1' }} {...letting} />,
        );
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="l" data-theme="auto" class="pc pc-landlord-income">');
        expect(bare).toContain('class="pc-row py-1"');
    });
});
