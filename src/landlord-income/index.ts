/*
 * Landlord net income: what an individual landlord actually keeps from a let property in a year.
 * The buy-to-let check asks whether a lender will lend; this asks what is left after empty weeks,
 * the agent's fee and its VAT, running costs, mortgage interest and income tax.
 *
 *   rent collected  = a year's rent less the empty weeks
 *   expenses        = management fee + VAT + insurance, repairs, service charge, ground rent, other
 *   profit          = rent collected - expenses          (mortgage interest is not an expense)
 *   tax             = tax on (other income + profit) - tax on other income - finance cost credit
 *   net income      = profit - mortgage interest - tax
 *
 * The tax rules and their sources are in ./tax and ./rates. For England, Wales and Northern
 * Ireland; see `LANDLORD_INCOME_NOTICE` for what is left out. A guide only, not tax advice.
 */

export {
    calculateLandlordIncome,
    LANDLORD_COSTS,
    LANDLORD_INCOME_DEFAULTS,
    LANDLORD_INCOME_LIMITS,
    LANDLORD_VAT_RATE,
    type LandlordCostKey,
    type LandlordIncome,
    type LandlordIncomeInput,
    landlordIncomeInputError,
} from './calculate';
export {
    CURRENT_LANDLORD_TAX_YEAR,
    isLandlordTaxYear,
    LANDLORD_TAX_YEAR_OPTIONS,
    LANDLORD_TAX_YEARS,
    type LandlordTaxRates,
    type LandlordTaxYear,
    type LandlordTaxYearKey,
} from './rates';
export {
    getLandlordIncomeSummary,
    LANDLORD_INCOME_LABELS,
    LANDLORD_INCOME_NOTICE,
    type LandlordIncomeKey,
    type LandlordIncomeSummary,
} from './summary';
export {
    type FinanceCreditBasis,
    incomeTax,
    personalAllowance,
    propertyIncomeTax,
    type PropertyIncomeTax,
    type PropertyIncomeTaxInput,
} from './tax';
