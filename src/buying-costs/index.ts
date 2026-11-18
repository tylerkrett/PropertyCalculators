import { type BuyerType, calculateStampDuty, isBuyerType, MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds, formatPoundsAndPence, formatRate } from '../stamp-duty/format';

/*
 * The total cost of buying: one upfront figure for a purchase. It adds the deposit, the stamp
 * duty (worked out here from the price and buyer type) and whatever fees you enter: legal fees,
 * survey, lender and broker fees, removals and anything else. Every fee defaults to 0 because
 * quotes vary too much to guess. An illustration only: it assumes every fee is paid in cash on
 * or before completion, so a lender fee added to the loan should be left out.
 */

/** The optional fees, in display order, with the label each one is shown under. */
export const BUYING_COST_FEES = [
    { key: 'legalFees', label: 'Legal fees' },
    { key: 'survey', label: 'Survey' },
    { key: 'arrangementFee', label: 'Mortgage arrangement fee' },
    { key: 'valuationFee', label: 'Valuation fee' },
    { key: 'brokerFee', label: 'Mortgage broker fee' },
    { key: 'removals', label: 'Removals' },
] as const;

export type BuyingCostFeeKey = (typeof BUYING_COST_FEES)[number]['key'];

/** A cost of your own, such as `{ label: 'Furniture', amount: 2000 }`. */
export interface BuyingCostExtra {
    /** Shown as `"Other cost"` when left out or blank. */
    label?: string;
    /** Pounds, 0 or more. */
    amount: number;
}

export const BUYING_COSTS_DEFAULTS = {
    buyer: 'home-mover',
    nonUkResident: false,
    fee: 0,
} as const satisfies { buyer: BuyerType; nonUkResident: boolean; fee: number };

/** Bounds the form accepts. */
export const BUYING_COSTS_LIMITS = {
    price: { min: 1, max: MAX_PRICE },
    fee: { min: 0, max: MAX_PRICE },
    extras: { max: 50 },
} as const;

export interface BuyingCostsInput extends Partial<Record<BuyingCostFeeKey, number>> {
    /** Purchase price in pounds. */
    price: number;
    /** Deposit in pounds, from 0 up to the whole price (a cash purchase). */
    deposit: number;
    /** Buyer type for the stamp duty. Defaults to `"home-mover"`. */
    buyer?: BuyerType;
    nonUkResident?: boolean;
    /** Any other costs, each with its own label. */
    extras?: readonly BuyingCostExtra[];
}

/** One line of the cash needed. `key` is `deposit`, `stampDuty`, a fee key, or `extra-0`, `extra-1`… */
export interface BuyingCostItem {
    key: string;
    label: string;
    /** Pounds. */
    value: number;
    /** This item as a percentage of the cash needed upfront, to two decimals; 0 when no cash is needed. */
    share: number;
}

export interface BuyingCosts {
    deposit: number;
    stampDuty: number;
    /** Every fee and extra added up; stamp duty is not included. */
    totalFees: number;
    /** Deposit plus stamp duty plus fees: the money to have ready. */
    cashUpfront: number;
    /** Price plus stamp duty plus fees: what the purchase costs in all, before mortgage interest. */
    totalCost: number;
    /** Price less deposit. */
    loan: number;
    /** Deposit, stamp duty, each fee (0 when not entered) and each extra, in display order. */
    items: BuyingCostItem[];
}

const amount = (value: number | undefined) => value ?? BUYING_COSTS_DEFAULTS.fee;
const invalidFee = (value: number) => !Number.isFinite(value) || value < 0 || value > BUYING_COSTS_LIMITS.fee.max;
const pence = (value: number) => Math.round(value * 100) / 100;

/** Whether a value from the `extras` list can be used: an object with a valid amount and, if any, a text label. */
function isExtra(extra: unknown): extra is BuyingCostExtra {
    if (typeof extra !== 'object' || extra === null) return false;
    const { label, amount: cost } = extra as { label?: unknown; amount?: unknown };
    return (label === undefined || typeof label === 'string') && typeof cost === 'number' && !invalidFee(cost);
}

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function buyingCostsInputError(input: BuyingCostsInput): string | null {
    const { price, deposit } = input;
    // Checked as `unknown`: a form or plain JavaScript can pass anything here. Only leaving it out means none.
    const extras: unknown = input.extras === undefined ? [] : input.extras;
    if (!Number.isFinite(price) || price < BUYING_COSTS_LIMITS.price.min) return 'Enter the property price.';
    if (price > MAX_PRICE) return 'Enter a lower price.';
    if (!Number.isFinite(deposit) || deposit < 0) return 'Enter a deposit of £0 or more.';
    if (deposit > price) return 'The deposit is more than the price.';
    for (const { key, label } of BUYING_COST_FEES) {
        if (invalidFee(amount(input[key]))) return `Enter the ${label.toLowerCase()}, or leave it at 0.`;
    }
    if (!Array.isArray(extras)) return 'Enter the other costs as a list.';
    if (extras.length > BUYING_COSTS_LIMITS.extras.max)
        return `Enter up to ${BUYING_COSTS_LIMITS.extras.max} other costs.`;
    if (!extras.every(isExtra)) return 'Enter each other cost, or leave it at 0.';
    if (input.buyer !== undefined && !isBuyerType(input.buyer)) return 'Choose the type of buyer.';
    return null;
}

/** The maths alone; `null` for invalid input. Amounts are kept to the penny. */
export function calculateBuyingCosts(input: BuyingCostsInput): BuyingCosts | null {
    return buyingCostsInputError(input) ? null : addUpCosts(input);
}

/** The costs for an input `buyingCostsInputError` has already passed. */
function addUpCosts(input: BuyingCostsInput): BuyingCosts {
    const { price, deposit } = input;
    const stampDuty = calculateStampDuty({
        price,
        buyer: input.buyer ?? BUYING_COSTS_DEFAULTS.buyer,
        nonUkResident: input.nonUkResident ?? BUYING_COSTS_DEFAULTS.nonUkResident,
    }).stampDuty;

    const fees = [
        ...BUYING_COST_FEES.map(({ key, label }) => ({ key: key as string, label, value: amount(input[key]) })),
        ...(input.extras ?? []).map((extra, index) => ({
            key: `extra-${index}`,
            label: extra.label?.trim() || 'Other cost',
            value: extra.amount,
        })),
    ];
    const totalFees = pence(fees.reduce((sum, fee) => sum + fee.value, 0));
    const cashUpfront = pence(deposit + stampDuty + totalFees);
    const lines = [
        { key: 'deposit', label: BUYING_COSTS_LABELS.deposit, value: deposit },
        { key: 'stampDuty', label: BUYING_COSTS_LABELS.stampDuty, value: stampDuty },
        ...fees,
    ];

    return {
        deposit,
        stampDuty,
        totalFees,
        cashUpfront,
        totalCost: pence(price + stampDuty + totalFees),
        loan: pence(price - deposit),
        items: lines.map((line) => ({
            ...line,
            share: cashUpfront > 0 ? Math.round((line.value / cashUpfront) * 10_000) / 100 : 0,
        })),
    };
}

export const BUYING_COSTS_LABELS = {
    cashUpfront: 'Cash needed upfront',
    deposit: 'Deposit',
    stampDuty: 'Stamp duty',
    totalFees: 'Fees and other costs',
    totalCost: 'Total cost of the purchase',
    loan: 'Loan amount',
} as const;

type BuyingCostsKey = keyof typeof BUYING_COSTS_LABELS;

export interface BuyingCostsSummary extends Omit<BuyingCosts, 'items'> {
    formatted: Record<BuyingCostsKey, string>;
    /** The headline figures as labelled rows, in display order: cash needed leads. */
    rows: { key: BuyingCostsKey; label: string; value: number; formatted: string }[];
    /** The cash needed line by line, each with its amount (`formatted`) and share (`formattedShare`). */
    items: (BuyingCostItem & { formatted: string; formattedShare: string })[];
}

/** Whole pounds, with the pence only when there are some: `£1,500`, `£1,499.50`. */
const pounds = (value: number) => (Number.isInteger(value) ? formatPounds(value) : formatPoundsAndPence(value));

/**
 * The cost of buying with every figure and its display string. Either the summary or the reason
 * the input can't be calculated, never both.
 */
export function getBuyingCostsSummary(
    input: BuyingCostsInput,
): { summary: BuyingCostsSummary; error: null } | { summary: null; error: string } {
    const error = buyingCostsInputError(input);
    if (error) return { summary: null, error };
    const result = addUpCosts(input);

    const keys = Object.keys(BUYING_COSTS_LABELS) as BuyingCostsKey[];
    const formatted = Object.fromEntries(keys.map((key) => [key, pounds(result[key])])) as Record<
        BuyingCostsKey,
        string
    >;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: BUYING_COSTS_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
            items: result.items.map((item) => ({
                ...item,
                formatted: pounds(item.value),
                formattedShare: formatRate(item.share),
            })),
        },
        error: null,
    };
}
