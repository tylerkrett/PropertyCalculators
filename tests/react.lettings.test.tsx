import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PricePerAreaCalculator } from '../src/react/PricePerAreaCalculator';
import { TenantDepositCalculator } from '../src/react/TenantDepositCalculator';

const html = renderToStaticMarkup;

/** Every input and select must be the target of a label. */
function expectLabelled(element: ReactElement, controls: number) {
    const markup = html(element);
    const ids = [...markup.matchAll(/<(?:input|select)[^>]*? id="([^"]+)"/g)].map((match) => match[1]!);
    expect(ids).toHaveLength(controls);
    expect(markup.match(/<(?:input|select)/g)).toHaveLength(controls);
    for (const id of ids) expect(markup, id).toContain(`<label class="pc-label" for="${id}"`);
}

describe('PricePerAreaCalculator', () => {
    it('renders a sale from its defaults, with the comparison', () => {
        const markup = html(
            <PricePerAreaCalculator defaultAmount={1_000_000} defaultArea={800} defaultComparable={1_150} />,
        );
        expect(markup).toContain('value="1,000,000"');
        expect(markup).toContain('<dt>Price per sq ft</dt><dd>£1,250 per sq ft</dd>');
        expect(markup).toContain('<dt>Price per sq m</dt><dd>£13,455 per sq m</dd>');
        expect(markup).toContain('<dt>Area in sq m</dt><dd>74.32 sq m</dd>');
        expect(markup).toContain('data-key="perSqFt" data-lead="true"');
        expect(markup).toContain('8.7% above the comparable average of £1,150 per sq ft.</p>');
    });

    it('shows no comparison without a comparable', () => {
        const markup = html(<PricePerAreaCalculator defaultAmount={1_000_000} defaultArea={800} />);
        expect(markup).toContain('£1,250 per sq ft');
        expect(markup).not.toContain('class="pc-hint"');
    });

    it('offers the rent period only for a letting, and works a rent out per year', () => {
        const sale = html(<PricePerAreaCalculator defaultAmount={1_000_000} defaultArea={800} />);
        expect(sale).not.toContain('Rent is paid');
        expect(sale).toContain('<option value="sale" selected="">For sale</option>');

        const letting = html(
            <PricePerAreaCalculator
                defaultBasis="rent"
                defaultAmount={3_000}
                defaultArea={100}
                defaultAreaUnit="sqm"
                defaultComparable={350.5}
            />,
        );
        expect(letting).toContain('Rent is paid');
        expect(letting).toContain('<option value="rent" selected="">To let</option>');
        expect(letting).toContain('<dt>Rent per sq m per year</dt><dd>£360.00 per sq m per year</dd>');
        expect(letting).toContain('<dt>Rent per year</dt><dd>£36,000</dd>');
        expect(letting).toContain('Comparable average per sq m per year (optional)');
        expect(letting).toContain('value="350.50"');
        expect(letting).toContain('2.71% above the comparable average of £350.50 per sq m per year.');
    });

    it('shows the form error instead of results', () => {
        const markup = html(<PricePerAreaCalculator defaultArea={800} pdf />);
        expect(markup).toContain('class="pc-status" role="status" data-state="error">Enter the property price.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('class="pc-download"');
        expect(html(<PricePerAreaCalculator defaultAmount={500_000} />)).toContain('Enter the floor area.');
        expect(html(<PricePerAreaCalculator defaultBasis="rent" defaultArea={800} />)).toContain('Enter the rent.');
    });

    it('offers a PDF only when asked', () => {
        const props = { defaultAmount: 1_000_000, defaultArea: 800 };
        expect(html(<PricePerAreaCalculator {...props} />)).not.toContain('class="pc-download"');
        expect(html(<PricePerAreaCalculator {...props} pdf />)).toContain('Download PDF</button>');
        expect(html(<PricePerAreaCalculator {...props} pdf={{ label: 'Save' }} />)).toContain('Save</button>');
    });

    it('labels every control', () => {
        expectLabelled(<PricePerAreaCalculator />, 5);
        expectLabelled(<PricePerAreaCalculator defaultBasis="rent" />, 6);
    });

    it('ships its styles unless unstyled, and passes other props to the root', () => {
        expect(html(<PricePerAreaCalculator />)).toContain('--pc-accent');
        const bare = html(<PricePerAreaCalculator unstyled id="ppa" theme="dark" className="card" />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="ppa" data-theme="dark" class="pc pc-price-per-area card">');
        expect(html(<PricePerAreaCalculator />)).toContain('class="pc pc-styled pc-price-per-area"');
    });
});

describe('TenantDepositCalculator', () => {
    it('renders the caps from its defaults, and says a proposed deposit is over the cap', () => {
        const markup = html(<TenantDepositCalculator defaultRent={1_200} defaultProposedDeposit={1_500} />);
        expect(markup).toContain('value="1,200"');
        expect(markup).toContain('<option value="month" selected="">Per month</option>');
        expect(markup).toContain('<dt>Maximum tenancy deposit</dt><dd>£1,384.61</dd>');
        expect(markup).toContain('<dt>Maximum holding deposit</dt><dd>£276.92</dd>');
        expect(markup).toContain('<dt>Maximum rent before the tenancy starts</dt><dd>£1,200.00</dd>');
        expect(markup).toContain('<dt>Tenancy deposit cap</dt><dd>5 weeks’ rent</dd>');
        expect(markup).toContain('£1,500.00 is £115.39 over the £1,384.61 cap.</p>');
        expect(markup).toContain('the law in England only');
    });

    it('says a proposed deposit is within the cap, and nothing when there is none', () => {
        const within = html(<TenantDepositCalculator defaultRent={1_200} defaultProposedDeposit={1_384.61} />);
        expect(within).toContain('value="1,384.61"');
        expect(within).toContain('£1,384.61 is within the £1,384.61 cap.</p>');
        const none = html(<TenantDepositCalculator defaultRent={1_200} />);
        expect(none).not.toContain(' cap.</p>');
        expect(none.match(/class="pc-hint"/g)).toHaveLength(1);
    });

    it('uses the six-week cap and the 28-day limit where they apply', () => {
        const markup = html(<TenantDepositCalculator defaultRent={1_000} defaultRentPeriod="week" />);
        expect(markup).toContain('<dd>6 weeks’ rent</dd>');
        expect(markup).toContain('<dt>Maximum tenancy deposit</dt><dd>£6,000.00</dd>');
        expect(markup).toContain('<dt>Maximum rent before the tenancy starts</dt><dd>£4,000.00</dd>');
    });

    it('shows the form error instead of results', () => {
        const markup = html(<TenantDepositCalculator pdf />);
        expect(markup).toContain('class="pc-status" role="status" data-state="error">Enter the rent.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('class="pc-download"');
        expect(markup).toContain('the law in England only');
        expect(html(<TenantDepositCalculator defaultRent={9_000} />)).toContain(
            'The Tenant Fees Act does not cover rents above £100,000 a year.',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(<TenantDepositCalculator defaultRent={1_200} />)).not.toContain('class="pc-download"');
        expect(html(<TenantDepositCalculator defaultRent={1_200} pdf />)).toContain('Download PDF</button>');
    });

    it('labels every control', () => {
        expectLabelled(<TenantDepositCalculator />, 4);
    });

    it('ships its styles unless unstyled, and passes other props to the root', () => {
        expect(html(<TenantDepositCalculator />)).toContain('--pc-accent');
        const bare = html(<TenantDepositCalculator unstyled id="td" theme="auto" classNames={{ row: 'py-1' }} />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="td" data-theme="auto" class="pc pc-tenant-deposit">');
        expect(html(<TenantDepositCalculator defaultRent={1_200} classNames={{ row: 'py-1' }} />)).toContain(
            'class="pc-row py-1"',
        );
    });
});
