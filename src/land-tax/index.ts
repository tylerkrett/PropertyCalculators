/*
 * Property purchase tax anywhere in the UK through one call. England and Northern Ireland charge
 * Stamp Duty Land Tax (SDLT), Scotland charges Land and Buildings Transaction Tax (LBTT) and Wales
 * charges Land Transaction Tax (LTT). Give `calculatePropertyTax` a country and it picks the tax.
 * Sources: https://www.gov.uk/stamp-duty-land-tax, https://revenue.scot/taxes/land-buildings-transaction-tax
 * and https://www.gov.wales/land-transaction-tax-guide.
 */
import { calculateStampDuty } from '../stamp-duty/estimate';
import { calculateLbtt } from './lbtt';
import { calculateLtt } from './ltt';
import {
    assembleEstimate,
    type Country,
    DEFAULT_COUNTRY,
    isCountry,
    type PropertyTaxEstimate,
    type PropertyTaxInput,
} from './shared';

export * from './lbtt';
export * from './ltt';
export {
    ADDITIONAL_PROPERTY_THRESHOLD,
    COUNTRIES,
    type Country,
    DEFAULT_COUNTRY,
    isCountry,
    PROPERTY_TAX_NAMES,
    type PropertyTaxEstimate,
    type PropertyTaxInput,
    type PropertyTaxName,
    type PropertyTaxSupplement,
    SIX_OR_MORE_DWELLINGS,
} from './shared';

export interface CountryPropertyTaxInput extends PropertyTaxInput {
    /** Where the property is. Defaults to `"england"`. */
    country?: Country;
}

/** SDLT from the existing stamp duty calculator, in the shape shared by all three taxes. */
function calculateSdlt(country: Country, input: PropertyTaxInput): PropertyTaxEstimate {
    const { price, buyer, nonUkResident, propertyType, stampDuty, bands } = calculateStampDuty(input);
    const meta = { country, tax: 'SDLT', price, buyer, nonUkResident, propertyType } as const;
    return assembleEstimate(meta, { tax: stampDuty, bands });
}

/**
 * The property purchase tax for a country: SDLT in England and Northern Ireland, LBTT in Scotland,
 * LTT in Wales. Throws a `RangeError` on an unknown country or any other invalid input.
 */
export function calculatePropertyTax(input: CountryPropertyTaxInput): PropertyTaxEstimate {
    const { country = DEFAULT_COUNTRY, ...purchase } = input;
    if (!isCountry(country)) throw new RangeError(`Invalid country: ${String(country)}`);

    if (country === 'scotland') return calculateLbtt(purchase);
    if (country === 'wales') return calculateLtt(purchase);
    return calculateSdlt(country, purchase);
}
