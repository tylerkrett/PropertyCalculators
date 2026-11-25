/*
 * The cost of selling and the money left after it. The maths is in ./costs and the display
 * strings in ./summary.
 */

export {
    calculateSellingCosts,
    SELLING_COST_FEES,
    SELLING_COSTS_DEFAULTS,
    SELLING_COSTS_LABELS,
    SELLING_COSTS_LIMITS,
    type SellingCostExtra,
    type SellingCostFeeKey,
    type SellingCostItem,
    type SellingCosts,
    type SellingCostsInput,
    sellingCostsInputError,
    VAT_RATE,
} from './costs';
export { getSellingCostsSummary, type SellingCostsSummary } from './summary';
