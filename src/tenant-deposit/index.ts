import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { formatPounds, formatPoundsAndPence } from '../stamp-duty/format';

/*
 * Tenant deposit caps in England: the most a landlord or letting agent may take as a tenancy
 * deposit, as a holding deposit, and as rent before the tenancy starts.
 *
 * Tenant Fees Act 2019, Schedule 1 (https://www.legislation.gov.uk/ukpga/2019/4/schedule/1):
 *  - paragraph 2: a tenancy deposit above five weeks' rent is a prohibited payment where the annual
 *    rent is less than £50,000, and above six weeks' rent where it is £50,000 or more;
 *  - paragraph 3: a holding deposit above one week's rent is a prohibited payment;
 *  - paragraphs 2(4) and 3(4): "one week's rent" is the annual rent divided by 52.
 * Renters' Rights Act 2025, sections 8 and 9, in force 1 May 2026: the deposit caps are unchanged;
 * rent before an assured tenancy starts is limited to one month's rent, or 28 days' rent where rent
 * is paid more often than monthly, and only once the agreement is signed
 * (https://www.gov.uk/guidance/renting-out-your-property-guidance-for-landlords-and-letting-agents/rent-payments-and-deposits).
 * GOV.UK says rents above £100,000 a year are outside the Act, so they are refused here.
 *
 * Neither the Act nor the guidance says how to round. Anything over the cap is prohibited, so every
 * maximum is rounded DOWN to the penny: the figure shown is always safe to charge.
 */

/** The only jurisdiction these rules cover. Wales, Scotland and Northern Ireland have their own law and are not covered. */
export const TENANT_DEPOSIT_JURISDICTION = 'England';

/** The figures the caps turn on, with the law each comes from. */
export const TENANT_DEPOSIT_RULES = {
    /** Annual rent at or above which the six-week cap applies (Schedule 1, paragraph 2(3)). */
    higherCapAnnualRent: 50_000,
    weeksBelowThreshold: 5,
    weeksAtOrAboveThreshold: 6,
    holdingDepositWeeks: 1,
    /** Annual rent above which GOV.UK guidance says the Act does not apply. */
    maxAnnualRent: 100_000,
    /** Days of rent that may be taken before the tenancy starts when rent is paid more often than monthly. */
    rentInAdvanceDays: 28,
    /** When the rent-in-advance limit took effect (Renters' Rights Act 2025). */
    rentInAdvanceFrom: '2026-05-01',
    sources: [
        'https://www.legislation.gov.uk/ukpga/2019/4/schedule/1',
        'https://www.gov.uk/guidance/renting-out-your-property-guidance-for-landlords-and-letting-agents/rent-payments-and-deposits',
        'https://www.gov.uk/government/publications/tenant-fees-act-amended-by-the-renters-rights-act-2025/tenant-fees-act-2019-statutory-guidance-for-enforcement-authorities',
    ],
} as const;

export const TENANT_DEPOSIT_DEFAULTS = { rentPeriod: 'month' } as const satisfies { rentPeriod: RentPeriod };

export interface TenantDepositInput {
    /** The rent for the whole property, in pounds per `rentPeriod`. Joint tenants share one cap. */
    rent: number;
    /** Defaults to `"month"`. Also decides the rent-in-advance limit: weekly rent gets 28 days, otherwise one month. */
    rentPeriod?: RentPeriod;
}

export interface TenantDeposit {
    /** Always `"England"`. */
    jurisdiction: typeof TENANT_DEPOSIT_JURISDICTION;
    /** A full year's rent, to the penny. */
    annualRent: number;
    /** Annual rent divided by 52, rounded to the nearest penny for display. The maximums use the unrounded figure. */
    weeklyRent: number;
    /** Weeks of rent the tenancy deposit is capped at: 6 when the annual rent is £50,000 or more. */
    capWeeks: 5 | 6;
    /** The most that may be taken as a tenancy deposit, rounded down to the penny. */
    maxTenancyDeposit: number;
    /** The most that may be taken as a holding deposit (one week's rent), rounded down to the penny. */
    maxHoldingDeposit: number;
    /** The most rent that may be taken between signing and the start of an assured tenancy, rounded down to the penny. */
    maxRentInAdvance: number;
    /** Which limit `maxRentInAdvance` is: one month's rent, or 28 days' rent for a weekly rent. */
    rentInAdvanceBasis: 'one-month' | '28-days';
}

const periodOf = (input: TenantDepositInput) =>
    RENT_PERIODS.find((option) => option.value === (input.rentPeriod ?? TENANT_DEPOSIT_DEFAULTS.rentPeriod));

/** Pence are exact integers here, so the tiny nudge only undoes floating-point error before rounding down. */
const floorToPenny = (pounds: number) => Math.floor(pounds * 100 + 1e-6) / 100;
const toPenny = (pounds: number) => Math.round(pounds * 100) / 100;

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function tenantDepositInputError(input: TenantDepositInput): string | null {
    const period = periodOf(input);
    if (!period) return 'Choose whether the rent is per week, month or year.';
    if (typeof input.rent !== 'number' || !Number.isFinite(input.rent) || input.rent <= 0) return 'Enter the rent.';
    if (toPenny(input.rent * period.perYear) > TENANT_DEPOSIT_RULES.maxAnnualRent) {
        return 'The Tenant Fees Act does not cover rents above £100,000 a year.';
    }
    return null;
}

/** The maths alone; `null` for invalid input. Maximums are rounded down to the penny so they never exceed the cap. */
export function calculateTenantDeposit(input: TenantDepositInput): TenantDeposit | null {
    const period = periodOf(input);
    if (!period || tenantDepositInputError(input)) return null;

    const annualRent = toPenny(input.rent * period.perYear);
    const capWeeks =
        annualRent >= TENANT_DEPOSIT_RULES.higherCapAnnualRent
            ? TENANT_DEPOSIT_RULES.weeksAtOrAboveThreshold
            : TENANT_DEPOSIT_RULES.weeksBelowThreshold;
    const weekly = period.value === 'week';

    return {
        jurisdiction: TENANT_DEPOSIT_JURISDICTION,
        annualRent,
        weeklyRent: toPenny(annualRent / 52),
        capWeeks,
        maxTenancyDeposit: floorToPenny((annualRent * capWeeks) / 52),
        maxHoldingDeposit: floorToPenny(annualRent / 52),
        // 28 days of a weekly rent is four weeks of it; a monthly or yearly rent is taken as paid monthly.
        maxRentInAdvance: floorToPenny(
            weekly ? (input.rent * TENANT_DEPOSIT_RULES.rentInAdvanceDays) / 7 : annualRent / 12,
        ),
        rentInAdvanceBasis: weekly ? '28-days' : 'one-month',
    };
}

export const TENANT_DEPOSIT_LABELS = {
    maxTenancyDeposit: 'Maximum tenancy deposit',
    maxHoldingDeposit: 'Maximum holding deposit',
    maxRentInAdvance: 'Maximum rent before the tenancy starts',
    capWeeks: 'Tenancy deposit cap',
    weeklyRent: 'One week’s rent',
    annualRent: 'Rent per year',
} as const;

type TenantDepositKey = keyof typeof TENANT_DEPOSIT_LABELS;

export interface TenantDepositSummary extends TenantDeposit {
    formatted: Record<TenantDepositKey, string>;
    /** The same figures as labelled rows, in display order: the tenancy deposit leads. */
    rows: { key: TenantDepositKey; label: string; value: number; formatted: string }[];
}

/**
 * The deposit caps with every figure and its display string. Either the summary or the reason the
 * input can't be calculated, never both.
 */
export function getTenantDepositSummary(
    input: TenantDepositInput,
): { summary: TenantDepositSummary; error: null } | { summary: null; error: string } {
    const error = tenantDepositInputError(input);
    const result = error ? null : calculateTenantDeposit(input);
    if (error || !result) return { summary: null, error: error ?? 'Enter the rent.' };

    const keys = Object.keys(TENANT_DEPOSIT_LABELS) as TenantDepositKey[];
    const formatted = Object.fromEntries(
        keys.map((key) => [
            key,
            key === 'capWeeks'
                ? `${result.capWeeks} weeks’ rent`
                : key === 'annualRent' && Number.isInteger(result.annualRent)
                  ? formatPounds(result.annualRent)
                  : formatPoundsAndPence(result[key]),
        ]),
    ) as Record<TenantDepositKey, string>;

    return {
        summary: {
            ...result,
            formatted,
            rows: keys.map((key) => ({
                key,
                label: TENANT_DEPOSIT_LABELS[key],
                value: result[key],
                formatted: formatted[key],
            })),
        },
        error: null,
    };
}

/** The payments `checkTenantDeposit` can test against their caps. */
export type TenantDepositKind = 'tenancy' | 'holding' | 'rent-in-advance';

export interface TenantDepositCheck {
    kind: TenantDepositKind;
    /** The amount proposed, in pounds. */
    proposed: number;
    /** The most the law allows for this kind of payment. */
    cap: number;
    withinCap: boolean;
    /** Pounds over the cap, to the penny; 0 when within it. This excess is the prohibited payment. */
    over: number;
    formatted: Record<'proposed' | 'cap' | 'over', string> & {
        /** `"£1,500.00 is £115.39 over the £1,384.61 cap"`, or `"… is within the £1,384.61 cap"`. */
        sentence: string;
    };
}

/**
 * Whether a proposed payment is within its cap, and by how much it is over. Checks the tenancy
 * deposit unless `kind` says otherwise. `null` for an invalid rent or a negative or non-numeric amount.
 */
export function checkTenantDeposit(
    input: TenantDepositInput,
    proposed: number,
    kind: TenantDepositKind = 'tenancy',
): TenantDepositCheck | null {
    const result = calculateTenantDeposit(input);
    if (!result || typeof proposed !== 'number' || !Number.isFinite(proposed) || proposed < 0) return null;

    const cap =
        kind === 'holding'
            ? result.maxHoldingDeposit
            : kind === 'rent-in-advance'
              ? result.maxRentInAdvance
              : result.maxTenancyDeposit;
    const over = Math.max(0, Math.round((proposed - cap) * 100) / 100);
    const withinCap = over === 0;
    const formatted = {
        proposed: formatPoundsAndPence(proposed),
        cap: formatPoundsAndPence(cap),
        over: formatPoundsAndPence(over),
    };

    return {
        kind,
        proposed,
        cap,
        withinCap,
        over,
        formatted: {
            ...formatted,
            sentence: withinCap
                ? `${formatted.proposed} is within the ${formatted.cap} cap`
                : `${formatted.proposed} is ${formatted.over} over the ${formatted.cap} cap`,
        },
    };
}
