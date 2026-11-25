import { formatPoundsAndPence } from '../stamp-duty/format';
import { calculateTenantDeposit, type TenantDeposit, type TenantDepositInput } from './index';

/* Checking a proposed payment against its cap: the tenancy deposit, the holding deposit or rent in advance. */

/** The payments `checkTenantDeposit` can test, each with the result field that holds its cap. */
const CAP_OF_KIND = {
    tenancy: 'maxTenancyDeposit',
    holding: 'maxHoldingDeposit',
    'rent-in-advance': 'maxRentInAdvance',
} as const satisfies Record<string, keyof TenantDeposit>;

/** The payments `checkTenantDeposit` can test against their caps. */
export type TenantDepositKind = keyof typeof CAP_OF_KIND;

/** Every `TenantDepositKind`, for a dropdown or for validating one. */
export const TENANT_DEPOSIT_KINDS = Object.keys(CAP_OF_KIND) as TenantDepositKind[];

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
 * deposit unless `kind` says otherwise. `null` for an invalid rent, a negative or non-numeric
 * amount, or a `kind` that is not one of `TENANT_DEPOSIT_KINDS`: an unknown kind is never quietly
 * checked against the tenancy deposit cap.
 */
export function checkTenantDeposit(
    input: TenantDepositInput,
    proposed: number,
    kind: TenantDepositKind = 'tenancy',
): TenantDepositCheck | null {
    const result = calculateTenantDeposit(input);
    if (!result || typeof proposed !== 'number' || !Number.isFinite(proposed) || proposed < 0) return null;
    if (!Object.prototype.hasOwnProperty.call(CAP_OF_KIND, kind)) return null;

    const cap = result[CAP_OF_KIND[kind]];
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
