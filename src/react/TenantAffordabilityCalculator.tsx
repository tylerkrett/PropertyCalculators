import { useEffect, useId, useMemo, useState } from 'react';

import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import {
    getTenantAffordabilitySummary,
    TENANT_AFFORDABILITY_DEFAULTS,
    TENANT_AFFORDABILITY_LIMITS,
    TENANT_AFFORDABILITY_NOTICE,
    type TenantAffordabilitySummary,
} from '../tenant-affordability/index';
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

export type TenantAffordabilityCalculatorProps = BaseProps & {
    /** Rent to start with, for the whole property, in pounds per `defaultRentPeriod`. */
    defaultRent?: number;
    /** The period the rent is quoted for. Defaults to `"month"`, as does a value that is not a rent period. */
    defaultRentPeriod?: RentPeriod;
    /** The tenants' combined annual income to check, in pounds. Left out, only the income needed is shown. */
    defaultIncome?: number;
    /** How many tenants share the rent. Defaults to 1. */
    defaultTenants?: number;
    /** Annual income needed as a multiple of the monthly rent. Defaults to 30. */
    defaultMultiple?: number;
    /** A guarantor's income needed as a multiple of the monthly rent. Defaults to 36. */
    defaultGuarantorMultiple?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: TenantAffordabilitySummary | null) => void;
};

const { multiple: MULTIPLE, tenants: TENANTS } = TENANT_AFFORDABILITY_LIMITS;

/** The income a rent needs to pass referencing and, given an income, whether it passes and the most rent it supports. */
export function TenantAffordabilityCalculator({
    defaultRent,
    defaultRentPeriod = TENANT_AFFORDABILITY_DEFAULTS.rentPeriod,
    defaultIncome,
    defaultTenants = TENANT_AFFORDABILITY_DEFAULTS.tenants,
    defaultMultiple = TENANT_AFFORDABILITY_DEFAULTS.multiple,
    defaultGuarantorMultiple = TENANT_AFFORDABILITY_DEFAULTS.guarantorMultiple,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: TenantAffordabilityCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-tenant-affordability', className);
    const [rentText, setRentText] = useState(amountText(defaultRent));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(() =>
        oneOf(RENT_PERIODS, defaultRentPeriod, TENANT_AFFORDABILITY_DEFAULTS.rentPeriod),
    );
    const [incomeText, setIncomeText] = useState(amountText(defaultIncome));
    const [tenantsText, setTenantsText] = useState(String(defaultTenants));
    const [multipleText, setMultipleText] = useState(String(defaultMultiple));
    const [guarantorText, setGuarantorText] = useState(String(defaultGuarantorMultiple));

    // Memoised on the numbers, not the text, so retyping 1200 as 1,200 reports nothing new.
    // An empty income box means no income to check; the other empty boxes fall back to their defaults.
    const rent = parseAmount(rentText, Number.NaN);
    const income = incomeText.trim() === '' ? undefined : parseAmount(incomeText, Number.NaN);
    const tenants = parseNumber(tenantsText, TENANT_AFFORDABILITY_DEFAULTS.tenants);
    const multiple = parseNumber(multipleText, TENANT_AFFORDABILITY_DEFAULTS.multiple);
    const guarantorMultiple = parseNumber(guarantorText, TENANT_AFFORDABILITY_DEFAULTS.guarantorMultiple);
    const input = useMemo(
        () => ({ rent, rentPeriod, income, tenants, multiple, guarantorMultiple }),
        [rent, rentPeriod, income, tenants, multiple, guarantorMultiple],
    );
    const { summary, error } = useMemo(() => getTenantAffordabilitySummary(input), [input]);

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
                    value={rentPeriod}
                    onChange={setRentPeriod}
                    options={RENT_PERIODS}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}income`}
                    label="Combined annual income (optional)"
                    value={incomeText}
                    onChange={setIncomeText}
                />
                <NumberField
                    cx={cx}
                    id={`${id}tenants`}
                    label="Tenants"
                    min={TENANTS.min}
                    max={TENANTS.max}
                    step={1}
                    value={tenantsText}
                    onChange={setTenantsText}
                />
                <NumberField
                    cx={cx}
                    id={`${id}multiple`}
                    label="Income multiple (× monthly rent)"
                    min={MULTIPLE.min}
                    max={MULTIPLE.max}
                    value={multipleText}
                    onChange={setMultipleText}
                />
                <NumberField
                    cx={cx}
                    id={`${id}guarantor`}
                    label="Guarantor multiple (× monthly rent)"
                    min={MULTIPLE.min}
                    max={MULTIPLE.max}
                    value={guarantorText}
                    onChange={setGuarantorText}
                />
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <Hints cx={cx} lines={[TENANT_AFFORDABILITY_NOTICE]} />
                    <PdfButton
                        pdf={pdf}
                        filename={`tenant-affordability-${input.rent}.pdf`}
                        cx={cx}
                        make={(api, options) => api.tenantAffordabilityPdf(input, options)}
                    />
                </>
            )}
            {!summary && <Hints cx={cx} lines={[TENANT_AFFORDABILITY_NOTICE]} />}
        </div>
    );
}
