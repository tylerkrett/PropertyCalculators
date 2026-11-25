import { useEffect, useId, useMemo, useState } from 'react';

import {
    BORROWER_TYPES,
    type BorrowerType,
    BUY_TO_LET_DEFAULTS,
    BUY_TO_LET_LIMITS,
    type BuyToLetInput,
    type BuyToLetSummary,
    getBuyToLetSummary,
} from '../buy-to-let/index';
import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
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

/** Props for `BuyToLetCalculator`. Every `default*` prop is a starting value the visitor can change. */
export type BuyToLetCalculatorProps = BaseProps & {
    /** Rent to start with, in pounds per `defaultRentPeriod`. */
    defaultRent?: number;
    /** How often the rent is paid. Defaults to `"month"`. */
    defaultRentPeriod?: RentPeriod;
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Deposit to start with, in pounds. The loan is the price less the deposit. */
    defaultDeposit?: number;
    /** Annual interest rate the rent is tested against, percent. Defaults to 5.5. */
    defaultStressRate?: number;
    /** Who is borrowing, which sets the cover required: 125% or 145%. Defaults to `"basic-rate"`. */
    defaultBorrower?: BorrowerType;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: BuyToLetSummary | null) => void;
};

/** The verdict as a sentence: what the rent achieves against what the lender asks for. */
const verdictLine = ({ verdict, formatted }: BuyToLetSummary) =>
    `${verdict}: the rent covers the stressed interest by ${formatted.coverRatio}, and the lender needs ${formatted.requiredCoverRatio}.`;

/**
 * A buy-to-let mortgage check: whether the rent covers the interest on the loan, at a stress rate,
 * by the ratio a typical lender asks for. An illustration, not a lender's decision.
 */
export function BuyToLetCalculator({
    defaultRent,
    defaultRentPeriod = BUY_TO_LET_DEFAULTS.rentPeriod,
    defaultPrice,
    defaultDeposit,
    defaultStressRate = BUY_TO_LET_DEFAULTS.stressRate,
    defaultBorrower = BUY_TO_LET_DEFAULTS.borrower,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: BuyToLetCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-buy-to-let', className);
    const [rentText, setRentText] = useState(amountText(defaultRent));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(() =>
        oneOf(RENT_PERIODS, defaultRentPeriod, BUY_TO_LET_DEFAULTS.rentPeriod),
    );
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [depositText, setDepositText] = useState(amountText(defaultDeposit));
    const [stressRate, setStressRate] = useState(String(defaultStressRate));
    const [borrower, setBorrower] = useState<BorrowerType>(() =>
        oneOf(BORROWER_TYPES, defaultBorrower, BUY_TO_LET_DEFAULTS.borrower),
    );

    // Memoised on the numbers, not the text, so retyping 1200 as 1,200 reports nothing new.
    const rent = parseAmount(rentText, Number.NaN);
    const price = parseAmount(priceText, Number.NaN);
    // An empty deposit box is a purchase with no deposit.
    const deposit = parseAmount(depositText, 0);
    const stress = parseNumber(stressRate, Number.NaN);
    const input = useMemo(
        (): BuyToLetInput => ({ rent, rentPeriod, price, deposit, stressRate: stress, borrower }),
        [rent, rentPeriod, price, deposit, stress, borrower],
    );
    const { summary, error } = useMemo(() => getBuyToLetSummary(input), [input]);

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
                    id={`${id}stress`}
                    label="Stress rate (%)"
                    step={0.05}
                    min={BUY_TO_LET_LIMITS.stressRate.min}
                    max={BUY_TO_LET_LIMITS.stressRate.max}
                    value={stressRate}
                    onChange={setStressRate}
                />
                <SelectField
                    cx={cx}
                    id={`${id}borrower`}
                    label="Borrower"
                    value={borrower}
                    onChange={setBorrower}
                    options={BORROWER_TYPES}
                />
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <Hints cx={cx} lines={[verdictLine(summary)]} />
                    <ResultRows cx={cx} rows={summary.rows} />
                    <PdfButton
                        pdf={pdf}
                        filename={`buy-to-let-${summary.loan}.pdf`}
                        cx={cx}
                        make={(api, options) => api.buyToLetPdf(input, options)}
                    />
                </>
            )}
        </div>
    );
}
