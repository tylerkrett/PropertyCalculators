import { useEffect, useId, useMemo, useState } from 'react';

import {
    getLandlordIncomeSummary,
    LANDLORD_COSTS,
    LANDLORD_INCOME_DEFAULTS,
    LANDLORD_INCOME_LIMITS,
    LANDLORD_INCOME_NOTICE,
    LANDLORD_TAX_YEAR_OPTIONS,
    type LandlordCostKey,
    type LandlordIncomeInput,
    type LandlordIncomeSummary,
    type LandlordTaxYearKey,
} from '../landlord-income/index';
import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import {
    amountText,
    CheckField,
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

type Costs<T> = Partial<Record<LandlordCostKey, T>>;

/** Props for `LandlordIncomeCalculator`. Every `default*` prop is a starting value the visitor can change. */
export type LandlordIncomeCalculatorProps = BaseProps & {
    /** Rent to start with, in pounds per `defaultRentPeriod`. */
    defaultRent?: number;
    /** How often the rent is paid. Defaults to `"month"`. */
    defaultRentPeriod?: RentPeriod;
    /** Weeks a year the property stands empty. Defaults to 0. */
    defaultVoidWeeks?: number;
    /** The letting agent's fee, percent of the rent collected. Defaults to 0. */
    defaultManagementFeePercent?: number;
    /** Whether that percentage already includes VAT. Defaults to `false`: 20% is added on top. */
    defaultFeesIncludeVat?: boolean;
    /** Mortgage interest for the year, in pounds. */
    defaultMortgageInterest?: number;
    /** Yearly costs to start with, in pounds, by key: `{ insurance: 300, maintenance: 900 }`. */
    defaultCosts?: Costs<number>;
    /** The landlord's other taxable income for the year, in pounds, such as salary. */
    defaultOtherIncome?: number;
    /** Defaults to the current tax year, `"2026-27"`. */
    defaultTaxYear?: LandlordTaxYearKey;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: LandlordIncomeSummary | null) => void;
};

/** One entry per named cost, built from its key. */
const eachCost = <T,>(value: (key: LandlordCostKey) => T) =>
    Object.fromEntries(LANDLORD_COSTS.map(({ key }) => [key, value(key)])) as Costs<T>;

/**
 * What an individual landlord keeps from a let property in a year: rent after empty weeks, the
 * agent's fee, running costs, mortgage interest and income tax. A guide only, not tax advice.
 */
export function LandlordIncomeCalculator({
    defaultRent,
    defaultRentPeriod = LANDLORD_INCOME_DEFAULTS.rentPeriod,
    defaultVoidWeeks = LANDLORD_INCOME_DEFAULTS.voidWeeks,
    defaultManagementFeePercent = LANDLORD_INCOME_DEFAULTS.managementFeePercent,
    defaultFeesIncludeVat = LANDLORD_INCOME_DEFAULTS.feesIncludeVat,
    defaultMortgageInterest,
    defaultCosts,
    defaultOtherIncome,
    defaultTaxYear = LANDLORD_INCOME_DEFAULTS.taxYear,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: LandlordIncomeCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-landlord-income', className);
    const [rentText, setRentText] = useState(amountText(defaultRent));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(() =>
        oneOf(RENT_PERIODS, defaultRentPeriod, LANDLORD_INCOME_DEFAULTS.rentPeriod),
    );
    const [voidText, setVoidText] = useState(String(defaultVoidWeeks));
    const [feeText, setFeeText] = useState(String(defaultManagementFeePercent));
    const [feesIncludeVat, setFeesIncludeVat] = useState(defaultFeesIncludeVat === true);
    const [interestText, setInterestText] = useState(amountText(defaultMortgageInterest));
    const [costTexts, setCostTexts] = useState(() => eachCost((key) => amountText(defaultCosts?.[key])));
    const [otherIncomeText, setOtherIncomeText] = useState(amountText(defaultOtherIncome));
    const [taxYear, setTaxYear] = useState<LandlordTaxYearKey>(() =>
        oneOf(LANDLORD_TAX_YEAR_OPTIONS, defaultTaxYear, LANDLORD_INCOME_DEFAULTS.taxYear),
    );

    // Memoised on the numbers, not the text, so retyping 1200 as 1,200 reports nothing new.
    const rent = parseAmount(rentText, Number.NaN);
    // An empty box for anything but the rent is none of it.
    const voidWeeks = parseNumber(voidText, 0);
    const managementFeePercent = parseNumber(feeText, 0);
    const mortgageInterest = parseAmount(interestText, 0);
    const otherIncome = parseAmount(otherIncomeText, 0);
    const costs = LANDLORD_COSTS.map(({ key }) => parseAmount(costTexts[key] ?? '', 0));
    const input = useMemo(
        (): LandlordIncomeInput => ({
            rent,
            rentPeriod,
            voidWeeks,
            managementFeePercent,
            feesIncludeVat,
            mortgageInterest,
            ...eachCost((key) => parseAmount(costTexts[key] ?? '', 0)),
            otherIncome,
            taxYear,
        }),
        // The cost list is fixed, so this is always the same number of dependencies.
        [
            rent,
            rentPeriod,
            voidWeeks,
            managementFeePercent,
            feesIncludeVat,
            mortgageInterest,
            otherIncome,
            taxYear,
            ...costs,
        ],
    );
    const { summary, error } = useMemo(() => getLandlordIncomeSummary(input), [input]);

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
                    label="Rent is paid"
                    value={rentPeriod}
                    onChange={setRentPeriod}
                    options={RENT_PERIODS}
                />
                <NumberField
                    cx={cx}
                    id={`${id}void`}
                    label="Empty weeks per year"
                    step={1}
                    min={LANDLORD_INCOME_LIMITS.voidWeeks.min}
                    max={LANDLORD_INCOME_LIMITS.voidWeeks.max}
                    value={voidText}
                    onChange={setVoidText}
                />
                <NumberField
                    cx={cx}
                    id={`${id}fee`}
                    label="Management fee (% of rent)"
                    step={0.5}
                    min={LANDLORD_INCOME_LIMITS.managementFeePercent.min}
                    max={LANDLORD_INCOME_LIMITS.managementFeePercent.max}
                    value={feeText}
                    onChange={setFeeText}
                />
                <CheckField
                    cx={cx}
                    id={`${id}vat`}
                    label="The fee already includes VAT"
                    checked={feesIncludeVat}
                    onChange={setFeesIncludeVat}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}interest`}
                    label="Mortgage interest per year"
                    value={interestText}
                    onChange={setInterestText}
                />
                {LANDLORD_COSTS.map(({ key, label }) => (
                    <MoneyField
                        key={key}
                        cx={cx}
                        id={`${id}${key}`}
                        label={`${label} per year`}
                        value={costTexts[key] ?? ''}
                        onChange={(value) => setCostTexts((texts) => ({ ...texts, [key]: value }))}
                    />
                ))}
                <MoneyField
                    cx={cx}
                    id={`${id}other`}
                    label="Your other income per year, before tax"
                    value={otherIncomeText}
                    onChange={setOtherIncomeText}
                />
                <SelectField
                    cx={cx}
                    id={`${id}year`}
                    label="Tax year"
                    value={taxYear}
                    onChange={setTaxYear}
                    options={LANDLORD_TAX_YEAR_OPTIONS}
                />
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <Hints cx={cx} lines={[...summary.notes, LANDLORD_INCOME_NOTICE]} />
                    <PdfButton
                        pdf={pdf}
                        filename={`landlord-income-${summary.taxYear}.pdf`}
                        cx={cx}
                        make={(api, options) => api.landlordIncomePdf(input, options)}
                    />
                </>
            )}
            {!summary && <Hints cx={cx} lines={[LANDLORD_INCOME_NOTICE]} />}
        </div>
    );
}
