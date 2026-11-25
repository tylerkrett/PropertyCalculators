import { formatRate } from '../stamp-duty/format';
import {
    type AreaUnit,
    exact,
    isAreaUnit,
    money,
    positive,
    PRICE_PER_AREA_LIMITS,
    type PricePerAreaInput,
    shortUnit,
    toTwoDecimals,
} from './figures';

/* A property's price per area set against a comparable average. */

export interface PricePerAreaComparison {
    /** The unit both figures are per: the one the comparable average was given in. */
    unit: AreaUnit;
    /** The property's pounds per `unit`. */
    subject: number;
    /** The comparable average's pounds per `unit`, as given. */
    comparable: number;
    /** Subject less comparable before either is rounded, in pounds per `unit`: negative when the property is cheaper. */
    difference: number;
    /** The same unrounded difference as a percentage of the comparable, to two decimals. */
    differencePercent: number;
    /** The sign of `differencePercent`, so the word and the percentage can never disagree. */
    position: 'above' | 'below' | 'same';
    formatted: Record<'subject' | 'comparable' | 'difference' | 'differencePercent', string> & {
        /** `"8.7% above the comparable average"`. */
        sentence: string;
    };
}

/**
 * How a property's price per area sits against a comparable average, such as the street's or the
 * postcode's. The average is pounds per `unit` (per year, for a rent). `null` for invalid input
 * or a missing comparable.
 *
 * The difference, the percentage and the position all come from one comparison of the unrounded
 * figures. Pence are shown when the two are less than £1 apart, so a 40p gap never reads as "£0".
 */
export function comparePricePerArea(
    input: PricePerAreaInput,
    comparable: { perArea: number; unit: AreaUnit } | null | undefined,
): PricePerAreaComparison | null {
    const figures = exact(input);
    if (!figures || !comparable || !positive(comparable.perArea) || !isAreaUnit(comparable.unit)) return null;
    if (comparable.perArea > PRICE_PER_AREA_LIMITS.amount.max) return null;

    const { unit } = comparable;
    const exactSubject = figures.amount / (unit === 'sqft' ? figures.areaSqFt : figures.areaSqM);
    const exactDifference = exactSubject - comparable.perArea;
    const subject = toTwoDecimals(exactSubject);
    const difference = toTwoDecimals(exactDifference);
    const differencePercent = toTwoDecimals((exactDifference / comparable.perArea) * 100);
    const position = differencePercent > 0 ? 'above' : differencePercent < 0 ? 'below' : 'same';

    const isRent = figures.basis === 'rent';
    const pence = isRent || (difference !== 0 && Math.abs(difference) < 1);
    const suffix = ` per ${shortUnit(unit)}${isRent ? ' per year' : ''}`;
    // A value that rounds to nothing carries no sign: never "-£0".
    const signed = (value: number, text: string) => (value > 0 ? `+${text}` : value < 0 ? `-${text}` : text);

    return {
        unit,
        subject,
        comparable: comparable.perArea,
        difference,
        differencePercent,
        position,
        formatted: {
            subject: `${money(subject, pence)}${suffix}`,
            comparable: `${money(comparable.perArea, pence)}${suffix}`,
            difference: `${signed(difference, money(Math.abs(difference), pence))}${suffix}`,
            differencePercent: signed(differencePercent, formatRate(Math.abs(differencePercent))),
            sentence:
                position === 'same'
                    ? 'In line with the comparable average'
                    : `${formatRate(Math.abs(differencePercent))} ${position} the comparable average`,
        },
    };
}
