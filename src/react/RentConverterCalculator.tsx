import { useEffect, useId, useMemo, useState } from 'react';

import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import {
    getRentConversionSummary,
    RENT_CONVERTER_DEFAULTS,
    RENT_CONVERTER_LIMITS,
    type RentConversionSummary,
} from '../rent-converter/index';
import {
    amountText,
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

export type RentConverterCalculatorProps = BaseProps & {
    /** Rent to start with, for the whole property, in pounds per `defaultPeriod`. */
    defaultRent?: number;
    /** The period the rent is quoted for. Defaults to `"month"`, as does a value that is not a rent period. */
    defaultPeriod?: RentPeriod;
    /** How many tenants split the rent. Defaults to 1. */
    defaultTenants?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: RentConversionSummary | null) => void;
};

/** A rent per week, month, year and day, and each tenant's share of it. */
export function RentConverterCalculator({
    defaultRent,
    defaultPeriod = RENT_CONVERTER_DEFAULTS.period,
    defaultTenants = RENT_CONVERTER_DEFAULTS.tenants,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: RentConverterCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-rent-converter', className);
    const [rentText, setRentText] = useState(amountText(defaultRent));
    const [period, setPeriod] = useState<RentPeriod>(() =>
        oneOf(RENT_PERIODS, defaultPeriod, RENT_CONVERTER_DEFAULTS.period),
    );
    const [tenantsText, setTenantsText] = useState(String(defaultTenants));

    // Memoised on the numbers, not the text, so retyping 1200 as 1,200 reports nothing new.
    // An empty tenants box counts as one tenant; an empty rent box as missing.
    const rent = parseAmount(rentText, Number.NaN);
    const tenants = parseNumber(tenantsText, RENT_CONVERTER_DEFAULTS.tenants);
    const input = useMemo(() => ({ rent, period, tenants }), [rent, period, tenants]);
    const { summary, error } = useMemo(() => getRentConversionSummary(input), [input]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid" aria-describedby={error ? statusId : undefined}>
                <MoneyField cx={cx} id={`${id}rent`} label="Rent" value={rentText} onChange={setRentText} />
                <SelectField
                    cx={cx}
                    id={`${id}period`}
                    label="Rent is quoted"
                    value={period}
                    onChange={setPeriod}
                    options={RENT_PERIODS}
                />
                <NumberField
                    cx={cx}
                    id={`${id}tenants`}
                    label="Tenants"
                    min={RENT_CONVERTER_LIMITS.tenants.min}
                    max={RENT_CONVERTER_LIMITS.tenants.max}
                    step={1}
                    value={tenantsText}
                    onChange={setTenantsText}
                />
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <PdfButton
                        pdf={pdf}
                        filename={`rent-${input.rent}-per-${input.period}.pdf`}
                        cx={cx}
                        make={(api, options) => api.rentConverterPdf(input, options)}
                    />
                </>
            )}
        </div>
    );
}
