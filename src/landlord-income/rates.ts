/*
 * Income tax figures for an individual landlord in England, Wales or Northern Ireland, by tax year.
 * Checked against GOV.UK on 25 November 2026.
 *
 * 2026 to 2027: rental profit is taxed at the main rates, and finance costs are relieved at the
 * basic rate of 20%.
 *  - https://www.gov.uk/income-tax-rates (allowance, bands, rates, the taper above £100,000)
 *  - https://www.gov.uk/guidance/changes-to-tax-relief-for-residential-landlords-how-its-worked-out-including-case-studies
 *
 * 2027 to 2028: property income gets its own rates and is taxed after other income, with the
 * personal allowance set against other income first. Finance Act 2026 (sections 6 to 8, Schedules
 * 1 and 2) made that law and set the rates at 22%, 42% and 47%. Budget 2026 (28 October 2026)
 * then announced a further two points, to 24%, 44% and 49%, to be legislated in Finance Bill
 * 2026-27. The table carries the announced rates, which are government policy and what HMRC
 * publishes for the year, and marks them `legislated: false` until that Bill is an Act. Relief
 * for finance costs is given at the property basic rate.
 *  - https://www.legislation.gov.uk/ukpga/2026/11/section/7 (the enacted 22%, 42%, 47%)
 *  - https://www.gov.uk/government/publications/changes-to-tax-rates-for-property-savings-and-dividend-income/change-to-tax-rates-for-property-savings-and-dividend-income-technical-note
 *    (the ordering of income, and relief "at the property basic rate")
 *  - https://www.gov.uk/government/publications/income-tax-changes-to-tax-rates-for-property-and-savings-income/income-tax-changes-to-tax-rates-for-property-and-savings-income
 *    (Budget 2026: 24%, 44%, 49% from the 2027 to 2028 tax year)
 *  - https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar/annex-a-rates-and-allowances
 *    (allowance and thresholds unchanged for 2027 to 2028)
 */

/** Basic, higher and additional rate, percent. */
export interface LandlordTaxRates {
    basic: number;
    higher: number;
    additional: number;
}

export interface LandlordTaxYear {
    /** As GOV.UK writes it: `"2026 to 2027"`. */
    label: string;
    /** Income taxed at 0%. */
    personalAllowance: number;
    /** The allowance falls by £1 for every £2 of income above this, reaching nothing at £125,140. */
    allowanceTaperThreshold: number;
    /** Taxable income (after the allowance) charged at the basic rate. */
    basicRateBand: number;
    /** Taxable income above this is charged at the additional rate. */
    additionalRateThreshold: number;
    /** Rates on other income such as salary, pension and trading profit. */
    mainRates: LandlordTaxRates;
    /** Rates on rental profit: the main rates until 6 April 2027, separate rates after. */
    propertyRates: LandlordTaxRates;
    /** The rate of the tax credit for residential finance costs, percent. */
    financeCreditRate: number;
    /** `false` while the rates are announced government policy that Parliament has yet to pass. */
    legislated: boolean;
}

const MAIN_RATES = { basic: 20, higher: 40, additional: 45 } as const;
const THRESHOLDS = {
    personalAllowance: 12_570,
    allowanceTaperThreshold: 100_000,
    // £50,270 of income less the £12,570 allowance.
    basicRateBand: 37_700,
    additionalRateThreshold: 125_140,
} as const;

/** The tax years this calculator knows, oldest first. */
export const LANDLORD_TAX_YEARS = {
    '2026-27': {
        label: '2026 to 2027',
        ...THRESHOLDS,
        mainRates: MAIN_RATES,
        propertyRates: MAIN_RATES,
        financeCreditRate: 20,
        legislated: true,
    },
    '2027-28': {
        label: '2027 to 2028',
        ...THRESHOLDS,
        mainRates: MAIN_RATES,
        propertyRates: { basic: 24, higher: 44, additional: 49 },
        financeCreditRate: 24,
        legislated: false,
    },
} as const satisfies Record<string, LandlordTaxYear>;

export type LandlordTaxYearKey = keyof typeof LANDLORD_TAX_YEARS;

/** The tax year in force when this table was last checked (6 April 2026 to 5 April 2027). */
export const CURRENT_LANDLORD_TAX_YEAR = '2026-27' satisfies LandlordTaxYearKey;

/** The tax years as `{ value, label }` options for a dropdown. */
export const LANDLORD_TAX_YEAR_OPTIONS = (Object.keys(LANDLORD_TAX_YEARS) as LandlordTaxYearKey[]).map((value) => ({
    value,
    label: LANDLORD_TAX_YEARS[value].label,
}));

/** Whether a value names a tax year in the table. Safe for any value, including `"constructor"`. */
export const isLandlordTaxYear = (value: unknown): value is LandlordTaxYearKey =>
    LANDLORD_TAX_YEAR_OPTIONS.some((option) => option.value === value);
