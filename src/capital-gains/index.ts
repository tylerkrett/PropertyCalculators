/*
 * Capital gains tax on the sale of a residential property by a UK-resident individual. The maths
 * is in ./calculate, the figures for each tax year and the reporting deadline in ./rates, the
 * plain-English notes in ./notes and the display strings in ./summary.
 */

export {
    CAPITAL_GAINS_DEFAULTS,
    CAPITAL_GAINS_LIMITS,
    type CapitalGains,
    type CapitalGainsInput,
    calculateCapitalGains,
    capitalGainsInputError,
} from './calculate';
export { CAPITAL_GAINS_NOTICE } from './notes';
export {
    CAPITAL_GAINS_RATES,
    CAPITAL_GAINS_REPORTING_DAYS,
    CAPITAL_GAINS_REPORTING_FROM,
    CAPITAL_GAINS_TAX_YEARS,
    type CapitalGainsTaxYear,
    capitalGainsReportBy,
    isCapitalGainsTaxYear,
} from './rates';
export { CAPITAL_GAINS_LABELS, type CapitalGainsSummary, getCapitalGainsSummary } from './summary';
