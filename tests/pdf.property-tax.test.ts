import { describe, expect, it } from 'vitest';

import { calculatePropertyTax } from '../src/land-tax/index';
import {
    companyStampDutyPdf,
    companyStampDutyReport,
    propertyTaxPdf,
    propertyTaxReport,
} from '../src/pdf/reports/property-tax';
import { calculateCompanyStampDuty } from '../src/stamp-duty/company';

const DATE = new Date(2026, 10, 18);
/** The PDF as text: strings are printed as `(…)`, with `£` as `\243` and brackets escaped. */
const text = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);
const labels = (report: { facts: { label: string }[] }) => report.facts.map((fact) => fact.label);

describe('propertyTaxPdf', () => {
    const scotland = calculatePropertyTax({ country: 'scotland', price: 300_000, buyer: 'additional-property' });

    it('prints LBTT with the supplement, the bands and the note', async () => {
        const pdf = await propertyTaxPdf(scotland, { date: DATE, subtitle: '1 High Street' });
        const body = text(pdf);
        expect(body.startsWith('%PDF')).toBe(true);
        expect(body.endsWith('%%EOF\n')).toBe(true);
        expect(body).toContain('(Land and Buildings Transaction Tax estimate)');
        expect(body).toContain('(1 High Street)');
        expect(body).toContain('(18 November 2026)');
        expect(body).toContain('(LBTT to pay)');
        expect(body).toContain('(\\24328,600)');
        expect(body).toContain('(Scotland)');
        expect(body).toContain('(\\243300,000)');
        expect(body).toContain('(Additional property)');
        expect(body).toContain('(9.53%)');
        expect(body).toContain('(Additional Dwelling Supplement \\(8%\\))');
        expect(body).toContain('(\\24324,000)');
        expect(body).toContain('(\\243328,600)');
        for (const band of scotland.bands) expect(body).toContain(band.formatted.tax.replace('£', '\\243'));
        expect(body).toContain('(The Additional Dwelling Supplement is 8% of the whole price');
    });

    it('describes each country in its own terms', () => {
        const report = propertyTaxReport(scotland);
        expect(report.headline).toEqual({ label: 'LBTT to pay', value: '£28,600' });
        expect(report.facts).toContainEqual({ label: 'LBTT from the bands', value: '£4,600' });
        expect(labels(report)).not.toContain('Residence');
        expect(report.tables?.[0]?.totals).toEqual(['Total', '', '£300,000', '£4,600']);
        expect(report.tables?.[0]?.muted).toEqual([3, 4]);

        const england = propertyTaxReport(calculatePropertyTax({ price: 300_000, nonUkResident: true }));
        expect(england.title).toBe('Stamp Duty Land Tax estimate');
        expect(england.headline).toEqual({ label: 'SDLT to pay', value: '£11,000' });
        expect(england.facts).toContainEqual({ label: 'Country', value: 'England' });
        expect(england.facts).toContainEqual({ label: 'Residence', value: 'Not UK resident' });
        expect(labels(england)).not.toContain('SDLT from the bands');

        const wales = propertyTaxReport(
            calculatePropertyTax({ country: 'wales', price: 300_000, propertyType: 'non-residential' }),
        );
        expect(wales.title).toBe('Land Transaction Tax estimate');
        expect(wales.facts).toContainEqual({ label: 'Property type', value: 'Non-residential or mixed use' });
        expect(labels(wales)).not.toContain('Buyer');
    });
});

describe('companyStampDutyPdf', () => {
    it('prints the flat rate with its reasons', async () => {
        const result = calculateCompanyStampDuty({ price: 750_000, nonUkResident: true });
        const body = text(await companyStampDutyPdf(result, { date: DATE, name: 'Acme' }));
        expect(body.startsWith('%PDF')).toBe(true);
        expect(body).toContain('/Author (Acme)');
        expect(body).toContain('(Company stamp duty estimate)');
        expect(body).toContain('(Stamp duty to pay)');
        expect(body).toContain('(\\243142,500)');
        expect(body).toContain('(\\243750,000)');
        expect(body).toContain('(None applied)');
        expect(body).toContain('(Not UK resident)');
        expect(body).toContain('(19%)');
        expect(body).toContain('making the flat rate 19%.)');
    });

    it('names the relief that switched the flat rate off', () => {
        const report = companyStampDutyReport(
            calculateCompanyStampDuty({ price: 750_000, relief: 'property-rental-business' }),
        );
        expect(report.headline).toEqual({ label: 'Stamp duty to pay', value: '£65,000' });
        expect(report.facts).toContainEqual({ label: 'Relief', value: 'Used in a property rental business' });
        expect(report.facts).toContainEqual({ label: 'Effective rate', value: '8.67%' });
        expect(report.tables?.[0]?.rows).toHaveLength(5);
        expect(report.notes?.[0]).toContain('does not apply because a relief is claimed');
    });
});
