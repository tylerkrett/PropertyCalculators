import { mortgageFor } from '../mortgage/index';
import { type BuyerType, calculateStampDuty, isBuyerType, MAX_PRICE } from '../stamp-duty/estimate';
import { formatPounds, formatPoundsAndPence, formatRate } from '../stamp-duty/format';
import {
    AFFORDABILITY_DEFAULTS,
    AFFORDABILITY_LIMITS,
    amount,
    COMMITMENTS_ERROR,
    incomeMultipleError,
    invalid,
    outside,
    poundsDown,
    twoDecimals,
} from './limits';

export * from './income-needed';
export { AFFORDABILITY_DEFAULTS, AFFORDABILITY_LIMITS } from './limits';

/*
 * Affordability: "how much can I borrow?" The rule of thumb every broker starts from is a multiple
 * of gross yearly income, 4.5 times by default. Committed outgoings (loans, credit cards) reduce
 * the income counted: a year of them is taken off the income before it is multiplied. That is a
 * convention of this calculator, chosen because it is simple and cautious, not a rule lenders share.
 * The repayment is then shown at the rate entered and at a stressed rate a few points higher, to
 * show what a rate rise would cost.
 *
 * An illustration, not a lender's decision. Real lenders look at spending, credit history, age and
 * their own stress rates, and each sets its own income multiple.
 */

export interface AffordabilityInput {
    /** The first applicant's gross yearly income in pounds. */
    income: number;
    /** A second applicant's gross yearly income, for a joint application. Defaults to 0. */
    secondIncome?: number;
    /** Committed outgoings in pounds a month: loans, credit cards, car finance. Defaults to 0. */
    monthlyCommitments?: number;
    /** Deposit in pounds. */
    deposit: number;
    /** Times the counted income a lender will lend, 1 to 6. Defaults to 4.5. */
    incomeMultiple?: number;
    /** Annual interest rate in percent, e.g. 4.5. */
    rate: number;
    termYears: number;
    /** Percentage points added to `rate` for the stressed payment. Defaults to 3. */
    stressBuffer?: number;
    /** Buyer type for the stamp duty. Defaults to `"home-mover"`. */
    buyer?: BuyerType;
    nonUkResident?: boolean;
}

export interface Affordability {
    /** Both applicants' gross yearly income. */
    totalIncome: number;
    /** Income the multiple is applied to: total income less a year of commitments. */
    countedIncome: number;
    /** Counted income times the income multiple, rounded down to the pound. */
    maxLoan: number;
    /** The maximum loan plus the deposit. */
    maxPrice: number;
    deposit: number;
    /** Loan to value at the maximum price, percent to two decimals. */
    ltv: number;
    /** Monthly repayment on the maximum loan at the rate entered. */
    monthlyPayment: number;
    /** The rate entered plus the stress buffer, percent; not rounded, so 4.555 plus 3 is 7.555. */
    stressedRate: number;
    /** Monthly repayment on the maximum loan at the stressed rate. */
    stressedPayment: number;
    /** The stressed payment as a percentage of gross monthly income, to two decimals. */
    stressedPaymentShare: number;
    /** Stamp duty at the maximum price. */
    stampDuty: number;
    /** Deposit plus stamp duty. Legal fees, surveys and lender fees are extra. */
    cashUpfront: number;
}

/** The settings with their defaults filled in, and the figures every check needs. */
function resolve(input: AffordabilityInput) {
    const incomeMultiple = input.incomeMultiple ?? AFFORDABILITY_DEFAULTS.incomeMultiple;
    const stressBuffer = input.stressBuffer ?? AFFORDABILITY_DEFAULTS.stressBuffer;
    const totalIncome = input.income + amount(input.secondIncome);
    const countedIncome = totalIncome - amount(input.monthlyCommitments) * 12;
    const maxLoan = poundsDown(countedIncome * incomeMultiple);
    // The exact sum, less floating-point noise: 4.555 + 3 is 7.555, not 7.56 and not 7.555000000000001.
    const stressedRate = Math.round((input.rate + stressBuffer) * 1e9) / 1e9;
    const maxPrice = maxLoan + input.deposit;
    return { incomeMultiple, stressBuffer, stressedRate, totalIncome, countedIncome, maxLoan, maxPrice };
}

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function affordabilityInputError(input: AffordabilityInput): string | null {
    const { income, deposit, rate, termYears } = input;
    const { rate: rates, term, stressBuffer: buffers } = AFFORDABILITY_LIMITS;
    if (!Number.isFinite(income) || income <= 0) return 'Enter your yearly income before tax.';
    if (invalid(amount(input.secondIncome))) return "Enter the second applicant's yearly income, or leave it at 0.";
    if (invalid(amount(input.monthlyCommitments))) return COMMITMENTS_ERROR;
    if (invalid(deposit)) return 'Enter a deposit of £0 or more.';
    const { incomeMultiple, stressBuffer, stressedRate, maxLoan, maxPrice } = resolve(input);
    const multipleError = incomeMultipleError(incomeMultiple);
    if (multipleError) return multipleError;
    if (outside(rate, rates)) return `Enter an interest rate between ${rates.min}% and ${rates.max}%.`;
    if (!Number.isInteger(termYears) || outside(termYears, term))
        return `Enter a term of ${term.min} to ${term.max} whole years.`;
    if (outside(stressBuffer, buffers))
        return `Enter a stress buffer between ${buffers.min} and ${buffers.max} percentage points.`;
    if (stressedRate > rates.max) return `The rate plus the stress buffer must be ${rates.max}% or less.`;
    if (maxLoan < 1) return 'The monthly commitments use up all the income, so there is nothing to borrow.';
    if (maxPrice > MAX_PRICE) return 'Enter a lower income or deposit.';
    if (input.buyer !== undefined && !isBuyerType(input.buyer)) return 'Choose the type of buyer.';
    return null;
}

/**
 * The maths alone; `null` for invalid input. The maximum loan is (total income − 12 × monthly
 * commitments) × income multiple, rounded down to the pound; repayments are the mortgage
 * calculator's, on a repayment basis. The stressed rate is used as it is, not rounded.
 */
export function calculateAffordability(input: AffordabilityInput): Affordability | null {
    return affordabilityInputError(input) ? null : affordabilityFor(input);
}

/** The figures for an input `affordabilityInputError` has already passed. */
function affordabilityFor(input: AffordabilityInput): Affordability {
    const { stressedRate, totalIncome, countedIncome, maxLoan, maxPrice } = resolve(input);
    const { deposit, rate, termYears } = input;
    // The input check has passed everything the mortgage calculator would reject.
    const mortgage = { price: maxPrice, deposit, termYears, type: 'repayment' } as const;
    const atRate = mortgageFor({ ...mortgage, rate });
    const stressed = mortgageFor({ ...mortgage, rate: stressedRate });
    const stampDuty = calculateStampDuty({
        price: maxPrice,
        buyer: input.buyer ?? AFFORDABILITY_DEFAULTS.buyer,
        nonUkResident: input.nonUkResident,
    }).stampDuty;

    return {
        totalIncome,
        countedIncome,
        maxLoan,
        maxPrice,
        deposit,
        ltv: twoDecimals(atRate.ltv),
        monthlyPayment: atRate.monthlyPayment,
        stressedRate,
        stressedPayment: stressed.monthlyPayment,
        stressedPaymentShare: twoDecimals((stressed.monthlyPayment / (totalIncome / 12)) * 100),
        stampDuty,
        cashUpfront: deposit + stampDuty,
    };
}

/** Row labels, in display order. */
export const AFFORDABILITY_LABELS = {
    maxPrice: 'Maximum property price',
    maxLoan: 'Maximum loan',
    deposit: 'Deposit',
    ltv: 'Loan to value',
    totalIncome: 'Total income',
    countedIncome: 'Income after commitments',
    monthlyPayment: 'Monthly repayment',
    stressedRate: 'Stressed interest rate',
    stressedPayment: 'Monthly repayment at the stressed rate',
    stressedPaymentShare: 'Stressed repayment as a share of income',
    stampDuty: 'Stamp duty',
    cashUpfront: 'Cash needed upfront',
} as const;

type AffordabilityKey = keyof typeof AFFORDABILITY_LABELS;

export interface AffordabilitySummary extends Affordability {
    formatted: Record<AffordabilityKey, string>;
    /** The same figures as labelled rows, in display order: the maximum price leads. */
    rows: { key: AffordabilityKey; label: string; value: number; formatted: string }[];
}

const PERCENT_KEYS: readonly AffordabilityKey[] = ['ltv', 'stressedRate', 'stressedPaymentShare'];
const PENCE_KEYS: readonly AffordabilityKey[] = ['monthlyPayment', 'stressedPayment'];

/**
 * What the applicants could borrow, every figure with its display string. Either the summary or
 * the reason the input can't be calculated, never both.
 */
export function getAffordabilitySummary(
    input: AffordabilityInput,
): { summary: AffordabilitySummary; error: null } | { summary: null; error: string } {
    const error = affordabilityInputError(input);
    if (error) return { summary: null, error };
    const result = affordabilityFor(input);

    const keys = Object.keys(AFFORDABILITY_LABELS) as AffordabilityKey[];
    const format = (key: AffordabilityKey) =>
        PERCENT_KEYS.includes(key)
            ? formatRate(result[key])
            : PENCE_KEYS.includes(key)
              ? formatPoundsAndPence(result[key])
              : formatPounds(result[key]);
    const formatted = Object.fromEntries(keys.map((key) => [key, format(key)])) as Record<AffordabilityKey, string>;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: AFFORDABILITY_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}
