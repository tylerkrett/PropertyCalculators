import { useEffect, useId, useMemo, useState } from 'react';

import {
    AREA_UNITS,
    type AreaUnit,
    comparePricePerArea,
    getPricePerAreaSummary,
    type PricePerArea,
    type PricePerAreaSummary,
} from '../price-per-area/index';
import { RENT_PERIODS, RENTAL_YIELD_DEFAULTS, type RentPeriod } from '../rental-yield/index';
import { formatNumber } from '../stamp-duty/format';
import { Hints, MoneyField, NumberField, parseAmount, parseNumber, ResultRows, SelectField } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

/** `"sale"` for a price, `"rent"` for a letting. */
type Basis = PricePerArea['basis'];

const BASES = [
    { value: 'sale', label: 'For sale' },
    { value: 'rent', label: 'To let' },
] as const satisfies readonly { value: Basis; label: string }[];

export type PricePerAreaCalculatorProps = BaseProps & {
    /** `"sale"` (the default) for a price, `"rent"` for a letting. */
    defaultBasis?: Basis;
    /** The price to start with, or the rent per `defaultRentPeriod` for a letting, in pounds. */
    defaultAmount?: number;
    /** How often the rent is paid. Only used for a letting. Defaults to `"month"`. */
    defaultRentPeriod?: RentPeriod;
    /** Floor area to start with, in `defaultAreaUnit`. */
    defaultArea?: number;
    /** Defaults to `"sqft"`. */
    defaultAreaUnit?: AreaUnit;
    /** A comparable average to set the result against, in pounds per `defaultAreaUnit` (per year, for a letting). */
    defaultComparable?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: PricePerAreaSummary | null) => void;
};

/** The text an amount starts as, keeping pence when it has them: `"1,150"`, `"45.50"`. */
const text = (value: number | undefined) => (value ? formatNumber(value, Number.isInteger(value) ? 0 : 2) : '');

/** Price per square foot and square metre, for a sale or a letting, against an optional comparable. */
export function PricePerAreaCalculator({
    defaultBasis = 'sale',
    defaultAmount,
    defaultRentPeriod = RENTAL_YIELD_DEFAULTS.rentPeriod,
    defaultArea,
    defaultAreaUnit = 'sqft',
    defaultComparable,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: PricePerAreaCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-price-per-area', className);
    const [basis, setBasis] = useState<Basis>(defaultBasis);
    const [amountText, setAmountText] = useState(text(defaultAmount));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(defaultRentPeriod);
    const [areaText, setAreaText] = useState(defaultArea ? String(defaultArea) : '');
    const [areaUnit, setAreaUnit] = useState<AreaUnit>(defaultAreaUnit);
    const [comparableText, setComparableText] = useState(text(defaultComparable));

    const isRent = basis === 'rent';
    const input = useMemo(
        () => ({
            amount: parseAmount(amountText, Number.NaN),
            area: parseNumber(areaText, Number.NaN),
            areaUnit,
            rentPeriod: isRent ? rentPeriod : undefined,
        }),
        [amountText, areaText, areaUnit, isRent, rentPeriod],
    );
    const { summary, error } = useMemo(() => getPricePerAreaSummary(input), [input]);
    // An empty box means no comparable: the calculator refuses the NaN and no comparison is shown.
    const comparable = useMemo(
        () => ({ perArea: parseAmount(comparableText, Number.NaN), unit: areaUnit }),
        [comparableText, areaUnit],
    );
    const comparison = useMemo(() => comparePricePerArea(input, comparable), [input, comparable]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    const unit = AREA_UNITS.find((option) => option.value === areaUnit)?.short;

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid">
                <SelectField
                    cx={cx}
                    id={`${id}basis`}
                    label="Listing"
                    value={basis}
                    onChange={setBasis}
                    options={BASES}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}amount`}
                    label={isRent ? 'Rent' : 'Property price'}
                    value={amountText}
                    onChange={setAmountText}
                />
                {isRent && (
                    <SelectField
                        cx={cx}
                        id={`${id}period`}
                        label="Rent is paid"
                        value={rentPeriod}
                        onChange={setRentPeriod}
                        options={RENT_PERIODS}
                    />
                )}
                <NumberField
                    cx={cx}
                    id={`${id}area`}
                    label="Floor area"
                    min={0}
                    step={1}
                    value={areaText}
                    onChange={setAreaText}
                />
                <SelectField
                    cx={cx}
                    id={`${id}unit`}
                    label="Area unit"
                    value={areaUnit}
                    onChange={setAreaUnit}
                    options={AREA_UNITS}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}comparable`}
                    label={`Comparable average per ${unit}${isRent ? ' per year' : ''} (optional)`}
                    value={comparableText}
                    onChange={setComparableText}
                />
            </div>

            {summary ? (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <Hints
                        cx={cx}
                        lines={[
                            comparison && `${comparison.formatted.sentence} of ${comparison.formatted.comparable}.`,
                        ]}
                    />
                    <PdfButton
                        pdf={pdf}
                        filename={`price-per-area-${input.amount}.pdf`}
                        className={cx('download')}
                        make={(api, options) =>
                            api.pricePerAreaPdf({ ...input, comparable: comparison ? comparable : undefined }, options)
                        }
                    />
                </>
            ) : (
                <Hints cx={cx} lines={[error]} />
            )}
        </div>
    );
}
