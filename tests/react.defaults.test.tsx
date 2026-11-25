import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import * as components from '../src/react/index';
import { STYLES } from '../src/react/index';

const html = renderToStaticMarkup;

describe('a bad default never breaks the render', () => {
    const bogus = 'bogus' as never;
    const cases: [string, ReactElement, string][] = [
        [
            'StampDutyCalculator',
            <components.StampDutyCalculator defaultPrice={750_000} defaultBuyer={bogus} />,
            '£27,500',
        ],
        [
            'PropertyTaxCalculator',
            <components.PropertyTaxCalculator
                defaultPrice={300_000}
                defaultCountry={bogus}
                defaultBuyer={bogus}
                defaultPropertyType={bogus}
            />,
            'SDLT to pay',
        ],
        [
            'CompanyStampDutyCalculator',
            <components.CompanyStampDutyCalculator defaultPrice={750_000} defaultRelief={bogus} />,
            '<option value="" selected="">No relief</option>',
        ],
        [
            'MortgageCalculator',
            <components.MortgageCalculator defaultPrice={500_000} defaultType={bogus} defaultBuyer={bogus} />,
            'class="pc-rows"',
        ],
        [
            'RentalYieldCalculator',
            <components.RentalYieldCalculator
                defaultPrice={400_000}
                defaultRent={2_000}
                defaultRentPeriod={bogus}
                defaultBuyer={bogus}
            />,
            '<option value="month" selected="">',
        ],
        [
            'AffordabilityCalculator',
            <components.AffordabilityCalculator defaultIncome={45_000} defaultBuyer={bogus} />,
            'class="pc-rows"',
        ],
        [
            'BuyToLetCalculator',
            <components.BuyToLetCalculator
                defaultRent={1_200}
                defaultPrice={250_000}
                defaultDeposit={75_000}
                defaultRentPeriod={bogus}
                defaultBorrower={bogus}
            />,
            'class="pc-rows"',
        ],
        [
            'RemortgageCalculator',
            <components.RemortgageCalculator
                defaultBalance={200_000}
                defaultCurrentRate={6}
                defaultNewRate={4}
                defaultFeePayment={bogus}
            />,
            'class="pc-rows"',
        ],
        [
            'BuyingCostsCalculator',
            <components.BuyingCostsCalculator
                defaultPrice={300_000}
                defaultBuyer={bogus}
                defaultFees={null as never}
            />,
            'class="pc-rows"',
        ],
        [
            'PricePerAreaCalculator',
            <components.PricePerAreaCalculator
                defaultAmount={1_000_000}
                defaultArea={800}
                defaultBasis={bogus}
                defaultAreaUnit={bogus}
                defaultRentPeriod={bogus}
            />,
            '£1,250 per sq ft',
        ],
        [
            'TenantDepositCalculator',
            <components.TenantDepositCalculator
                defaultRent={1_200}
                defaultRentPeriod={bogus}
                defaultRentPaid={bogus}
            />,
            '£1,384.61',
        ],
        ['OverpaymentCalculator', <components.OverpaymentCalculator defaultBalance={'x' as never} />, 'pc-status'],
        ['DeskCalculator', <components.DeskCalculator rates={bogus} theme={bogus} />, 'pc-display'],
    ];

    it.each(cases)('%s falls back to its default', (_name, element, expected) => {
        expect(html(element)).toContain(expected);
    });
});

describe('the inline stylesheet', () => {
    it('has no character that React 18 escapes in a text child, so its server output is the same CSS', () => {
        // React 18 turns these into entities, which a browser does not decode inside <style>.
        expect(STYLES.match(/['"&<>]/g)).toBeNull();
    });

    it('reaches the markup byte for byte', () => {
        const markup = html(<components.StampDutyCalculator theme="dark" />);
        const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(markup)?.[1];
        expect(css).toBe(STYLES);
        expect(css).toContain('[data-theme=dark]');
    });

    it('still styles each theme, layout and key variant by attribute', () => {
        for (const selector of ['[data-theme=dark]', '[data-theme=auto]', '[data-layout=grid]', '[data-align=right]'])
            expect(STYLES).toContain(selector);
        for (const variant of ['operator', 'clear', 'function']) expect(STYLES).toContain(`[data-variant=${variant}]`);
        expect(STYLES).toContain('.pc-status:not([data-state=error])');
    });
});

describe('TenantDepositCalculator: how the rent is paid', () => {
    const paid = (markup: string) =>
        /<option value="([^"]+)" selected="">(?:Monthly|More often than monthly)/.exec(markup)?.[1];

    it('offers the choice, following the rent period until it is set', () => {
        const monthly = html(<components.TenantDepositCalculator defaultRent={1_300} />);
        expect(monthly).toContain('>Rent is paid</label>');
        expect(monthly).toContain('>Rent is quoted</label>');
        expect(paid(monthly)).toBe('monthly');
        expect(paid(html(<components.TenantDepositCalculator defaultRent={300} defaultRentPeriod="week" />))).toBe(
            'more-often',
        );
    });

    it('uses the 28-day limit for a monthly rent paid more often', () => {
        const markup = html(<components.TenantDepositCalculator defaultRent={1_300} defaultRentPaid="more-often" />);
        expect(paid(markup)).toBe('more-often');
        expect(markup).toContain('<dt>Maximum rent before the tenancy starts</dt><dd>£1,200.00</dd>');
    });
});
