import { formatNumber, formatPounds, formatPoundsAndPence } from '../stamp-duty/format';
import {
    calculateTenantAffordability,
    TENANT_AFFORDABILITY_DEFAULTS,
    type TenantAffordability,
    type TenantAffordabilityInput,
    tenantAffordabilityInputError,
} from './calculate';

/* The affordability check as display strings and labelled rows, and the small print that goes with it. */

/**
 * The small print for the check: the multiples are convention, and what the Renters' Rights Act
 * 2025 changed for an applicant who falls short. From 1 May 2026 in England a landlord or agent
 * must not ask for or accept rent before the tenancy agreement is signed, and between signing and
 * the start of the tenancy may usually take only one month's rent, or 28 days' rent where the rent
 * period is shorter than a month. Paying several months upfront is therefore no longer a way round
 * a failed check; a guarantor still is. Source, checked November 2026:
 * https://www.gov.uk/guidance/renting-out-your-property-guidance-for-landlords-and-letting-agents/rent-payments-and-deposits
 */
export const TENANT_AFFORDABILITY_NOTICE = `Income multiples such as ${TENANT_AFFORDABILITY_DEFAULTS.multiple} times the monthly rent for tenants and ${TENANT_AFFORDABILITY_DEFAULTS.guarantorMultiple} times for a guarantor are conventions used by referencing firms, not law: each firm and landlord sets its own test and also looks at credit history, employment and past tenancies. In England, for tenancies starting on or after 1 May 2026, the Renters’ Rights Act 2025 generally stops a landlord or agent taking more than one month’s rent in advance (28 days’ rent where it is paid more often than monthly), so a tenant who falls short can no longer make up for it by paying several months upfront. This is a guide, not financial or legal advice.`;

export const TENANT_AFFORDABILITY_LABELS = {
    incomeNeeded: 'Annual income needed',
    passes: 'Affordability check',
    shortfall: 'Income shortfall',
    incomeNeededPerTenant: 'Income needed per tenant',
    guarantorIncomeNeeded: 'Guarantor income needed',
    monthlyRent: 'Rent per month',
    maxMonthlyRent: 'Most rent per month for this income',
    maxWeeklyRent: 'Most rent per week for this income',
} as const;

export type TenantAffordabilityKey = keyof typeof TENANT_AFFORDABILITY_LABELS;

export interface TenantAffordabilitySummary extends TenantAffordability {
    /**
     * Each figure as text: pounds, with pence only when there are some, and `"Passes"` or
     * `"Does not pass"` for the check. The figures that need an income are `null` without one.
     */
    formatted: Record<TenantAffordabilityKey, string | null> & {
        /** `"30 times the monthly rent"`: the test applied. */
        multiple: string;
        guarantorMultiple: string;
    };
    /**
     * The figures as labelled rows, in display order: the income needed leads. The check and the
     * most rent appear only with an income, the shortfall only when it falls short, and the
     * per-tenant figure only for more than one tenant.
     */
    rows: { key: TenantAffordabilityKey; label: string; value: number | boolean; formatted: string }[];
}

/** Whole pounds, with the pence only when there are some: `£36,000`, `£37,036.80`. */
const pounds = (value: number) => (Number.isInteger(value) ? formatPounds(value) : formatPoundsAndPence(value));
const times = (multiple: number) => `${formatNumber(multiple, 2).replace(/\.?0+$/, '')} times the monthly rent`;

function textOf(value: number | boolean | null): string | null {
    if (value === null) return null;
    if (typeof value === 'boolean') return value ? 'Passes' : 'Does not pass';
    return pounds(value);
}

/**
 * The affordability check with every figure and its display string. Either the summary or the
 * reason the input can't be calculated, never both.
 */
export function getTenantAffordabilitySummary(
    input: TenantAffordabilityInput,
): { summary: TenantAffordabilitySummary; error: null } | { summary: null; error: string } {
    const error = tenantAffordabilityInputError(input);
    const result = error ? null : calculateTenantAffordability(input);
    if (error || !result) return { summary: null, error: error ?? 'Enter the rent.' };

    const keys = Object.keys(TENANT_AFFORDABILITY_LABELS) as TenantAffordabilityKey[];
    const formatted = Object.fromEntries(keys.map((key) => [key, textOf(result[key])])) as Record<
        TenantAffordabilityKey,
        string | null
    >;
    const hidden = (key: TenantAffordabilityKey) =>
        (key === 'shortfall' && result.passes) || (key === 'incomeNeededPerTenant' && result.tenants === 1);

    return {
        summary: {
            ...result,
            formatted: {
                ...formatted,
                multiple: times(result.multiple),
                guarantorMultiple: times(result.guarantorMultiple),
            },
            rows: keys.flatMap((key) => {
                const value = result[key];
                const text = formatted[key];
                if (value === null || text === null || hidden(key)) return [];
                return [{ key, label: TENANT_AFFORDABILITY_LABELS[key], value, formatted: text }];
            }),
        },
        error: null,
    };
}
