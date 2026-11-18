import { NON_RESIDENTIAL_DWELLINGS_THRESHOLD } from './bands/non-residential';

/*
 * The inputs every purchase-tax calculator shares (SDLT, SDLT for companies, SDLT on leases, LBTT
 * and LTT), and the one validator for them, so all the entry points accept and reject the same
 * things. Everything invalid throws a `RangeError`.
 */

/** Who is buying: decides first-time buyer relief and the additional-property surcharge. */
export const BUYER_TYPES = [
    { value: 'home-mover', label: 'Home mover' },
    { value: 'first-time-buyer', label: 'First-time buyer' },
    { value: 'additional-property', label: 'Additional property' },
] as const;

export type BuyerType = (typeof BUYER_TYPES)[number]['value'];

export const DEFAULT_BUYER_TYPE: BuyerType = 'home-mover';

export const isBuyerType = (value: unknown): value is BuyerType => BUYER_TYPES.some((buyer) => buyer.value === value);

/** What is being bought. Mixed use (a shop with a flat above) counts as non-residential. */
export const PROPERTY_TYPES = [
    { value: 'residential', label: 'Residential' },
    { value: 'non-residential', label: 'Non-residential or mixed use' },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

export const DEFAULT_PROPERTY_TYPE: PropertyType = 'residential';

export const isPropertyType = (value: unknown): value is PropertyType =>
    PROPERTY_TYPES.some((type) => type.value === value);

/** Below this price the higher rates for additional dwellings and the non-UK resident surcharge are not charged. */
export const HIGHER_RATES_THRESHOLD = 40_000;

/** First-time buyer relief is lost when the price is more than this. */
export const FIRST_TIME_BUYER_MAX_PRICE = 500_000;

/** The largest amount of money the calculators accept: above it, pounds are no longer exact. */
export const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

/** The options that go with a price. Each is optional; `undefined` means the default. */
export interface PurchaseOptions {
    buyer?: BuyerType;
    nonUkResident?: boolean;
    propertyType?: PropertyType;
    dwellings?: number;
}

/** Throws unless `input` is an object: guards against `undefined` and `null` passed from JavaScript. */
export function assertInput(input: unknown, name: string): asserts input is object {
    if (typeof input !== 'object' || input === null)
        throw new RangeError(`Invalid ${name}: expected an object, got ${String(input)}`);
}

/** A finite number of pounds from 0 to `MAX_AMOUNT`. `name` completes the message: `"Invalid <name>: -1"`. */
export function checkAmount(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT)
        throw new RangeError(`Invalid ${name}: ${String(value)}`);
    return value;
}

/** A yes/no option: `undefined` is `false`, anything else must be a real boolean (`"false"` is rejected). */
export function checkFlag(value: unknown, name: string): boolean {
    if (value === undefined) return false;
    if (typeof value !== 'boolean') throw new RangeError(`Invalid ${name}: ${String(value)}`);
    return value;
}

/** The options with defaults applied, as they were asked for: no dwellings rule is applied here. */
export function resolvePurchaseOptions(input: PurchaseOptions) {
    assertInput(input, 'purchase');
    const { buyer = DEFAULT_BUYER_TYPE, propertyType = DEFAULT_PROPERTY_TYPE, dwellings = 1 } = input;
    if (!isBuyerType(buyer)) throw new RangeError(`Invalid buyer type: ${String(buyer)}`);
    if (!isPropertyType(propertyType)) throw new RangeError(`Invalid property type: ${String(propertyType)}`);
    if (!Number.isInteger(dwellings) || dwellings < 1)
        throw new RangeError(`Invalid number of dwellings: ${String(dwellings)}`);
    const nonUkResident = checkFlag(input.nonUkResident, 'non-UK resident flag');
    return { buyer, propertyType, dwellings, nonUkResident };
}

/** Six or more dwellings bought in one transaction are taxed as non-residential property. */
export const isSixOrMoreDwellings = (dwellings: number): boolean => dwellings >= NON_RESIDENTIAL_DWELLINGS_THRESHOLD;

/**
 * Two to five dwellings bought in one transaction for £40,000 or more. Whoever the buyer is, they
 * own more than one dwelling afterwards, so the purchase is charged as an additional property and
 * first-time buyer relief (which needs a single dwelling) is lost: Finance Act 2003, Schedule 4ZA,
 * paragraph 5, and the equivalent rules in Scotland and Wales. The one exception, a subsidiary
 * dwelling such as an annexe, is not modelled.
 */
export const isMultipleDwellingPurchase = (amount: number, dwellings: number): boolean =>
    dwellings >= 2 && !isSixOrMoreDwellings(dwellings) && amount >= HIGHER_RATES_THRESHOLD;

/** The sentence explaining the rule above. `consequence` is the tax-specific half: "the higher rates ... are charged". */
export const multipleDwellingsNote = (dwellings: number, consequence: string): string =>
    `Buying ${dwellings} dwellings in one transaction means ${consequence}. If one of them is a subsidiary dwelling such as an annexe, check whether the subsidiary-dwelling exception applies: this estimate assumes it does not.`;
