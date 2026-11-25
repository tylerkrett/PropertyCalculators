import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { MAX_PRICE } from '../stamp-duty/estimate';

/*
 * Tenant affordability: the income check letting agents and referencing firms run on an applicant.
 * The usual test is that the tenants' combined gross annual income is at least 30 times the monthly
 * rent (rent is then 40% of gross income), and that a guarantor, who must cover the rent on top of
 * their own housing costs, earns at least 36 times the monthly rent.
 *
 * These multiples are market conventions, not law: nothing in statute sets them, firms differ (some
 * ask 2.5 times the annual rent, which is the same 30 times; some ask 3 times the annual rent, 36),
 * and a landlord may apply another test. Both can be changed here. Sources, checked November 2026:
 *  - https://help.lettingaproperty.com/knowledge/how-is-tenant-affordability-calculated ("tenants
 *    must have a combined income of 30 times the monthly rental amount"; "the guarantor must earn 36
 *    times the monthly rent amount");
 *  - https://haart.co.uk/landlords/rules-and-regulations/guide-to-tenant-referencing-for-landlords-and-letting-agents
 *    ("often, landlords look for an income that's at least 30 times the monthly rent").
 *
 * A month's rent is a year's rent over 12, and a year is 52 weeks, as everywhere in this package
 * (`RENT_PERIODS`). The income needed is rounded to the nearest penny and the check is made against
 * that figure, so an income equal to the amount shown always passes. The most rent an income
 * supports is rounded DOWN to the penny, so the figure shown always passes the check itself.
 */

export const TENANT_AFFORDABILITY_DEFAULTS = {
    rentPeriod: 'month',
    /** Annual income needed, as a multiple of the monthly rent. */
    multiple: 30,
    /** A guarantor's annual income needed, as a multiple of the monthly rent. */
    guarantorMultiple: 36,
    tenants: 1,
} as const satisfies { rentPeriod: RentPeriod; multiple: number; guarantorMultiple: number; tenants: number };

/** Bounds the form accepts. */
export const TENANT_AFFORDABILITY_LIMITS = {
    rent: { max: MAX_PRICE },
    income: { min: 0, max: MAX_PRICE },
    multiple: { min: 1, max: 100 },
    tenants: { min: 1, max: 20 },
} as const;

export interface TenantAffordabilityInput {
    /** The rent for the whole property, in pounds per `rentPeriod`. */
    rent: number;
    /** The period the rent is quoted for. Defaults to `"month"`. */
    rentPeriod?: RentPeriod;
    /** Annual income needed as a multiple of the monthly rent, from 1 to 100. Defaults to 30. */
    multiple?: number;
    /** A guarantor's annual income needed as a multiple of the monthly rent, from 1 to 100. Defaults to 36. */
    guarantorMultiple?: number;
    /** How many tenants share the rent: a whole number from 1 to 20. Defaults to 1. */
    tenants?: number;
    /** The tenants' combined gross annual income in pounds. When given, the result says whether it passes. */
    income?: number;
}

export interface TenantAffordability {
    /** A year's rent over 12, to the penny. */
    monthlyRent: number;
    /** Combined annual income needed: the monthly rent times `multiple`. */
    incomeNeeded: number;
    /** `incomeNeeded` split equally between the tenants. */
    incomeNeededPerTenant: number;
    /** A guarantor's annual income needed: the monthly rent times `guarantorMultiple`. */
    guarantorIncomeNeeded: number;
    multiple: number;
    guarantorMultiple: number;
    tenants: number;
    /** The income checked, or `null` when none was given; the four figures below are then `null` too. */
    income: number | null;
    /** Whether the income is at least `incomeNeeded`. */
    passes: boolean | null;
    /** How far the income falls short of `incomeNeeded`; 0 when it passes. */
    shortfall: number | null;
    /** The most monthly rent the income supports, rounded down to the penny. */
    maxMonthlyRent: number | null;
    /** The most weekly rent the income supports, rounded down to the penny. */
    maxWeeklyRent: number | null;
}

/** The most rent an income supports, each rounded down to the penny. */
export interface MaxRent {
    monthly: number;
    weekly: number;
    annual: number;
}

type Fields<T> = Partial<Record<keyof T, unknown>>;
// A value that is not an object has no fields to read, so every check below sees `undefined`.
const fieldsOf = <T>(input: T): Fields<T> => (typeof input === 'object' && input !== null ? input : {});
const periodOf = (input: TenantAffordabilityInput) =>
    RENT_PERIODS.find(
        (option) => option.value === (fieldsOf(input).rentPeriod ?? TENANT_AFFORDABILITY_DEFAULTS.rentPeriod),
    );
// The tiny nudge only undoes floating-point error before rounding.
const toPenny = (pounds: number) => Math.round(pounds * 100 + 1e-6) / 100;
const floorToPenny = (pounds: number) => Math.floor(pounds * 100 + 1e-6) / 100;
const between = (value: unknown, { min, max }: { min: number; max: number }): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const { multiple: MULTIPLE, income: INCOME, tenants: TENANTS } = TENANT_AFFORDABILITY_LIMITS;

/** What is wrong with an income, if anything. `undefined` or `null` means none was given. */
function incomeError(income: unknown, missing: string | null): string | null {
    if (income === undefined || income === null) return missing;
    if (typeof income === 'number' && income > INCOME.max) return 'Enter a lower income.';
    return between(income, INCOME) ? null : (missing ?? 'Enter the combined annual income, or leave it empty.');
}

/** Why an input can't be calculated, worded for the form; `null` when it can. */
export function tenantAffordabilityInputError(input: TenantAffordabilityInput): string | null {
    const fields = fieldsOf(input);
    const { rent } = fields;
    if (typeof rent !== 'number' || !Number.isFinite(rent) || rent <= 0) return 'Enter the rent.';
    if (rent > TENANT_AFFORDABILITY_LIMITS.rent.max) return 'Enter a lower rent.';
    if (!periodOf(input)) return 'Choose whether the rent is per week, month or year.';
    if (!between(fields.multiple ?? TENANT_AFFORDABILITY_DEFAULTS.multiple, MULTIPLE)) {
        return `Enter an income multiple from ${MULTIPLE.min} to ${MULTIPLE.max}.`;
    }
    if (!between(fields.guarantorMultiple ?? TENANT_AFFORDABILITY_DEFAULTS.guarantorMultiple, MULTIPLE)) {
        return `Enter a guarantor multiple from ${MULTIPLE.min} to ${MULTIPLE.max}.`;
    }
    const tenants = fields.tenants ?? TENANT_AFFORDABILITY_DEFAULTS.tenants;
    if (!between(tenants, TENANTS) || !Number.isInteger(tenants)) {
        return `Enter the number of tenants, from ${TENANTS.min} to ${TENANTS.max}.`;
    }
    return incomeError(fields.income, null);
}

/** The most rent an income supports at a multiple both already checked. */
function maxRent(income: number, multiple: number): MaxRent {
    // The exact monthly figure, so the weekly and annual ones are not built on a rounded month.
    const monthly = income / multiple;
    return {
        monthly: floorToPenny(monthly),
        weekly: floorToPenny((monthly * 12) / 52),
        annual: floorToPenny(monthly * 12),
    };
}

/**
 * Income to rent: the most rent a combined annual income supports, `null` for invalid input.
 * `multiple` defaults to 30, so £45,000 a year supports £1,500 a month.
 */
export function maxRentForIncome(input: { income: number; multiple?: number }): MaxRent | null {
    const { income, multiple } = fieldsOf(input);
    const times = multiple ?? TENANT_AFFORDABILITY_DEFAULTS.multiple;
    if (incomeError(income, 'Enter the income.') || !between(times, MULTIPLE)) return null;
    return maxRent(income as number, times);
}

/** Rent to income: the maths alone; `null` for invalid input. */
export function calculateTenantAffordability(input: TenantAffordabilityInput): TenantAffordability | null {
    const period = periodOf(input);
    if (!period || tenantAffordabilityInputError(input)) return null;

    const multiple = input.multiple ?? TENANT_AFFORDABILITY_DEFAULTS.multiple;
    const guarantorMultiple = input.guarantorMultiple ?? TENANT_AFFORDABILITY_DEFAULTS.guarantorMultiple;
    const tenants = input.tenants ?? TENANT_AFFORDABILITY_DEFAULTS.tenants;
    const income = input.income ?? null;

    // The unrounded monthly rent feeds every figure; only the figures returned are rounded.
    const monthlyRent = (input.rent * period.perYear) / 12;
    const incomeNeeded = toPenny(monthlyRent * multiple);
    const max = income === null ? null : maxRent(income, multiple);
    // Compared in pence against the figure shown, so an income exactly at it passes.
    const passes = income === null ? null : toPenny(income) >= incomeNeeded;

    return {
        monthlyRent: toPenny(monthlyRent),
        incomeNeeded,
        incomeNeededPerTenant: toPenny((monthlyRent * multiple) / tenants),
        guarantorIncomeNeeded: toPenny(monthlyRent * guarantorMultiple),
        multiple,
        guarantorMultiple,
        tenants,
        income,
        passes,
        shortfall: income === null ? null : passes ? 0 : toPenny(incomeNeeded - income),
        maxMonthlyRent: max?.monthly ?? null,
        maxWeeklyRent: max?.weekly ?? null,
    };
}
