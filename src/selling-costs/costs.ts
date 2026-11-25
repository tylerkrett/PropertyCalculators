import { MAX_PRICE } from '../stamp-duty/estimate';

/*
 * The cost of selling: what the seller walks away with. From the sale price it takes the estate
 * agent's fee (a percentage of the price or a fixed sum, with VAT), the fees you enter (legal
 * fees, EPC, removals and anything else), then the mortgage and any early repayment charge.
 * Every fee defaults to 0 because quotes vary too much to guess. An illustration only: it leaves
 * out any tax on the sale (see the capital gains calculator) and the cost of the next purchase.
 */

/** The standard rate of VAT, in percent, which estate agents charge on their fee (https://www.gov.uk/vat-rates). */
export const VAT_RATE = 20;

/** The optional fees, in display order, with the label each one is shown under. */
export const SELLING_COST_FEES = [
    { key: 'legalFees', label: 'Legal fees' },
    { key: 'epc', label: 'Energy performance certificate' },
    { key: 'removals', label: 'Removals' },
] as const;

export type SellingCostFeeKey = (typeof SELLING_COST_FEES)[number]['key'];

/** A cost of your own, such as `{ label: 'Staging', amount: 800 }`. */
export interface SellingCostExtra {
    /** Shown as `"Other cost"` when left out or blank. */
    label?: string;
    /** Pounds, 0 or more. */
    amount: number;
}

export const SELLING_COSTS_DEFAULTS = {
    mortgage: 0,
    earlyRepaymentCharge: 0,
    agentFee: 0,
    agentFeeIncludesVat: false,
    fee: 0,
} as const;

/** Bounds the form accepts. */
export const SELLING_COSTS_LIMITS = {
    price: { min: 1, max: MAX_PRICE },
    fee: { min: 0, max: MAX_PRICE },
    agentFeePercent: { min: 0, max: 100 },
    extras: { max: 50 },
} as const;

export interface SellingCostsInput extends Partial<Record<SellingCostFeeKey, number>> {
    /** Sale price in pounds. */
    price: number;
    /** Mortgage balance to repay from the sale, in pounds. Defaults to 0. */
    mortgage?: number;
    /** The lender's charge for repaying early, in pounds. Defaults to 0. */
    earlyRepaymentCharge?: number;
    /** The agent's fee as a percentage of the price: 1.5 is 1.5%. Give this or `agentFeeFixed`, not both. */
    agentFeePercent?: number;
    /** The agent's fee as a fixed sum in pounds. Give this or `agentFeePercent`, not both. */
    agentFeeFixed?: number;
    /** Whether the agent's fee as entered already includes VAT. Defaults to `false`: VAT is added on top. */
    agentFeeIncludesVat?: boolean;
    /** Any other costs, each with its own label. */
    extras?: readonly SellingCostExtra[];
}

/**
 * One line of where the sale price goes. `key` is `agentFee`, `agentFeeVat`, a fee key, `extra-0`,
 * `extra-1`…, then `mortgage` and `earlyRepaymentCharge`.
 */
export interface SellingCostItem {
    key: string;
    label: string;
    /** Pounds. */
    value: number;
    /** This item as a percentage of the sale price, to two decimals. */
    share: number;
}

export interface SellingCosts {
    price: number;
    /** The agent's fee without VAT. */
    agentFee: number;
    /** VAT on the agent's fee. */
    agentFeeVat: number;
    /** Every cost of selling added up: the agent's fee with VAT, the fees and the extras. Not the mortgage. */
    totalCosts: number;
    /** The mortgage balance plus the early repayment charge. */
    mortgageRepaid: number;
    /** Price less costs less the mortgage repaid. Negative when the sale does not cover them. */
    netProceeds: number;
    /** Whether the sale leaves money to find: `netProceeds` is below 0. */
    shortfall: boolean;
    /** Each cost (0 when not entered), then the mortgage and its charge, in display order. They add up to price less `netProceeds`. */
    items: SellingCostItem[];
}

const invalidFee = (value: unknown) =>
    typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > SELLING_COSTS_LIMITS.fee.max;
const pence = (value: number) => Math.round(value * 100) / 100;

/** Whether a value from the `extras` list can be used: an object with a valid amount and, if any, a text label. */
function isExtra(extra: unknown): extra is SellingCostExtra {
    if (typeof extra !== 'object' || extra === null) return false;
    const { label, amount } = extra as { label?: unknown; amount?: unknown };
    return (label === undefined || typeof label === 'string') && !invalidFee(amount);
}

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function sellingCostsInputError(input: SellingCostsInput): string | null {
    // Checked as `unknown`: a form or plain JavaScript can pass anything here. Only leaving a value out means none.
    if (typeof input !== 'object' || input === null) return 'Enter the sale price.';
    const { price, agentFeePercent, agentFeeFixed, agentFeeIncludesVat } = input as unknown as Record<string, unknown>;
    const extras: unknown = input.extras === undefined ? [] : input.extras;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < SELLING_COSTS_LIMITS.price.min)
        return 'Enter the sale price.';
    if (price > MAX_PRICE) return 'Enter a lower price.';
    if (invalidFee(input.mortgage ?? 0)) return 'Enter the mortgage to repay, or leave it at 0.';
    if (invalidFee(input.earlyRepaymentCharge ?? 0)) return 'Enter the early repayment charge, or leave it at 0.';
    if (agentFeePercent !== undefined && agentFeeFixed !== undefined)
        return 'Enter the agent fee as a percentage or as a fixed amount, not both.';
    if (
        agentFeePercent !== undefined &&
        (invalidFee(agentFeePercent) || (agentFeePercent as number) > SELLING_COSTS_LIMITS.agentFeePercent.max)
    )
        return `Enter an agent fee from 0% to ${SELLING_COSTS_LIMITS.agentFeePercent.max}%.`;
    if (agentFeeFixed !== undefined && invalidFee(agentFeeFixed)) return 'Enter the agent fee, or leave it at 0.';
    if (agentFeeIncludesVat !== undefined && typeof agentFeeIncludesVat !== 'boolean')
        return 'Choose whether the agent fee includes VAT.';
    for (const { key, label } of SELLING_COST_FEES) {
        if (invalidFee(input[key] ?? 0)) return `Enter the ${label.toLowerCase()}, or leave it at 0.`;
    }
    if (!Array.isArray(extras)) return 'Enter the other costs as a list.';
    if (extras.length > SELLING_COSTS_LIMITS.extras.max)
        return `Enter up to ${SELLING_COSTS_LIMITS.extras.max} other costs.`;
    if (!extras.every(isExtra)) return 'Enter each other cost, or leave it at 0.';
    return null;
}

/** The maths alone; `null` for invalid input. Amounts are kept to the penny. */
export function calculateSellingCosts(input: SellingCostsInput): SellingCosts | null {
    return sellingCostsInputError(input) ? null : addUpCosts(input);
}

/** The agent's fee split into the fee itself and its VAT, each to the penny. */
function agentFeeParts(input: SellingCostsInput) {
    const entered =
        input.agentFeePercent === undefined
            ? (input.agentFeeFixed ?? SELLING_COSTS_DEFAULTS.agentFee)
            : (input.price * input.agentFeePercent) / 100;
    if (input.agentFeeIncludesVat ?? SELLING_COSTS_DEFAULTS.agentFeeIncludesVat) {
        // The figure entered is the fee with VAT, so the fee itself is 100/120 of it and the VAT is the rest.
        const total = pence(entered);
        const agentFee = pence((total * 100) / (100 + VAT_RATE));
        return { agentFee, agentFeeVat: pence(total - agentFee) };
    }
    const agentFee = pence(entered);
    return { agentFee, agentFeeVat: pence((agentFee * VAT_RATE) / 100) };
}

/** The costs for an input `sellingCostsInputError` has already passed. */
export function addUpCosts(input: SellingCostsInput): SellingCosts {
    const { price } = input;
    const { agentFee, agentFeeVat } = agentFeeParts(input);
    const mortgage = input.mortgage ?? SELLING_COSTS_DEFAULTS.mortgage;
    const earlyRepaymentCharge = input.earlyRepaymentCharge ?? SELLING_COSTS_DEFAULTS.earlyRepaymentCharge;

    const costs = [
        { key: 'agentFee', label: SELLING_COSTS_LABELS.agentFee, value: agentFee },
        { key: 'agentFeeVat', label: SELLING_COSTS_LABELS.agentFeeVat, value: agentFeeVat },
        ...SELLING_COST_FEES.map(({ key, label }) => ({
            key: key as string,
            label,
            value: input[key] ?? SELLING_COSTS_DEFAULTS.fee,
        })),
        ...(input.extras ?? []).map((extra, index) => ({
            key: `extra-${index}`,
            label: extra.label?.trim() || 'Other cost',
            value: extra.amount,
        })),
    ];
    const totalCosts = pence(costs.reduce((sum, cost) => sum + cost.value, 0));
    const mortgageRepaid = pence(mortgage + earlyRepaymentCharge);
    const netProceeds = pence(price - totalCosts - mortgageRepaid);
    const lines = [
        ...costs,
        { key: 'mortgage', label: 'Mortgage balance', value: mortgage },
        { key: 'earlyRepaymentCharge', label: 'Early repayment charge', value: earlyRepaymentCharge },
    ];

    return {
        price,
        agentFee,
        agentFeeVat,
        totalCosts,
        mortgageRepaid,
        netProceeds,
        shortfall: netProceeds < 0,
        items: lines.map((line) => ({ ...line, share: Math.round((line.value / price) * 10_000) / 100 })),
    };
}

export const SELLING_COSTS_LABELS = {
    netProceeds: 'Money left after the sale',
    price: 'Sale price',
    totalCosts: 'Selling costs',
    mortgageRepaid: 'Mortgage repaid',
    agentFee: 'Estate agent fee',
    agentFeeVat: 'VAT on the agent fee',
} as const;
