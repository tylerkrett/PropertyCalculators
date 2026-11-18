import { useEffect, useId, useMemo, useState } from 'react';

import { MORTGAGE_DEFAULTS } from '../mortgage/index';
import {
    FEE_PAYMENTS,
    type FeePayment,
    getRemortgageSummary,
    REMORTGAGE_DEFAULTS,
    REMORTGAGE_LIMITS,
    type RemortgageSummary,
} from '../overpayment/index';
import {
    amountText,
    Hints,
    MoneyField,
    NumberField,
    parseAmount,
    parseNumber,
    ResultRows,
    SelectField,
} from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type RemortgageCalculatorProps = BaseProps & {
    /** What is still owed to start with, in pounds. */
    defaultBalance?: number;
    /** Annual rate, percent, paid by staying on the current deal. */
    defaultCurrentRate?: number;
    /** Annual rate, percent, on the new deal. */
    defaultNewRate?: number;
    /** Whole years left on the mortgage. Defaults to 25. */
    defaultTermYears?: number;
    /** The new deal's product fee, in pounds. */
    defaultProductFee?: number;
    /** Charge for leaving the current deal early, in pounds. */
    defaultEarlyRepaymentCharge?: number;
    /** Whether the product fee is paid in cash or borrowed. Defaults to `"upfront"`. */
    defaultFeePayment?: FeePayment;
    /** Years the new rate is fixed for: the period compared. Defaults to 2. */
    defaultFixedYears?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: RemortgageSummary | null) => void;
};

const rateText = (rate: number | undefined) => (rate === undefined ? '' : String(rate));

/** Is a new deal worth switching to: the monthly saving, the cost of switching and the break-even. */
export function RemortgageCalculator({
    defaultBalance,
    defaultCurrentRate,
    defaultNewRate,
    defaultTermYears = MORTGAGE_DEFAULTS.term,
    defaultProductFee,
    defaultEarlyRepaymentCharge,
    defaultFeePayment = REMORTGAGE_DEFAULTS.feePayment,
    defaultFixedYears = REMORTGAGE_DEFAULTS.fixedYears,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: RemortgageCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-remortgage', className);
    const [balanceText, setBalanceText] = useState(amountText(defaultBalance));
    const [currentRate, setCurrentRate] = useState(rateText(defaultCurrentRate));
    const [newRate, setNewRate] = useState(rateText(defaultNewRate));
    const [term, setTerm] = useState(String(defaultTermYears));
    const [feeText, setFeeText] = useState(amountText(defaultProductFee));
    const [chargeText, setChargeText] = useState(amountText(defaultEarlyRepaymentCharge));
    const [feePayment, setFeePayment] = useState<FeePayment>(defaultFeePayment);
    const [fixedYears, setFixedYears] = useState(String(defaultFixedYears));

    const input = useMemo(
        () => ({
            balance: parseAmount(balanceText, Number.NaN),
            currentRate: parseNumber(currentRate, Number.NaN),
            newRate: parseNumber(newRate, Number.NaN),
            termYears: parseNumber(term, Number.NaN),
            productFee: parseAmount(feeText, 0),
            earlyRepaymentCharge: parseAmount(chargeText, 0),
            feePayment,
            fixedYears: parseNumber(fixedYears, Number.NaN),
        }),
        [balanceText, currentRate, newRate, term, feeText, chargeText, feePayment, fixedYears],
    );
    const { summary, error } = useMemo(() => getRemortgageSummary(input), [input]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    const rate = (key: string, label: string, value: string, set: (value: string) => void) => (
        <NumberField
            cx={cx}
            id={`${id}${key}`}
            label={label}
            step={0.05}
            min={REMORTGAGE_LIMITS.rate.min}
            max={REMORTGAGE_LIMITS.rate.max}
            value={value}
            onChange={set}
        />
    );

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid">
                <MoneyField
                    cx={cx}
                    id={`${id}balance`}
                    label="Mortgage balance"
                    value={balanceText}
                    onChange={setBalanceText}
                />
                {rate('current', 'Current rate (%)', currentRate, setCurrentRate)}
                {rate('new', 'New rate (%)', newRate, setNewRate)}
                <NumberField
                    cx={cx}
                    id={`${id}term`}
                    label="Years left"
                    min={1}
                    max={REMORTGAGE_LIMITS.termMonths.max / 12}
                    value={term}
                    onChange={setTerm}
                />
                <MoneyField cx={cx} id={`${id}fee`} label="Product fee" value={feeText} onChange={setFeeText} />
                <MoneyField
                    cx={cx}
                    id={`${id}charge`}
                    label="Early repayment charge"
                    value={chargeText}
                    onChange={setChargeText}
                />
                <SelectField
                    cx={cx}
                    id={`${id}payment`}
                    label="Product fee is"
                    value={feePayment}
                    onChange={setFeePayment}
                    options={FEE_PAYMENTS}
                />
                <NumberField
                    cx={cx}
                    id={`${id}fixed`}
                    label="Fixed period (years)"
                    min={REMORTGAGE_LIMITS.fixedYears.min}
                    max={REMORTGAGE_LIMITS.fixedYears.max}
                    value={fixedYears}
                    onChange={setFixedYears}
                />
            </div>

            {summary ? (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <PdfButton
                        pdf={pdf}
                        filename={`remortgage-${input.balance}.pdf`}
                        className={cx('download')}
                        make={(api, options) => api.remortgagePdf(input, options)}
                    />
                </>
            ) : (
                <Hints cx={cx} lines={[error]} />
            )}
        </div>
    );
}
