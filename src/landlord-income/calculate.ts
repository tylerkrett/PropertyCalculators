import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds, formatPoundsAndPence } from '../stamp-duty/format';
import { CURRENT_LANDLORD_TAX_YEAR, isLandlordTaxYear, LANDLORD_TAX_YEARS, type LandlordTaxYearKey } from './rates';
import { type FinanceCreditBasis, propertyIncomeTax } from './tax';

/** The named yearly costs, in display order, with the label each one is shown under. */
export const LANDLORD_COSTS = [
    { key: 'insurance', label: 'Landlord insurance' },
    { key: 'maintenance', label: 'Repairs and maintenance' },
    { key: 'serviceCharge', label: 'Service charge' },
    { key: 'groundRent', label: 'Ground rent' },
    { key: 'otherCosts', label: 'Other allowable costs' },
] as const;

export type LandlordCostKey = (typeof LANDLORD_COSTS)[number]['key'];

/** VAT a letting agent adds to its fee, percent. https://www.gov.uk/vat-rates */
export const LANDLORD_VAT_RATE = 20;

/** What the calculator assumes until told otherwise. */
export const LANDLORD_INCOME_DEFAULTS = {
    rentPeriod: 'month',
    voidWeeks: 0,
    managementFeePercent: 0,
    feesIncludeVat: false,
    cost: 0,
    taxYear: CURRENT_LANDLORD_TAX_YEAR,
} as const satisfies { rentPeriod: RentPeriod; taxYear: LandlordTaxYearKey; [key: string]: unknown };

/** Bounds the form accepts. `amount` covers every yearly cost, the interest and the other income. */
export const LANDLORD_INCOME_LIMITS = {
    rent: { max: MAX_PRICE },
    voidWeeks: { min: 0, max: 52 },
    managementFeePercent: { min: 0, max: 100 },
    amount: { min: 0, max: MAX_PRICE },
} as const;

export interface LandlordIncomeInput extends Partial<Record<LandlordCostKey, number>> {
    /** The rent, in pounds per `rentPeriod`. */
    rent: number;
    /** Defaults to `"month"`. */
    rentPeriod?: RentPeriod;
    /** Weeks a year the property is expected to stand empty. Defaults to 0. */
    voidWeeks?: number;
    /** The letting agent's fee as a percentage of the rent collected. Defaults to 0. */
    managementFeePercent?: number;
    /** `true` when the percentage already includes VAT. Defaults to `false`: 20% VAT is added on top. */
    feesIncludeVat?: boolean;
    /** Mortgage interest and other finance costs for the year, in pounds. Defaults to 0. */
    mortgageInterest?: number;
    /** The landlord's other taxable income for the year before allowances, such as salary. Defaults to 0. */
    otherIncome?: number;
    /** Defaults to the current tax year, `"2026-27"`. */
    taxYear?: LandlordTaxYearKey;
}

/** Every step of the sum, in pounds for the year and kept to the penny, unless it says otherwise. */
export interface LandlordIncome {
    taxYear: LandlordTaxYearKey;
    /** A full year's rent with no empty weeks. */
    annualRent: number;
    voidLoss: number;
    /** A year's rent less the empty weeks. */
    rentCollected: number;
    /** The agent's fee before VAT. */
    managementFee: number;
    managementFeeVat: number;
    /** The fee with its VAT plus every named cost. */
    expenses: number;
    /** Rent collected less expenses: the taxable profit. Negative for a loss. */
    profitBeforeFinance: number;
    /** The mortgage interest entered. */
    financeCosts: number;
    /** The tax the profit adds to the landlord's bill, before the finance cost credit. */
    taxBeforeCredit: number;
    /** The credit for finance costs, at the basic rate. */
    financeCredit: number;
    /** Which limit set the credit; `null` without finance costs. */
    financeCreditBasis: FinanceCreditBasis | null;
    /** Income tax due on the property. */
    tax: number;
    /** What the landlord keeps: rent collected less expenses, mortgage interest and tax. */
    netIncome: number;
    netMonthly: number;
    /** Finance costs that earned no credit this year and are carried forward. */
    unusedFinanceCosts: number;
    /** Tax as a percentage of the profit before finance costs, to two decimals; 0 without a profit. */
    effectiveTaxRate: number;
    /** Plain-English remarks on this result: a loss, a limited credit, a reduced allowance. */
    notes: string[];
}

const pence = (value: number) => Math.round(value * 100) / 100;
const invalidAmount = (value: unknown) =>
    typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > LANDLORD_INCOME_LIMITS.amount.max;
const outside = (value: unknown, { min, max }: { min: number; max: number }) =>
    typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max;

/** `£1,500`, `£1,499.50`, `-£320`: pence only when there are some, the sign ahead of the pound. */
export function landlordPounds(value: number): string {
    const amount = Math.abs(value);
    const text = Number.isInteger(amount) ? formatPounds(amount) : formatPoundsAndPence(amount);
    return value < 0 ? `-${text}` : text;
}

/** The input with its defaults filled in. Only leaving a field out means the default: `null` does not. */
function resolve(input: LandlordIncomeInput) {
    const or = <T>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value);
    const defaults = LANDLORD_INCOME_DEFAULTS;
    return {
        period: RENT_PERIODS.find((option) => option.value === or(input.rentPeriod, defaults.rentPeriod)),
        voidWeeks: or(input.voidWeeks, defaults.voidWeeks),
        feePercent: or(input.managementFeePercent, defaults.managementFeePercent),
        feesIncludeVat: or(input.feesIncludeVat, defaults.feesIncludeVat),
        financeCosts: or(input.mortgageInterest, defaults.cost),
        otherIncome: or(input.otherIncome, defaults.cost),
        taxYear: or(input.taxYear, defaults.taxYear),
        costs: LANDLORD_COSTS.map(({ key, label }) => ({ key, label, value: or(input[key], defaults.cost) })),
    };
}

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function landlordIncomeInputError(input: LandlordIncomeInput): string | null {
    // Checked as untrusted: a form or plain JavaScript can pass anything here.
    if (typeof input !== 'object' || input === null) return 'Enter the rent.';
    const { rent } = input;
    const limits = LANDLORD_INCOME_LIMITS;
    const { period, voidWeeks, feePercent, feesIncludeVat, financeCosts, otherIncome, taxYear, costs } = resolve(input);
    if (typeof rent !== 'number' || !Number.isFinite(rent) || rent <= 0) return 'Enter the rent.';
    if (rent > limits.rent.max) return 'Enter a lower rent.';
    if (!period) return 'Choose whether the rent is weekly, monthly or yearly.';
    if (outside(voidWeeks, limits.voidWeeks)) return 'Empty weeks must be between 0 and 52.';
    if (outside(feePercent, limits.managementFeePercent)) return 'Enter a management fee between 0% and 100%.';
    if (typeof feesIncludeVat !== 'boolean') return 'Choose whether the management fee includes VAT.';
    if (invalidAmount(financeCosts)) return 'Enter the yearly mortgage interest, or leave it at 0.';
    for (const { label, value } of costs) {
        if (invalidAmount(value)) return `Enter the ${label.toLowerCase()}, or leave it at 0.`;
    }
    if (invalidAmount(otherIncome)) return 'Enter your other yearly income, or leave it at 0.';
    if (!isLandlordTaxYear(taxYear)) return 'Choose the tax year.';
    return null;
}

/** The maths alone; `null` for invalid input. Amounts are kept to the penny. */
export function calculateLandlordIncome(input: LandlordIncomeInput): LandlordIncome | null {
    return landlordIncomeInputError(input) ? null : landlordIncomeFor(input);
}

/** The result for an input `landlordIncomeInputError` has already passed. */
export function landlordIncomeFor(input: LandlordIncomeInput): LandlordIncome {
    const { period, voidWeeks, feePercent, feesIncludeVat, financeCosts, otherIncome, taxYear, costs } = resolve(input);
    const year = LANDLORD_TAX_YEARS[taxYear];
    const annualRent = pence(input.rent * (period?.perYear ?? RENT_PERIODS[1].perYear));
    // Empty weeks come off as 52nds of the year, as the rental yield calculator does it.
    const rentCollected = pence((annualRent * (52 - voidWeeks)) / 52);

    // The agent charges on rent collected. A fee quoted with VAT in it is split back out.
    const charged = (rentCollected * feePercent) / 100;
    const managementFee = pence(feesIncludeVat ? charged / (1 + LANDLORD_VAT_RATE / 100) : charged);
    const managementFeeVat = feesIncludeVat
        ? pence(charged - managementFee)
        : pence((charged * LANDLORD_VAT_RATE) / 100);
    const expenses = pence(costs.reduce((sum, cost) => sum + cost.value, managementFee + managementFeeVat));
    const profitBeforeFinance = pence(rentCollected - expenses);

    const taxed = propertyIncomeTax({ otherIncome, profit: profitBeforeFinance, financeCosts }, year);
    // The three tax rows are rounded first and subtracted after, so they add up as shown.
    const taxBeforeCredit = pence(taxed.taxBeforeCredit);
    const financeCredit = pence(taxed.financeCredit);
    const tax = pence(taxBeforeCredit - financeCredit);
    const netIncome = pence(profitBeforeFinance - financeCosts - tax);
    const unusedFinanceCosts = pence(taxed.unusedFinanceCosts);

    const notes: string[] = [];
    const carried = `${landlordPounds(unusedFinanceCosts)} of finance costs`;
    if (profitBeforeFinance < 0)
        notes.push(
            `The property makes a loss of ${landlordPounds(-profitBeforeFinance)} before finance costs, so there is no income tax on it. The loss is carried forward against later rental profits and cannot reduce the tax on other income.`,
        );
    if (unusedFinanceCosts > 0 && profitBeforeFinance <= 0)
        notes.push(`With no rental profit, the ${carried} earn no tax credit this year and are carried forward.`);
    else if (unusedFinanceCosts > 0 && taxed.financeCreditBasis === 'property-profits')
        notes.push(
            `The tax credit is limited to the rental profit of ${landlordPounds(profitBeforeFinance)}, so ${carried} earn no credit this year and are carried forward.`,
        );
    else if (unusedFinanceCosts > 0)
        notes.push(
            `The tax credit is limited to the ${landlordPounds(pence(taxed.relievedFinanceCosts))} of income above the personal allowance, so ${carried} earn no credit this year and are carried forward.`,
        );
    if (profitBeforeFinance > 0 && taxed.personalAllowance < year.personalAllowance)
        notes.push(
            `Total income is over ${landlordPounds(year.allowanceTaperThreshold)}, so the personal allowance is reduced to ${landlordPounds(pence(taxed.personalAllowance))}.`,
        );
    if (netIncome < 0)
        notes.push(`After mortgage interest and tax, the property costs ${landlordPounds(-netIncome)} a year to hold.`);
    if (!year.legislated) {
        const { basic, higher, additional } = year.propertyRates;
        notes.push(
            `The ${year.label} property rates of ${basic}%, ${higher}% and ${additional}% were announced at Budget 2026 and are not yet law. Finance Act 2026 set 22%, 42% and 47%.`,
        );
    }

    return {
        taxYear,
        annualRent,
        voidLoss: pence(annualRent - rentCollected),
        rentCollected,
        managementFee,
        managementFeeVat,
        expenses,
        profitBeforeFinance,
        financeCosts,
        taxBeforeCredit,
        financeCredit,
        financeCreditBasis: taxed.financeCreditBasis,
        tax,
        netIncome,
        netMonthly: pence(netIncome / 12),
        unusedFinanceCosts,
        effectiveTaxRate: profitBeforeFinance > 0 ? Math.round((tax / profitBeforeFinance) * 10_000) / 100 : 0,
        notes,
    };
}
