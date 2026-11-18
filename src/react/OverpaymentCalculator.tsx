import { useEffect, useId, useMemo, useState } from 'react';

import { MORTGAGE_DEFAULTS } from '../mortgage/index';
import { getOverpaymentSummary, OVERPAYMENT_LIMITS, type OverpaymentSummary } from '../overpayment/index';
import { amountText, Hints, MoneyField, NumberField, parseAmount, parseNumber, ResultRows } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type OverpaymentCalculatorProps = BaseProps & {
    /** What is still owed to start with, in pounds. */
    defaultBalance?: number;
    /** Annual interest rate, percent. Defaults to 4.5. */
    defaultRate?: number;
    /** Whole years left on the mortgage. Defaults to 25. */
    defaultTermYears?: number;
    /** Extra paid every month, in pounds. */
    defaultMonthlyOverpayment?: number;
    /** One-off payment made today, in pounds. */
    defaultLumpSum?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: OverpaymentSummary | null) => void;
};

/** What overpaying a repayment mortgage saves: the interest, and how much sooner it is paid off. */
export function OverpaymentCalculator({
    defaultBalance,
    defaultRate = MORTGAGE_DEFAULTS.rate,
    defaultTermYears = MORTGAGE_DEFAULTS.term,
    defaultMonthlyOverpayment,
    defaultLumpSum,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: OverpaymentCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-overpayment', className);
    const [balanceText, setBalanceText] = useState(amountText(defaultBalance));
    const [rate, setRate] = useState(String(defaultRate));
    const [term, setTerm] = useState(String(defaultTermYears));
    const [monthlyText, setMonthlyText] = useState(amountText(defaultMonthlyOverpayment));
    const [lumpSumText, setLumpSumText] = useState(amountText(defaultLumpSum));

    const input = useMemo(
        () => ({
            balance: parseAmount(balanceText, Number.NaN),
            rate: parseNumber(rate, Number.NaN),
            termYears: parseNumber(term, Number.NaN),
            monthlyOverpayment: parseAmount(monthlyText, 0),
            lumpSum: parseAmount(lumpSumText, 0),
        }),
        [balanceText, rate, term, monthlyText, lumpSumText],
    );
    const { summary, error } = useMemo(() => getOverpaymentSummary(input), [input]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

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
                <NumberField
                    cx={cx}
                    id={`${id}rate`}
                    label="Interest rate (%)"
                    step={0.05}
                    min={OVERPAYMENT_LIMITS.rate.min}
                    max={OVERPAYMENT_LIMITS.rate.max}
                    value={rate}
                    onChange={setRate}
                />
                <NumberField
                    cx={cx}
                    id={`${id}term`}
                    label="Years left"
                    min={1}
                    max={OVERPAYMENT_LIMITS.termMonths.max / 12}
                    value={term}
                    onChange={setTerm}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}monthly`}
                    label="Monthly overpayment"
                    value={monthlyText}
                    onChange={setMonthlyText}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}lump`}
                    label="Lump sum paid today"
                    value={lumpSumText}
                    onChange={setLumpSumText}
                />
            </div>

            {summary ? (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <PdfButton
                        pdf={pdf}
                        filename={`overpayment-${input.balance}.pdf`}
                        className={cx('download')}
                        make={(api, options) => api.overpaymentPdf(input, options)}
                    />
                </>
            ) : (
                <Hints cx={cx} lines={[error]} />
            )}
        </div>
    );
}
