import { useEffect, useId, useMemo, useState } from 'react';

import {
    CAPITAL_GAINS_DEFAULTS,
    CAPITAL_GAINS_LIMITS,
    CAPITAL_GAINS_NOTICE,
    CAPITAL_GAINS_REPORTING_FROM,
    CAPITAL_GAINS_TAX_YEARS,
    type CapitalGainsSummary,
    type CapitalGainsTaxYear,
    getCapitalGainsSummary,
} from '../capital-gains/index';
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

/** The pounds boxes after the two prices, in display order. An empty one counts as 0. */
const AMOUNTS = [
    { key: 'buyingCosts', label: 'Costs of buying' },
    { key: 'sellingCosts', label: 'Costs of selling' },
    { key: 'improvements', label: 'Improvements' },
    { key: 'income', label: 'Your income this tax year' },
    { key: 'allowanceUsed', label: 'Tax-free allowance already used' },
] as const;

type AmountKey = (typeof AMOUNTS)[number]['key'];
type Amounts<T> = Record<AmountKey, T>;

export type CapitalGainsCalculatorProps = BaseProps & {
    /** Sale price of the whole property to start with, in pounds. */
    defaultSalePrice?: number;
    /** Purchase price of the whole property, in pounds. */
    defaultPurchasePrice?: number;
    /** Costs of buying, such as stamp duty and legal fees, in pounds. */
    defaultBuyingCosts?: number;
    /** Costs of selling, such as agent and legal fees, in pounds. */
    defaultSellingCosts?: number;
    /** Money spent on improvements, in pounds. */
    defaultImprovements?: number;
    /** Total income for the year before allowances, in pounds. */
    defaultIncome?: number;
    /** How much of the annual exempt amount is already used, in pounds. */
    defaultAllowanceUsed?: number;
    /** Percent of the property owned. Defaults to 100. */
    defaultShare?: number;
    /** Completion date as `YYYY-MM-DD`, for the report-and-pay deadline. */
    defaultCompletionDate?: string;
    /** The tax year the sale falls in. Defaults to `"2026-27"`, as does a value that is not a tax year. */
    defaultTaxYear?: CapitalGainsTaxYear;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: CapitalGainsSummary | null) => void;
};

/** One entry per optional amount, built from its key. */
const eachAmount = <T,>(value: (key: AmountKey) => T) =>
    Object.fromEntries(AMOUNTS.map(({ key }) => [key, value(key)])) as Amounts<T>;

/** Capital gains tax on selling a let property or second home, with the date to report and pay by. A guide, not tax advice. */
export function CapitalGainsCalculator({
    defaultSalePrice,
    defaultPurchasePrice,
    defaultBuyingCosts,
    defaultSellingCosts,
    defaultImprovements,
    defaultIncome,
    defaultAllowanceUsed,
    defaultShare = CAPITAL_GAINS_DEFAULTS.share,
    defaultCompletionDate,
    defaultTaxYear = CAPITAL_GAINS_DEFAULTS.taxYear,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: CapitalGainsCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-capital-gains', className);
    const defaults: Amounts<number | undefined> = {
        buyingCosts: defaultBuyingCosts,
        sellingCosts: defaultSellingCosts,
        improvements: defaultImprovements,
        income: defaultIncome,
        allowanceUsed: defaultAllowanceUsed,
    };
    const [saleText, setSaleText] = useState(amountText(defaultSalePrice));
    const [purchaseText, setPurchaseText] = useState(amountText(defaultPurchasePrice));
    const [amountTexts, setAmountTexts] = useState(() => eachAmount((key) => amountText(defaults[key])));
    const [shareText, setShareText] = useState(String(defaultShare));
    const [dateText, setDateText] = useState(typeof defaultCompletionDate === 'string' ? defaultCompletionDate : '');
    const [taxYear, setTaxYear] = useState<CapitalGainsTaxYear>(() =>
        oneOf(CAPITAL_GAINS_TAX_YEARS, defaultTaxYear, CAPITAL_GAINS_DEFAULTS.taxYear),
    );

    // Memoised on the numbers, not the text, so retyping 1500 as 1,500 reports nothing new.
    const salePrice = parseAmount(saleText, Number.NaN);
    const purchasePrice = parseAmount(purchaseText, Number.NaN);
    const amounts = AMOUNTS.map(({ key }) => parseAmount(amountTexts[key], 0));
    const share = parseNumber(shareText, Number.NaN);
    const input = useMemo(
        () => ({
            salePrice,
            purchasePrice,
            ...eachAmount((key) => parseAmount(amountTexts[key], 0)),
            share,
            taxYear,
            // An empty date box is no date: the result then has no deadline.
            completionDate: dateText === '' ? undefined : dateText,
        }),
        // The list of amounts is fixed, so this is always the same number of dependencies.
        [salePrice, purchasePrice, share, taxYear, dateText, ...amounts],
    );
    const { summary, error } = useMemo(() => getCapitalGainsSummary(input), [input]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid" aria-describedby={error ? statusId : undefined}>
                <MoneyField cx={cx} id={`${id}sale`} label="Sale price" value={saleText} onChange={setSaleText} />
                <MoneyField
                    cx={cx}
                    id={`${id}purchase`}
                    label="Purchase price"
                    value={purchaseText}
                    onChange={setPurchaseText}
                />
                {AMOUNTS.map(({ key, label }) => (
                    <MoneyField
                        key={key}
                        cx={cx}
                        id={`${id}${key}`}
                        label={label}
                        value={amountTexts[key]}
                        onChange={(value) => setAmountTexts((texts) => ({ ...texts, [key]: value }))}
                    />
                ))}
                <NumberField
                    cx={cx}
                    id={`${id}share`}
                    label="Share you own (%)"
                    value={shareText}
                    onChange={setShareText}
                    min={CAPITAL_GAINS_LIMITS.share.min}
                    max={CAPITAL_GAINS_LIMITS.share.max}
                />
                <SelectField
                    cx={cx}
                    id={`${id}taxYear`}
                    label="Tax year of the sale"
                    value={taxYear}
                    onChange={setTaxYear}
                    options={CAPITAL_GAINS_TAX_YEARS}
                />
                <div className={cx('field')}>
                    <label className={cx('label')} htmlFor={`${id}date`}>
                        Completion date (optional)
                    </label>
                    <input
                        id={`${id}date`}
                        className={cx('input')}
                        type="date"
                        min={CAPITAL_GAINS_REPORTING_FROM}
                        value={dateText}
                        onChange={(event) => setDateText(event.target.value)}
                    />
                </div>
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <Hints cx={cx} lines={[...summary.notes, CAPITAL_GAINS_NOTICE]} />
                    <PdfButton
                        pdf={pdf}
                        filename={`capital-gains-tax-${input.salePrice}.pdf`}
                        cx={cx}
                        make={(api, options) => api.capitalGainsPdf(input, options)}
                    />
                </>
            )}
            {!summary && <Hints cx={cx} lines={[CAPITAL_GAINS_NOTICE]} />}
        </div>
    );
}
