import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CapitalGainsCalculator } from '../src/react/CapitalGainsCalculator';
import { SellingCostsCalculator } from '../src/react/SellingCostsCalculator';

const html = renderToStaticMarkup;

/** Every input and select must be the target of a label. */
function expectLabelled(element: ReactElement, controls: number) {
    const markup = html(element);
    const ids = [...markup.matchAll(/<(?:input|select)[^>]*? id="([^"]+)"/g)].map((match) => match[1]!);
    expect(ids).toHaveLength(controls);
    expect(markup.match(/<(?:input|select)/g)).toHaveLength(controls);
    for (const id of ids) expect(markup, id).toMatch(new RegExp(`<label class="pc-(label|check)" for="${id}"`));
}

describe('SellingCostsCalculator', () => {
    const sale = {
        defaultPrice: 350_000,
        defaultMortgage: 180_000,
        defaultEarlyRepaymentCharge: 1_800,
        defaultAgentFeePercent: 1.25,
        defaultFees: { legalFees: 1_500, epc: 85, removals: 900 },
    };

    it('renders the money left and where the price goes from its defaults', () => {
        const markup = html(<SellingCostsCalculator {...sale} />);
        expect(markup).toContain('value="350,000"');
        expect(markup).toContain('value="1.25"');
        expect(markup).toContain('<option value="percent" selected="">A percentage of the price</option>');
        expect(markup).toContain('data-key="netProceeds" data-lead="true"');
        expect(markup).toContain('<dt>Money left after the sale</dt><dd>£160,465</dd>');
        expect(markup).toContain('<dt>Selling costs</dt><dd>£7,735</dd>');
        expect(markup).toContain('<dt>Mortgage repaid</dt><dd>£181,800</dd>');
        expect(markup).toContain('<dt>VAT on the agent fee</dt><dd>£875</dd>');
        expect(markup).toContain('Where the sale price goes</caption>');
        expect(markup).toContain(
            '<tr data-key="agentFee"><td data-align="left">Estate agent fee</td><td data-align="right">£4,375</td><td data-align="right">1.25%</td></tr>',
        );
        expect(markup).toContain('role="status" data-state="result">Money left after the sale: £160,465</p>');
        expect(markup).not.toContain('class="pc-hint"');
    });

    it('starts on a fixed fee when one is given, and splits a fee that includes VAT', () => {
        const markup = html(
            <SellingCostsCalculator defaultPrice={350_000} defaultAgentFeeFixed={3_000} defaultAgentFeeIncludesVat />,
        );
        expect(markup).toContain('<option value="fixed" selected="">A fixed amount</option>');
        expect(markup).toContain('value="3,000"');
        expect(markup).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
        expect(markup).toContain('<dt>Estate agent fee</dt><dd>£2,500</dd>');
        expect(markup).toContain('<dt>VAT on the agent fee</dt><dd>£500</dd>');
        expect(markup).toContain('<dt>Money left after the sale</dt><dd>£347,000</dd>');
    });

    it('says when the sale leaves a shortfall', () => {
        const markup = html(<SellingCostsCalculator defaultPrice={200_000} defaultMortgage={212_400} />);
        expect(markup).toContain('<dt>Money left after the sale</dt><dd>-£12,400</dd>');
        expect(markup).toContain(
            'class="pc-hint">The sale does not cover the costs and the mortgage: £12,400 would have to be found from elsewhere.</p>',
        );
    });

    it('leaves out the table when asked, and when there is nothing to list', () => {
        expect(html(<SellingCostsCalculator {...sale} showBreakdown={false} />)).not.toContain('class="pc-table"');
        const nothing = html(<SellingCostsCalculator defaultPrice={350_000} />);
        expect(nothing).toContain('<dt>Money left after the sale</dt><dd>£350,000</dd>');
        expect(nothing).not.toContain('class="pc-table"');
    });

    it('shows the form error instead of results', () => {
        const markup = html(<SellingCostsCalculator pdf />);
        expect(markup).toContain('class="pc-status" role="status" data-state="error">Enter the sale price.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('class="pc-download"');
        expect(html(<SellingCostsCalculator defaultPrice={350_000} defaultAgentFeePercent={150} />)).toContain(
            'Enter an agent fee from 0% to 100%.',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(<SellingCostsCalculator {...sale} />)).not.toContain('class="pc-download"');
        expect(html(<SellingCostsCalculator {...sale} pdf />)).toContain('Download PDF</button>');
        expect(html(<SellingCostsCalculator {...sale} pdf={{ label: 'Save' }} />)).toContain('Save</button>');
    });

    it('labels every control', () => {
        expectLabelled(<SellingCostsCalculator />, 9);
        expectLabelled(<SellingCostsCalculator defaultAgentFeeFixed={2_000} />, 9);
    });

    it('ships its styles unless unstyled, and passes other props to the root', () => {
        expect(html(<SellingCostsCalculator />)).toContain('--pc-accent');
        const bare = html(<SellingCostsCalculator unstyled id="sc" theme="dark" className="card" />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="sc" data-theme="dark" class="pc pc-selling-costs card">');
        expect(html(<SellingCostsCalculator />)).toContain('class="pc pc-styled pc-selling-costs"');
    });
});

describe('CapitalGainsCalculator', () => {
    const landlord = {
        defaultSalePrice: 300_000,
        defaultPurchasePrice: 180_000,
        defaultBuyingCosts: 4_000,
        defaultSellingCosts: 6_000,
        defaultImprovements: 10_000,
        defaultIncome: 40_000,
    };

    it('renders the tax and its working from its defaults', () => {
        const markup = html(<CapitalGainsCalculator {...landlord} />);
        expect(markup).toContain('value="300,000"');
        expect(markup).toContain('<option value="2026-27" selected="">2026 to 2027</option>');
        expect(markup).toContain('data-key="tax" data-lead="true"');
        expect(markup).toContain('<dt>Capital gains tax to pay</dt><dd>£22,663.80</dd>');
        expect(markup).toContain('<dt>Gain</dt><dd>£100,000</dd>');
        expect(markup).toContain('<dt>Tax-free allowance used</dt><dd>£3,000</dd>');
        expect(markup).toContain('<dt>Gain taxed at the lower rate</dt><dd>£10,270</dd>');
        expect(markup).toContain('<dt>Tax at the higher rate</dt><dd>£20,815.20</dd>');
        expect(markup).toContain('<dt>Tax as a share of the gain</dt><dd>22.66%</dd>');
        expect(markup).toContain('role="status" data-state="result">Capital gains tax to pay: £22,663.80</p>');
        expect(markup).toContain('Private residence relief and lettings relief are not modelled.');
        expect(markup).not.toContain('Report the sale to HMRC');
    });

    it('always shows the guide-only notice, with or without a result', () => {
        for (const markup of [html(<CapitalGainsCalculator {...landlord} />), html(<CapitalGainsCalculator />)]) {
            expect(markup).toContain('class="pc-hint">This is a guide only, not tax advice.');
        }
    });

    it('gives the date to report and pay by when a completion date is set', () => {
        const markup = html(<CapitalGainsCalculator {...landlord} defaultCompletionDate="2026-11-25" />);
        expect(markup).toMatch(/<input[^>]*type="date"[^>]*value="2026-11-25"/);
        expect(markup).toContain(
            'Report the sale to HMRC and pay the tax by 24 January 2027: 60 days after completion.',
        );
        expect(html(<CapitalGainsCalculator {...landlord} defaultCompletionDate="2021-01-01" />)).toContain(
            'data-state="error">Enter a completion date on or after 27 October 2021.</p>',
        );
    });

    it('scales to a share, takes a later tax year, and falls back from a bad one', () => {
        const half = html(<CapitalGainsCalculator {...landlord} defaultShare={50} defaultTaxYear="2027-28" />);
        expect(half).toContain('<dt>Gain</dt><dd>£50,000</dd>');
        expect(half).toContain('<option value="2027-28" selected="">2027 to 2028</option>');
        expect(half).toContain('The figures are for your 50% share of the property.');
        expect(html(<CapitalGainsCalculator {...landlord} defaultTaxYear={'1999-00' as never} />)).toContain(
            '<option value="2026-27" selected="">',
        );
    });

    it('shows a loss as a negative gain with no tax', () => {
        const markup = html(<CapitalGainsCalculator defaultSalePrice={200_000} defaultPurchasePrice={220_000} />);
        expect(markup).toContain('<dt>Capital gains tax to pay</dt><dd>£0</dd>');
        expect(markup).toContain('<dt>Gain</dt><dd>-£20,000</dd>');
        expect(markup).toContain('The sale made a loss');
    });

    it('shows the form error instead of results', () => {
        const markup = html(<CapitalGainsCalculator pdf />);
        expect(markup).toContain('class="pc-status" role="status" data-state="error">Enter the sale price.</p>');
        expect(markup).not.toContain('class="pc-rows"');
        expect(markup).not.toContain('class="pc-download"');
        expect(html(<CapitalGainsCalculator defaultSalePrice={300_000} />)).toContain('Enter the purchase price.');
        expect(html(<CapitalGainsCalculator {...landlord} defaultShare={0} />)).toContain('Enter the share you own');
        expect(html(<CapitalGainsCalculator {...landlord} defaultAllowanceUsed={5_000} />)).toContain(
            'from £0 to £3,000.',
        );
    });

    it('offers a PDF only when asked', () => {
        expect(html(<CapitalGainsCalculator {...landlord} />)).not.toContain('class="pc-download"');
        expect(html(<CapitalGainsCalculator {...landlord} pdf />)).toContain('Download PDF</button>');
        expect(html(<CapitalGainsCalculator {...landlord} pdf={{ label: 'Save' }} />)).toContain('Save</button>');
    });

    it('labels every control', () => {
        expectLabelled(<CapitalGainsCalculator />, 10);
    });

    it('ships its styles unless unstyled, and passes other props to the root', () => {
        expect(html(<CapitalGainsCalculator />)).toContain('--pc-accent');
        const bare = html(<CapitalGainsCalculator unstyled id="cgt" theme="auto" classNames={{ row: 'py-1' }} />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('<div id="cgt" data-theme="auto" class="pc pc-capital-gains">');
        expect(html(<CapitalGainsCalculator {...landlord} classNames={{ row: 'py-1' }} />)).toContain(
            'class="pc-row py-1"',
        );
    });
});
