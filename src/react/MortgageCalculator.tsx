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
import { formatNumber, parsePrice } from '../stamp-duty/format';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type MortgageCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Deposit to start with, in pounds. Defaults to 25% of `defaultPrice`. */
    defaultDeposit?: number;
    /** Annual interest rate, percent. */
    defaultRate?: number;
    defaultTermYears?: number;
    defaultType?: RepaymentType;
    /** Buyer type for the stamp duty in "cash needed upfront". */
    defaultBuyer?: BuyerType;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: MortgageSummary | null) => void;
};

const amount = (text: string) => (text.trim() === '' ? Number.NaN : parsePrice(text));

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
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-mortgage', className);
    const [priceText, setPriceText] = useState(defaultPrice ? formatNumber(defaultPrice) : '');
    const [depositText, setDepositText] = useState(() => {
        const deposit =
            defaultDeposit ??
            (defaultPrice ? depositFromPercent(defaultPrice, MORTGAGE_DEFAULTS.depositPercent) : undefined);
        return deposit === undefined ? '' : formatNumber(deposit);
    });
    const [rate, setRate] = useState(String(defaultRate));
    const [term, setTerm] = useState(String(defaultTermYears));
    const [type, setType] = useState<RepaymentType>(defaultType);
    const [buyer, setBuyer] = useState<BuyerType>(defaultBuyer);

    const input = useMemo(
        () => ({
            price: amount(priceText),
            deposit: amount(depositText),
            rate: rate.trim() === '' ? Number.NaN : Number(rate),
            termYears: Number(term),
            type,
            buyer,
        }),
        [priceText, depositText, rate, term, type, buyer],
    );
    const { summary, error } = useMemo(() => getMortgageSummary(input), [input]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    const money = (key: string, label: string, value: string, set: (value: string) => void) => (
        <div className={cx('field')}>
            <label className={cx('label')} htmlFor={`${id}${key}`}>
                {label}
            </label>
            <div className={cx('money')}>
                <span className={cx('prefix')} aria-hidden="true">
                    £
                </span>
                <input
                    id={`${id}${key}`}
                    className={cx('input')}
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={(event) => set(event.target.value)}
                />
            </div>
        </div>
    );

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid">
                {money('price', 'Property price', priceText, setPriceText)}
                {money('deposit', 'Deposit', depositText, setDepositText)}

                <div className={cx('field')}>
                    <label className={cx('label')} htmlFor={`${id}rate`}>
                        Interest rate (%)
                    </label>
                    <input
                        id={`${id}rate`}
                        className={cx('input')}
                        type="number"
                        step="0.05"
                        min={MORTGAGE_LIMITS.rate.min}
                        max={MORTGAGE_LIMITS.rate.max}
                        value={rate}
                        onChange={(event) => setRate(event.target.value)}
                    />
                </div>

                <div className={cx('field')}>
                    <label className={cx('label')} htmlFor={`${id}term`}>
                        Term (years)
                    </label>
                    <input
                        id={`${id}term`}
                        className={cx('input')}
                        type="number"
                        min={MORTGAGE_LIMITS.term.min}
                        max={MORTGAGE_LIMITS.term.max}
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                    />
                </div>

                <div className={cx('field')}>
                    <label className={cx('label')} htmlFor={`${id}type`}>
                        Type
                    </label>
                    <select
                        id={`${id}type`}
                        className={cx('select')}
                        value={type}
                        onChange={(event) => setType(event.target.value as RepaymentType)}
                    >
                        {REPAYMENT_TYPES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className={cx('field')}>
                    <label className={cx('label')} htmlFor={`${id}buyer`}>
                        Buyer (for stamp duty)
                    </label>
                    <select
                        id={`${id}buyer`}
                        className={cx('select')}
                        value={buyer}
                        onChange={(event) => setBuyer(event.target.value as BuyerType)}
                    >
                        {BUYER_TYPES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {summary ? (
                <>
                    <dl className={cx('rows')} aria-live="polite">
                        {summary.rows.map((row, index) => (
                            <div
                                key={row.key}
                                className={cx('row')}
                                data-key={row.key}
                                data-lead={index === 0 || undefined}
                            >
                                <dt>{row.label}</dt>
                                <dd>{row.formatted}</dd>
                            </div>
                        ))}
                    </dl>
                    <PdfButton
                        pdf={pdf}
                        filename={`mortgage-${input.price}.pdf`}
                        className={cx('download')}
                        make={(api, options) => api.mortgagePdf(input, options)}
                    />
                </>
            ) : (
                <p className={cx('hint')} role="status">
                    {error}
                </p>
            )}
        </div>
    );
}
