import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CompanyStampDutyCalculator } from '../src/react/CompanyStampDutyCalculator';
import { PropertyTaxCalculator } from '../src/react/PropertyTaxCalculator';

const html = renderToStaticMarkup;
const item = (label: string, value: string) => `<dt>${label}</dt><dd>${value}</dd>`;

/** Every input and select has an id that a label points at, or sits inside its label. */
function expectLabelled(markup: string) {
    const controls = [...markup.matchAll(/<(?:input|select)\b[^>]*>/g)].map((match) => match[0]);
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
        const id = /\bid="([^"]+)"/.exec(control)?.[1];
        expect(id, control).toBeTruthy();
        expect(markup).toContain(`for="${id}"`);
    }
    return controls.length;
}

describe('PropertyTaxCalculator', () => {
    it('renders SDLT for England and Northern Ireland from its defaults', () => {
        const england = html(<PropertyTaxCalculator defaultPrice={300_000} />);
        expect(england).toContain('class="pc pc-styled pc-property-tax"');
        expect(england).toContain('value="300,000"');
        expect(england).toContain(item('SDLT to pay', '£5,000'));
        expect(england).toContain(item('Actual rate', '1.67%'));
        expect(england).toContain('Stamp Duty Land Tax: how this result was calculated');

        const northernIreland = html(
            <PropertyTaxCalculator
                defaultCountry="northern-ireland"
                defaultPrice={300_000}
                defaultBuyer="additional-property"
            />,
        );
        expect(northernIreland).toContain('<option value="northern-ireland" selected="">Northern Ireland</option>');
        expect(northernIreland).toContain(item('SDLT to pay', '£20,000'));
    });

    it('renders LBTT for Scotland with the supplement as its own line, and its note', () => {
        const markup = html(
            <PropertyTaxCalculator
                defaultCountry="scotland"
                defaultPrice={300_000}
                defaultBuyer="additional-property"
            />,
        );
        expect(markup).toContain(item('LBTT to pay', '£28,600'));
        expect(markup).toContain(item('LBTT from the bands', '£4,600'));
        expect(markup).toContain(item('Additional Dwelling Supplement (8%)', '£24,000'));
        expect(markup).toContain(item('Actual rate', '9.53%'));
        expect(markup).toContain('£145,001 – £250,000');
        expect(markup).toContain(
            '<p class="pc-hint" role="status">The Additional Dwelling Supplement is 8% of the whole price, on top of the tax from the bands.</p>',
        );
        expect(html(<PropertyTaxCalculator defaultCountry="scotland" defaultPrice={300_000} />)).not.toContain(
            'data-key="supplement"',
        );
    });

    it('renders LTT for Wales, and says first-time buyers get no relief there', () => {
        const markup = html(
            <PropertyTaxCalculator defaultCountry="wales" defaultPrice={300_000} defaultBuyer="first-time-buyer" />,
        );
        expect(markup).toContain(item('LTT to pay', '£4,500'));
        expect(markup).toContain('Land Transaction Tax: how this result was calculated');
        expect(markup).toContain('Wales has no first-time buyer relief, so the main residential rates apply.');
    });

    it('offers the non-UK resident box only where it changes the tax', () => {
        const box = 'Purchaser is a non-UK resident';
        expect(html(<PropertyTaxCalculator defaultCountry="england" />)).toContain(box);
        expect(html(<PropertyTaxCalculator defaultCountry="northern-ireland" />)).toContain(box);
        expect(html(<PropertyTaxCalculator defaultCountry="scotland" />)).not.toContain(box);
        expect(html(<PropertyTaxCalculator defaultCountry="wales" />)).not.toContain(box);

        // Ticked by default: 2 points more in England, ignored (with no note about it) in Scotland.
        expect(html(<PropertyTaxCalculator defaultPrice={300_000} defaultNonUkResident />)).toContain(
            item('SDLT to pay', '£11,000'),
        );
        const scotland = html(
            <PropertyTaxCalculator defaultCountry="scotland" defaultPrice={300_000} defaultNonUkResident />,
        );
        expect(scotland).toContain(item('LBTT to pay', '£4,600'));
        expect(scotland).not.toContain('non-UK resident');
    });

    it('honours the property type and the breakdown switch', () => {
        const markup = html(
            <PropertyTaxCalculator
                defaultPrice={300_000}
                defaultPropertyType="non-residential"
                showBreakdown={false}
            />,
        );
        expect(markup).toContain(item('SDLT to pay', '£4,500'));
        expect(markup).not.toContain('<table');
    });

    it('offers a PDF only when asked and only with a result', () => {
        expect(html(<PropertyTaxCalculator defaultPrice={300_000} />)).not.toContain('class="pc-download"');
        expect(html(<PropertyTaxCalculator defaultPrice={300_000} pdf />)).toContain('Download PDF</button>');
        expect(html(<PropertyTaxCalculator defaultPrice={300_000} pdf={{ label: 'Save as PDF' }} />)).toContain(
            'Save as PDF</button>',
        );
        expect(html(<PropertyTaxCalculator pdf />)).not.toContain('class="pc-download"');
    });

    it('asks for a price when there is none, or a lower one when it is too high', () => {
        const markup = html(<PropertyTaxCalculator />);
        expect(markup).toContain('<p class="pc-hint" role="status">Enter a price to see the tax to pay.</p>');
        expect(markup).not.toContain('<dl');
        expect(html(<PropertyTaxCalculator defaultPrice={2_000_000_000} />)).toContain('Enter a lower price.');
    });

    it('labels every control, passes props to the root and can drop its styles', () => {
        expect(expectLabelled(html(<PropertyTaxCalculator />))).toBe(5);
        expect(expectLabelled(html(<PropertyTaxCalculator defaultCountry="wales" />))).toBe(4);
        const markup = html(<PropertyTaxCalculator id="tax" theme="dark" className="mine" defaultPrice={300_000} />);
        expect(markup).toContain('<style');
        expect(markup).toContain('id="tax" data-theme="dark" class="pc pc-styled pc-property-tax mine"');
        const bare = html(<PropertyTaxCalculator defaultPrice={300_000} unstyled />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('class="pc pc-property-tax"');
    });
});

describe('CompanyStampDutyCalculator', () => {
    it('renders the flat rate from its defaults, with the reason', () => {
        const markup = html(<CompanyStampDutyCalculator defaultPrice={750_000} />);
        expect(markup).toContain('class="pc pc-styled pc-company-stamp-duty"');
        expect(markup).toContain(item('Stamp Duty to pay', '£127,500'));
        expect(markup).toContain(item('Actual rate', '17%'));
        expect(markup).toContain('<td data-align="left">£0+</td><td data-align="right">17%</td>');
        expect(markup).toContain('A company buying a dwelling for more than £500,000 pays a flat 17%');
        expect(markup.indexOf('<option value="" selected="">No relief</option>')).toBeGreaterThan(0);
        expect(markup.indexOf('No relief')).toBeLessThan(markup.indexOf('Used in a property rental business'));
    });

    it('honours a relief, residency and the breakdown switch', () => {
        const relieved = html(
            <CompanyStampDutyCalculator defaultPrice={750_000} defaultRelief="property-rental-business" />,
        );
        expect(relieved).toContain('<option value="property-rental-business" selected="">');
        expect(relieved).toContain(item('Stamp Duty to pay', '£65,000'));
        expect(relieved).toContain('The flat 17% rate does not apply because a relief is claimed');

        const abroad = html(
            <CompanyStampDutyCalculator defaultPrice={750_000} defaultNonUkResident showBreakdown={false} />,
        );
        expect(abroad).toContain(item('Stamp Duty to pay', '£142,500'));
        expect(abroad).toContain('making the flat rate 19%');
        expect(abroad).not.toContain('<table');
    });

    it('offers a PDF only when asked, and asks for a price when there is none', () => {
        expect(html(<CompanyStampDutyCalculator defaultPrice={750_000} />)).not.toContain('class="pc-download"');
        expect(html(<CompanyStampDutyCalculator defaultPrice={750_000} pdf />)).toContain('Download PDF</button>');
        const empty = html(<CompanyStampDutyCalculator pdf />);
        expect(empty).toContain('Enter a price to see the stamp duty.');
        expect(empty).not.toContain('class="pc-download"');
    });

    it('labels every control and can drop its styles', () => {
        expect(expectLabelled(html(<CompanyStampDutyCalculator />))).toBe(3);
        expect(html(<CompanyStampDutyCalculator />)).toContain('<style');
        expect(html(<CompanyStampDutyCalculator unstyled />)).not.toContain('<style');
    });
});
