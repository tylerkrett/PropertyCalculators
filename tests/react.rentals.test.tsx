import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RentConverterCalculator } from '../src/react/RentConverterCalculator';
import { TenantAffordabilityCalculator } from '../src/react/TenantAffordabilityCalculator';

const html = renderToStaticMarkup;

/** Every input and select must be the target of a label. */
function expectLabelled(element: ReactElement, controls: number) {
    const markup = html(element);
    const ids = [...markup.matchAll(/<(?:input|select)[^>]*? id="([^"]+)"/g)].map((match) => match[1]!);
    expect(ids).toHaveLength(controls);
    expect(markup.match(/<(?:input|select)/g)).toHaveLength(controls);
    for (const id of ids) expect(markup, id).toContain(`<label class="pc-label" for="${id}"`);
}

describe('RentConverterCalculator', () => {
    it('renders a weekly rent in every period, leading with the month', () => {
        const markup = html(<RentConverterCalculator defaultRent={650} defaultPeriod="week" defaultTenants={2} />);
        expect(markup).toContain('value="650"');
        expect(markup).toContain('<option value="week" selected="">Per week</option>');
        expect(markup).toContain('data-key="monthly" data-lead="true"');
        expect(markup).toContain('<dt>Rent per month</dt><dd>£2,816.67</dd>');
        expect(markup).toContain('<dt>Rent per week</dt><dd>£650.00</dd>');
        expect(markup).toContain('<dt>Rent per year</dt><dd>£33,800.00</dd>');
        expect(markup).toContain('<dt>Rent per day</dt><dd>£92.60</dd>');
        expect(markup).toContain('<dt>Per person per month</dt><dd>£1,408.33</dd>');
        expect(markup).toContain('data-state="result">Rent per month: £2,816.67</p>');
    });

    it('defaults to a monthly rent for one tenant, with no per-person rows', () => {
        const markup = html(<RentConverterCalculator defaultRent={1_200} />);
        expect(markup).toContain('<option value="month" selected="">Per month</option>');
        expect(markup).toContain('data-key="weekly" data-lead="true"');
        expect(markup).toContain('<dt>Rent per week</dt><dd>£276.92</dd>');
        expect(markup).not.toContain('Per person');
        // A starting period that is not one falls back to the default instead of breaking the render.
        expect(html(<RentConverterCalculator defaultRent={1_200} defaultPeriod={'day' as never} />)).toContain(
            '<option value="month" selected="">Per month</option>',
        );
    });

    it('shows the form error instead of results', () => {
        const markup = html(<RentConverterCalculator pdf />);
        expect(markup).toContain('class="pc-status" role="status" data-state="error">Enter the rent.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('class="pc-download"');
        expect(html(<RentConverterCalculator defaultRent={1_200} defaultTenants={0} />)).toContain(
            'Enter the number of tenants, from 1 to 20.',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(<RentConverterCalculator defaultRent={1_200} />)).not.toContain('class="pc-download"');
        expect(html(<RentConverterCalculator defaultRent={1_200} pdf />)).toContain('Download PDF</button>');
        expect(html(<RentConverterCalculator defaultRent={1_200} pdf={{ label: 'Save' }} />)).toContain(
            'Save</button>',
        );
    });

    it('labels every control', () => {
        expectLabelled(<RentConverterCalculator />, 3);
    });

    it('ships its styles unless unstyled, and passes other props to the root', () => {
        expect(html(<RentConverterCalculator />)).toContain('--pc-accent');
        expect(html(<RentConverterCalculator />)).toContain('class="pc pc-styled pc-rent-converter"');
        const bare = html(<RentConverterCalculator unstyled id="rc" theme="dark" className="card" />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="rc" data-theme="dark" class="pc pc-rent-converter card">');
        expect(html(<RentConverterCalculator defaultRent={1_200} classNames={{ row: 'py-1' }} />)).toContain(
            'class="pc-row py-1"',
        );
    });
});

describe('TenantAffordabilityCalculator', () => {
    it('renders the income a rent needs from its defaults', () => {
        const markup = html(<TenantAffordabilityCalculator defaultRent={1_500} />);
        expect(markup).toContain('value="1,500"');
        expect(markup).toContain('<option value="month" selected="">Per month</option>');
        expect(markup).toContain('value="30"');
        expect(markup).toContain('value="36"');
        expect(markup).toContain('data-key="incomeNeeded" data-lead="true"');
        expect(markup).toContain('<dt>Annual income needed</dt><dd>£45,000</dd>');
        expect(markup).toContain('<dt>Guarantor income needed</dt><dd>£54,000</dd>');
        expect(markup).not.toContain('Affordability check');
        expect(markup).not.toContain('Income needed per tenant');
        expect(markup).toContain('data-state="result">Annual income needed: £45,000</p>');
    });

    it('says whether an income passes, with the shortfall and the most rent it supports', () => {
        const short = html(
            <TenantAffordabilityCalculator defaultRent={1_500} defaultIncome={42_000} defaultTenants={2} />,
        );
        expect(short).toContain('value="42,000"');
        expect(short).toContain('<dt>Affordability check</dt><dd>Does not pass</dd>');
        expect(short).toContain('<dt>Income shortfall</dt><dd>£3,000</dd>');
        expect(short).toContain('<dt>Income needed per tenant</dt><dd>£22,500</dd>');
        expect(short).toContain('<dt>Most rent per month for this income</dt><dd>£1,400</dd>');
        expect(short).toContain('<dt>Most rent per week for this income</dt><dd>£323.07</dd>');

        const passes = html(<TenantAffordabilityCalculator defaultRent={1_500} defaultIncome={45_000} />);
        expect(passes).toContain('<dt>Affordability check</dt><dd>Passes</dd>');
        expect(passes).not.toContain('Income shortfall');
    });

    it('takes a weekly rent and multiples of your own', () => {
        const markup = html(
            <TenantAffordabilityCalculator
                defaultRent={650}
                defaultRentPeriod="week"
                defaultMultiple={36}
                defaultGuarantorMultiple={40}
            />,
        );
        // 650 × 52 / 12 = 2,816.666…; × 36 = 101,400; × 40 = 112,666.666… → 112,666.67.
        expect(markup).toContain('<dt>Annual income needed</dt><dd>£101,400</dd>');
        expect(markup).toContain('<dt>Guarantor income needed</dt><dd>£112,666.67</dd>');
        expect(markup).toContain('<dt>Rent per month</dt><dd>£2,816.67</dd>');
    });

    it('always says the multiples are convention and what the Renters’ Rights Act changed', () => {
        for (const markup of [
            html(<TenantAffordabilityCalculator />),
            html(<TenantAffordabilityCalculator defaultRent={1_500} />),
        ]) {
            expect(markup.match(/class="pc-hint"/g)).toHaveLength(1);
            expect(markup).toContain('conventions used by referencing firms, not law');
            expect(markup).toContain('Renters’ Rights Act 2025');
        }
    });

    it('shows the form error instead of results', () => {
        const markup = html(<TenantAffordabilityCalculator pdf />);
        expect(markup).toContain('class="pc-status" role="status" data-state="error">Enter the rent.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('class="pc-download"');
        expect(html(<TenantAffordabilityCalculator defaultRent={1_500} defaultMultiple={0} />)).toContain(
            'Enter an income multiple from 1 to 100.',
        );
        expect(html(<TenantAffordabilityCalculator defaultRent={1_500} defaultTenants={21} />)).toContain(
            'Enter the number of tenants, from 1 to 20.',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(<TenantAffordabilityCalculator defaultRent={1_500} />)).not.toContain('class="pc-download"');
        expect(html(<TenantAffordabilityCalculator defaultRent={1_500} pdf />)).toContain('Download PDF</button>');
    });

    it('labels every control', () => {
        expectLabelled(<TenantAffordabilityCalculator />, 6);
    });

    it('ships its styles unless unstyled, and passes other props to the root', () => {
        expect(html(<TenantAffordabilityCalculator />)).toContain('--pc-accent');
        expect(html(<TenantAffordabilityCalculator />)).toContain('class="pc pc-styled pc-tenant-affordability"');
        const bare = html(<TenantAffordabilityCalculator unstyled id="ta" theme="auto" classNames={{ row: 'x' }} />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="ta" data-theme="auto" class="pc pc-tenant-affordability">');
    });
});
