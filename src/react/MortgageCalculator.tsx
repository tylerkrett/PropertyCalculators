import { useEffect, useId, useMemo, useState } from 'react';

import {
    depositFromPercent,
    getMortgageSummary,
    MORTGAGE_DEFAULTS,
    MORTGAGE_LIMITS,
    type MortgageSummary,
    REPAYMENT_TYPES,
    type RepaymentType,
} from '../mortgage/index';
import { BUYER_TYPES, type BuyerType, DEFAULT_BUYER_TYPE } from '../stamp-duty/estimate';
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

export type MortgageCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Deposit to start with, in pounds. Defaults to 25% of `defaultPrice`. */
    defaultDeposit?: number;
    /** Annual interest rate, percent. */
    defaultRate?: number;
    defaultTermYears?: number;
    /** Defaults to `"repayment"`; a value that is not a repayment type falls back to it. */
    defaultType?: RepaymentType;
    /** Buyer type for the stamp duty in "cash needed upfront". An unknown value falls back to `"home-mover"`. */
    defaultBuyer?: BuyerType;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: MortgageSummary | null) => void;
};

/** Monthly mortgage payments, the interest over the term and the cash needed upfront. */
export function MortgageCalculator({
    defaultPrice,
    defaultDeposit,
    defaultRate = MORTGAGE_DEFAULTS.rate,
    defaultTermYears = MORTGAGE_DEFAULTS.term,
    defaultType = MORTGAGE_DEFAULTS.type,
    defaultBuyer = DEFAULT_BUYER_TYPE,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: MortgageCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-mortgage', className);
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [depositText, setDepositText] = useState(() => {
        const deposit =
            defaultDeposit ??
            (defaultPrice ? depositFromPercent(defaultPrice, MORTGAGE_DEFAULTS.depositPercent) : undefined);
        // A deposit of nothing is a real starting value here, so 0 shows as "0".
        return deposit === 0 ? '0' : amountText(deposit);
    });
    const [rateText, setRateText] = useState(String(defaultRate));
    const [termText, setTermText] = useState(String(defaultTermYears));
    const [type, setType] = useState<RepaymentType>(() => oneOf(REPAYMENT_TYPES, defaultType, MORTGAGE_DEFAULTS.type));
    const [buyer, setBuyer] = useState<BuyerType>(() => oneOf(BUYER_TYPES, defaultBuyer, DEFAULT_BUYER_TYPE));

    // Memoised on the numbers, not the text, so retyping 500000 as 500,000 reports nothing new.
    const price = parseAmount(priceText, Number.NaN);
    const deposit = parseAmount(depositText, Number.NaN);
    const rate = parseNumber(rateText, Number.NaN);
    const termYears = Number(termText);
    const input = useMemo(
        () => ({ price, deposit, rate, termYears, type, buyer }),
        [price, deposit, rate, termYears, type, buyer],
    );
    const { summary, error } = useMemo(() => getMortgageSummary(input), [input]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid" aria-describedby={error ? statusId : undefined}>
                <MoneyField
                    cx={cx}
                    id={`${id}price`}
                    label="Property price"
                    value={priceText}
                    onChange={setPriceText}
                />
                <MoneyField cx={cx} id={`${id}deposit`} label="Deposit" value={depositText} onChange={setDepositText} />
                <NumberField
                    cx={cx}
                    id={`${id}rate`}
                    label="Interest rate (%)"
                    step={0.05}
                    min={MORTGAGE_LIMITS.rate.min}
                    max={MORTGAGE_LIMITS.rate.max}
                    value={rateText}
                    onChange={setRateText}
                />
                <NumberField
                    cx={cx}
                    id={`${id}term`}
                    label="Term (years)"
                    min={MORTGAGE_LIMITS.term.min}
                    max={MORTGAGE_LIMITS.term.max}
                    value={termText}
                    onChange={setTermText}
                />
                <SelectField
                    cx={cx}
                    id={`${id}type`}
                    label="Type"
                    value={type}
                    onChange={setType}
                    options={REPAYMENT_TYPES}
                />
                <SelectField
                    cx={cx}
                    id={`${id}buyer`}
                    label="Buyer (for stamp duty)"
                    value={buyer}
                    onChange={setBuyer}
                    options={BUYER_TYPES}
                />
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <PdfButton
                        pdf={pdf}
                        filename={`mortgage-${input.price}.pdf`}
                        cx={cx}
                        make={(api, options) => api.mortgagePdf(input, options)}
                    />
                </>
            )}
        </div>
    );
}
