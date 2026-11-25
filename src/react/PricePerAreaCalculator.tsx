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
import {
    amountText,
    Hints,
    MoneyField,
    NumberField,
    oneOf,
    parseAmount,
    parseNumber,
    ResultRows,
    SelectField,
    Status,
} from './fields';
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
    /** Defaults to `"sqft"`, as does a value that is not an area unit. */
    defaultAreaUnit?: AreaUnit;
    /** A comparable average to set the result against, in pounds per `defaultAreaUnit` (per year, for a letting). */
    defaultComparable?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: PricePerAreaSummary | null) => void;
};

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
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-price-per-area', className);
    const [basis, setBasis] = useState<Basis>(() => oneOf(BASES, defaultBasis, 'sale'));
    const [priceText, setPriceText] = useState(amountText(defaultAmount));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(() =>
        oneOf(RENT_PERIODS, defaultRentPeriod, RENTAL_YIELD_DEFAULTS.rentPeriod),
    );
    const [areaText, setAreaText] = useState(defaultArea ? String(defaultArea) : '');
    const [areaUnit, setAreaUnit] = useState<AreaUnit>(() => oneOf(AREA_UNITS, defaultAreaUnit, 'sqft'));
    const [comparableText, setComparableText] = useState(amountText(defaultComparable));

    const isRent = basis === 'rent';
    // Memoised on the numbers, not the text, so retyping 1000000 as 1,000,000 reports nothing new.
    const amount = parseAmount(priceText, Number.NaN);
    const area = parseNumber(areaText, Number.NaN);
    const period = isRent ? rentPeriod : undefined;
    const input = useMemo(() => ({ amount, area, areaUnit, rentPeriod: period }), [amount, area, areaUnit, period]);
    const { summary, error } = useMemo(() => getPricePerAreaSummary(input), [input]);
    // An empty box means no comparable: the calculator refuses the NaN and no comparison is shown.
    const perArea = parseAmount(comparableText, Number.NaN);
    const comparable = useMemo(() => ({ perArea, unit: areaUnit }), [perArea, areaUnit]);
    const comparison = useMemo(() => comparePricePerArea(input, comparable), [input, comparable]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    const unit = AREA_UNITS.find((option) => option.value === areaUnit)?.short;

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid" aria-describedby={error ? statusId : undefined}>
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
                    value={priceText}
                    onChange={setPriceText}
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

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
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
                        cx={cx}
                        make={(api, options) =>
                            api.pricePerAreaPdf({ ...input, comparable: comparison ? comparable : undefined }, options)
                        }
                    />
                </>
            )}
        </div>
    );
}
