/*
 * The figures capital gains tax on a home turns on, by tax year, and the reporting deadline.
 *
 * Checked on 25 November 2026 against:
 *  - rates and how the basic-rate band is used: https://www.gov.uk/capital-gains-tax/rates
 *    ("18% on gains within the basic rate band, 24% on any amount above it"; residential property
 *    has had the same rates as other assets since 30 October 2024, and 24% since 6 April 2024);
 *  - annual exempt amount: https://www.gov.uk/capital-gains-tax/allowances (£3,000);
 *  - personal allowance, its £100,000 income limit and the basic-rate band:
 *    https://www.gov.uk/income-tax-rates and
 *    https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past;
 *  - 2027-28: Budget 2026 (28 October 2026), Overview of tax legislation and rates, Annex A, which
 *    lists every figure below unchanged for 2027 to 2028
 *    (https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar/annex-a-rates-and-allowances).
 *
 * Gains are taxed against the UK basic-rate band wherever in the UK the seller lives: the Scottish
 * income tax bands do not apply to capital gains.
 */

interface CapitalGainsYearRates {
    /** Percent charged on a residential gain that falls inside the unused basic-rate band. */
    lowerRate: number;
    /** Percent charged on the rest. */
    higherRate: number;
    /** The annual exempt amount: gains up to this are tax-free each year. */
    annualExemptAmount: number;
    /** Income tax personal allowance. */
    personalAllowance: number;
    /** Income above which the personal allowance is reduced by £1 for every £2 (Income Tax Act 2007, section 35). */
    allowanceTaperThreshold: number;
    /** The basic-rate band: taxable income, after allowances, taxed at the basic rate. */
    basicRateBand: number;
}

/** Tax years run from 6 April to 5 April. */
export const CAPITAL_GAINS_RATES = {
    '2026-27': {
        lowerRate: 18,
        higherRate: 24,
        annualExemptAmount: 3_000,
        personalAllowance: 12_570,
        allowanceTaperThreshold: 100_000,
        basicRateBand: 37_700,
    },
    '2027-28': {
        lowerRate: 18,
        higherRate: 24,
        annualExemptAmount: 3_000,
        personalAllowance: 12_570,
        allowanceTaperThreshold: 100_000,
        basicRateBand: 37_700,
    },
} as const satisfies Record<string, CapitalGainsYearRates>;

export type CapitalGainsTaxYear = keyof typeof CAPITAL_GAINS_RATES;

/** The tax years covered, oldest first, as options for a dropdown. */
export const CAPITAL_GAINS_TAX_YEARS = (Object.keys(CAPITAL_GAINS_RATES) as CapitalGainsTaxYear[]).map((value) => ({
    value,
    label: `${value.slice(0, 4)} to 20${value.slice(5)}`,
}));

export const isCapitalGainsTaxYear = (value: unknown): value is CapitalGainsTaxYear =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAPITAL_GAINS_RATES, value);

/**
 * Days a UK resident has to report a residential property gain and pay the tax. Finance Act 2019,
 * Schedule 2, paragraph 3(1)(b): the return is due "on or before the 60th day following the day
 * of the completion of the disposal", and paragraph 6(3) makes the tax payable on that filing date
 * (https://www.legislation.gov.uk/ukpga/2019/1/schedule/2). So the day after completion is day 1.
 */
export const CAPITAL_GAINS_REPORTING_DAYS = 60;

/** The 60-day limit applies to sales completed on or after this date (Finance Act 2022, section 23); it was 30 days before. */
export const CAPITAL_GAINS_REPORTING_FROM = '2021-10-27';
const MAX_YEAR = 2200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = 'January February March April May June July August September October November December'.split(' ');

/** A `YYYY-MM-DD` string as a UTC date, or `null` when it is not a real calendar date. */
function parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    // `2026-02-30` parses as an invalid date or rolls into March; either way it does not read back the same.
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/** Why a completion date can't be used, worded for the form; `null` when it can. */
export function completionDateError(value: unknown): string | null {
    const date = parseDate(value);
    if (!date) return 'Enter the completion date as YYYY-MM-DD.';
    // ISO dates of the same length sort as text.
    if ((value as string) < CAPITAL_GAINS_REPORTING_FROM || date.getUTCFullYear() > MAX_YEAR)
        return 'Enter a completion date on or after 27 October 2021.';
    return null;
}

/**
 * The last day to report the sale and pay the tax: the 60th day after completion, as `YYYY-MM-DD`.
 * A sale completed on 1 March is due by 30 April. `null` for a date `completionDateError` refuses.
 */
export function capitalGainsReportBy(completionDate: string): string | null {
    const date = completionDateError(completionDate) ? null : parseDate(completionDate);
    if (!date) return null;
    // Worked in UTC so a clock change never moves the day.
    const due = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + CAPITAL_GAINS_REPORTING_DAYS);
    return new Date(due).toISOString().slice(0, 10);
}

/** `2027-01-24` as `24 January 2027`, built by hand so no locale data is needed. */
export function formatIsoDate(iso: string): string {
    const [year = '', month = '', day = ''] = iso.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}
