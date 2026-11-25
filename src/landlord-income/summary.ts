import { formatRate } from '../stamp-duty/format';
import {
    type LandlordIncome,
    landlordIncomeFor,
    type LandlordIncomeInput,
    landlordIncomeInputError,
    landlordPounds,
} from './calculate';

/** Row labels, in display order: what the landlord keeps leads, then how it was reached. */
export const LANDLORD_INCOME_LABELS = {
    netIncome: 'Net income per year',
    netMonthly: 'Net income per month',
    rentCollected: 'Rent collected',
    voidLoss: 'Rent lost to empty weeks',
    managementFee: 'Management fee',
    managementFeeVat: 'VAT on the management fee',
    expenses: 'Allowable expenses',
    profitBeforeFinance: 'Profit before finance costs',
    financeCosts: 'Mortgage interest',
    taxBeforeCredit: 'Income tax before the finance cost credit',
    financeCredit: 'Finance cost tax credit',
    tax: 'Income tax on the property',
    unusedFinanceCosts: 'Finance costs carried forward',
    effectiveTaxRate: 'Tax as a share of profit',
} as const;

/** What the estimate leaves out, and what it is not. Show it wherever the result is shown. */
export const LANDLORD_INCOME_NOTICE =
    'For an individual landlord of residential property taxed in England, Wales or Northern Ireland, with other income that is not savings or dividends. It leaves out Scottish income tax rates, the £1,000 property allowance, companies, furnished holiday lets, National Insurance and splits between joint owners. A guide only, not tax advice.';

export type LandlordIncomeKey = keyof typeof LANDLORD_INCOME_LABELS;

export interface LandlordIncomeSummary extends LandlordIncome {
    /** Each figure as text: pounds with pence only when there are some, a loss as `-£320`. */
    formatted: Record<LandlordIncomeKey, string>;
    /** The same figures as labelled rows, in display order: net income leads. */
    rows: { key: LandlordIncomeKey; label: string; value: number; formatted: string }[];
}

/**
 * A landlord's net income with every figure and its display string. Either the summary or the
 * reason the input can't be calculated, never both.
 */
export function getLandlordIncomeSummary(
    input: LandlordIncomeInput,
): { summary: LandlordIncomeSummary; error: null } | { summary: null; error: string } {
    const error = landlordIncomeInputError(input);
    if (error) return { summary: null, error };
    const result = landlordIncomeFor(input);

    const keys = Object.keys(LANDLORD_INCOME_LABELS) as LandlordIncomeKey[];
    const text = (key: LandlordIncomeKey) =>
        key === 'effectiveTaxRate' ? formatRate(result[key]) : landlordPounds(result[key]);
    const formatted = Object.fromEntries(keys.map((key) => [key, text(key)])) as Record<LandlordIncomeKey, string>;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: LANDLORD_INCOME_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
