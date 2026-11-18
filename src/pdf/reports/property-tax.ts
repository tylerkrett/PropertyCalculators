import { COUNTRIES, PROPERTY_TAX_NAMES, type PropertyTaxEstimate } from '../../land-tax/shared';
import { COMPANY_RELIEFS, type CompanyStampDuty } from '../../stamp-duty/company';
import { BUYER_TYPES, PROPERTY_TYPES, type StampDutyBand } from '../../stamp-duty/estimate';
import { formatPounds } from '../../stamp-duty/format';
import { STAMP_DUTY_COLUMNS, STAMP_DUTY_LABELS } from '../../stamp-duty/labels';
import { createPdf, type PdfOptions } from '../create';
import type { PdfReport, PdfTable } from '../layout';

/*
 * Reports for the property purchase tax of any UK country (SDLT, LBTT or LTT) and for stamp duty
 * on a purchase by a company. Both print the inputs, the band-by-band working and the notes.
 */

const labelOf = (options: readonly { value: string; label: string }[], value: string) =>
    options.find((option) => option.value === value)?.label ?? value;
const residence = (nonUkResident: boolean) => (nonUkResident ? 'Not UK resident' : 'UK resident');

/** The band-by-band working as a table; bands the price never reaches are muted. */
function bandTable(bands: readonly StampDutyBand[], price: string, tax: string): PdfTable {
    return {
        title: STAMP_DUTY_LABELS.breakdown,
        columns: STAMP_DUTY_COLUMNS.map((column) => column.label),
        rows: bands.map((band) => STAMP_DUTY_COLUMNS.map((column) => band.formatted[column.key])),
        totals: ['Total', '', price, tax],
        muted: bands.flatMap((band, index) => (band.taxable > 0 ? [] : [index])),
    };
}

/** What the property tax calculator shows, as a report: SDLT, LBTT or LTT, whichever the country charges. */
export function propertyTaxReport(estimate: PropertyTaxEstimate): PdfReport {
    const { tax, supplement, formatted } = estimate;
    const residential = estimate.propertyType === 'residential';
    // Only SDLT has a surcharge for non-UK residents, and only at residential rates.
    const showResidence = tax === 'SDLT' && residential;
    return {
        title: `${PROPERTY_TAX_NAMES[tax]} estimate`,
        headline: { label: `${tax} to pay`, value: formatted.total },
        facts: [
            { label: 'Country', value: labelOf(COUNTRIES, estimate.country) },
            { label: 'Property price', value: formatted.price },
            { label: 'Property type', value: labelOf(PROPERTY_TYPES, estimate.propertyType) },
            ...(residential ? [{ label: 'Buyer', value: labelOf(BUYER_TYPES, estimate.buyer) }] : []),
            ...(showResidence ? [{ label: 'Residence', value: residence(estimate.nonUkResident) }] : []),
            ...(supplement
                ? [
                      { label: `${tax} from the bands`, value: formatted.bandTax },
                      {
                          label: `${supplement.label} (${supplement.formatted.rate})`,
                          value: supplement.formatted.amount,
                      },
                  ]
                : []),
            { label: 'Effective rate', value: formatted.effectiveRate },
            { label: `Price plus ${tax}`, value: formatPounds(estimate.price + estimate.total) },
        ],
        tables: [bandTable(estimate.bands, formatted.price, formatted.bandTax)],
        notes: estimate.notes,
    };
}

/** What the company stamp duty calculator shows, as a report. */
export function companyStampDutyReport(result: CompanyStampDuty): PdfReport {
    const { applied, formatted } = result;
    return {
        title: 'Company stamp duty estimate',
        headline: { label: 'Stamp duty to pay', value: formatted.stampDuty },
        facts: [
            { label: 'Property price', value: formatted.price },
            { label: 'Property type', value: labelOf(PROPERTY_TYPES, result.propertyType) },
            { label: 'Relief', value: applied.relief ? labelOf(COMPANY_RELIEFS, applied.relief) : 'None applied' },
            { label: 'Residence', value: residence(result.nonUkResident) },
            { label: 'Effective rate', value: formatted.effectiveRate },
            { label: 'Price plus stamp duty', value: formatPounds(result.price + result.stampDuty) },
        ],
        tables: [bandTable(result.bands, formatted.price, formatted.stampDuty)],
        notes: result.notes,
    };
}

/** A property tax estimate (SDLT, LBTT or LTT) as a PDF, in your brand. */
export const propertyTaxPdf = (estimate: PropertyTaxEstimate, options?: PdfOptions) =>
    createPdf(propertyTaxReport(estimate), options);

/** A company stamp duty calculation as a PDF, in your brand. */
export const companyStampDutyPdf = (result: CompanyStampDuty, options?: PdfOptions) =>
    createPdf(companyStampDutyReport(result), options);
