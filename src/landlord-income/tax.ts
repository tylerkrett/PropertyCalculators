import type { LandlordTaxRates, LandlordTaxYear } from './rates';

/*
 * The income tax an individual landlord pays on rental profit, on top of their other income.
 *
 * Other income (salary, pension, trading profit) uses the personal allowance and the lower bands
 * first; rental profit sits above it. So the tax on the property is the tax on everything less the
 * tax on the other income alone, which also catches the allowance lost when the rent takes total
 * income over £100,000. Until 6 April 2027 both are charged at the same rates; from then rental
 * profit has rates of its own (see ./rates).
 *
 * Mortgage interest is not an expense. Under ITTOIA 2005 sections 272A to 274AA ("section 24")
 * it earns a tax credit instead, at the basic rate, on the lowest of:
 *  (a) the finance costs,
 *  (b) the property profits, and
 *  (c) adjusted total income: income above the personal allowance, leaving out savings and dividends.
 * Finance costs above that amount earn nothing this year and are carried forward.
 * https://www.gov.uk/guidance/changes-to-tax-relief-for-residential-landlords-how-its-worked-out-including-case-studies
 *
 * `otherIncome` is treated as non-savings, non-dividend income. Amounts are unrounded pounds.
 */

/** Which of the three limits set the amount of finance costs relieved. */
export type FinanceCreditBasis = 'finance-costs' | 'property-profits' | 'adjusted-total-income';

export interface PropertyIncomeTaxInput {
    /** Other taxable income for the year before allowances, in pounds. */
    otherIncome: number;
    /** Rental profit before finance costs, in pounds. A loss is taxed as no profit. */
    profit: number;
    /** Mortgage interest and other residential finance costs for the year, in pounds. */
    financeCosts: number;
}

export interface PropertyIncomeTax {
    /** The personal allowance left after the taper above £100,000. */
    personalAllowance: number;
    /** Tax on the rental profit before the finance cost credit. */
    taxBeforeCredit: number;
    /** The finance costs that earn a credit: the lowest of the three limits. */
    relievedFinanceCosts: number;
    /** The limit that set `relievedFinanceCosts`; `null` when there are no finance costs. */
    financeCreditBasis: FinanceCreditBasis | null;
    /** The credit: `relievedFinanceCosts` at the basic rate, never more than `taxBeforeCredit`. */
    financeCredit: number;
    /** Tax on the rental profit after the credit. */
    tax: number;
    /** Finance costs that earned no credit this year, carried forward to later years. */
    unusedFinanceCosts: number;
}

/** The personal allowance for a total income: reduced by £1 for every £2 above the taper threshold. */
export function personalAllowance(totalIncome: number, year: LandlordTaxYear): number {
    const excess = Math.max(0, totalIncome - year.allowanceTaperThreshold);
    return Math.max(0, year.personalAllowance - excess / 2);
}

/** Tax on the slice of taxable income from `from` to `to`, at the rate of each band it crosses. */
function taxOnSlice(from: number, to: number, rates: LandlordTaxRates, year: LandlordTaxYear): number {
    const bands = [
        { start: 0, end: year.basicRateBand, rate: rates.basic },
        { start: year.basicRateBand, end: year.additionalRateThreshold, rate: rates.higher },
        { start: year.additionalRateThreshold, end: Infinity, rate: rates.additional },
    ];
    return bands.reduce((tax, { start, end, rate }) => {
        const taxable = Math.max(0, Math.min(to, end) - Math.max(from, start));
        return tax + (taxable * rate) / 100;
    }, 0);
}

/**
 * Income tax on other income plus rental profit. The allowance goes against other income first and
 * what is left against the profit; the profit then fills the bands above the other income.
 */
export function incomeTax(otherIncome: number, profit: number, year: LandlordTaxYear): number {
    const allowance = personalAllowance(otherIncome + profit, year);
    const otherTaxable = Math.max(0, otherIncome - allowance);
    const profitTaxable = Math.max(0, profit - Math.max(0, allowance - otherIncome));
    return (
        taxOnSlice(0, otherTaxable, year.mainRates, year) +
        taxOnSlice(otherTaxable, otherTaxable + profitTaxable, year.propertyRates, year)
    );
}

/** The tax a rental profit adds to a landlord's bill, and the credit their finance costs earn. */
export function propertyIncomeTax(input: PropertyIncomeTaxInput, year: LandlordTaxYear): PropertyIncomeTax {
    const { otherIncome, financeCosts } = input;
    // A rental loss can't be set against other income; it is carried forward instead.
    const profit = Math.max(0, input.profit);
    const allowance = personalAllowance(otherIncome + profit, year);
    const taxBeforeCredit = incomeTax(otherIncome, profit, year) - incomeTax(otherIncome, 0, year);

    const limits: { basis: FinanceCreditBasis; amount: number }[] = [
        { basis: 'finance-costs', amount: financeCosts },
        { basis: 'property-profits', amount: profit },
        { basis: 'adjusted-total-income', amount: Math.max(0, otherIncome + profit - allowance) },
    ];
    // The first of the lowest wins, so costs relieved in full are always "finance-costs".
    const lowest = limits.reduce((least, limit) => (limit.amount < least.amount ? limit : least));
    // The credit can't turn the property's tax into a refund.
    const financeCredit = Math.min((lowest.amount * year.financeCreditRate) / 100, taxBeforeCredit);

    return {
        personalAllowance: allowance,
        taxBeforeCredit,
        relievedFinanceCosts: lowest.amount,
        financeCreditBasis: financeCosts > 0 ? lowest.basis : null,
        financeCredit,
        tax: taxBeforeCredit - financeCredit,
        unusedFinanceCosts: financeCosts - lowest.amount,
    };
}
