import { useEffect, useId, useMemo, useState } from 'react';

import {
    AFFORDABILITY_DEFAULTS,
    AFFORDABILITY_LIMITS,
    type AffordabilityInput,
    type AffordabilitySummary,
    getAffordabilitySummary,
} from '../affordability/index';
import { BUYER_TYPES, type BuyerType } from '../stamp-duty/estimate';
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

/** Props for `AffordabilityCalculator`. Every `default*` prop is a starting value the visitor can change. */
export type AffordabilityCalculatorProps = BaseProps & {
    /** The first applicant's gross yearly income to start with, in pounds. */
    defaultIncome?: number;
    /** A second applicant's gross yearly income, in pounds. Left empty, the application is for one person. */
    defaultSecondIncome?: number;
    /** Committed outgoings in pounds a month: loans, credit cards, car finance. */
    defaultMonthlyCommitments?: number;
    /** Deposit to start with, in pounds. */
    defaultDeposit?: number;
    /** Times the counted income a lender will lend. Defaults to 4.5. */
    defaultIncomeMultiple?: number;
    /** Annual interest rate, percent. Defaults to 4.5. */
    defaultRate?: number;
    /** Mortgage term in years. Defaults to 25. */
    defaultTermYears?: number;
    /** Buyer type for the stamp duty in "cash needed upfront". Defaults to `"home-mover"`. */
    defaultBuyer?: BuyerType;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: AffordabilitySummary | null) => void;
};

/**
 * "How much can I borrow?": the most the applicants could borrow and pay for a home, from their
 * incomes, commitments and deposit. An illustration, not a lender's decision.
 */
export function AffordabilityCalculator({
    defaultIncome,
    defaultSecondIncome,
    defaultMonthlyCommitments,
    defaultDeposit,
    defaultIncomeMultiple = AFFORDABILITY_DEFAULTS.incomeMultiple,
    defaultRate = AFFORDABILITY_DEFAULTS.rate,
    defaultTermYears = AFFORDABILITY_DEFAULTS.term,
    defaultBuyer = AFFORDABILITY_DEFAULTS.buyer,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: AffordabilityCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-affordability', className);
    const [incomeText, setIncomeText] = useState(amountText(defaultIncome));
    const [secondText, setSecondText] = useState(amountText(defaultSecondIncome));
    const [commitmentsText, setCommitmentsText] = useState(amountText(defaultMonthlyCommitments));
    const [depositText, setDepositText] = useState(amountText(defaultDeposit));
    const [multiple, setMultiple] = useState(String(defaultIncomeMultiple));
    const [rate, setRate] = useState(String(defaultRate));
    const [term, setTerm] = useState(String(defaultTermYears));
    const [buyer, setBuyer] = useState<BuyerType>(defaultBuyer);

    const input = useMemo(
        (): AffordabilityInput => ({
            // Only the first income is required; an empty box anywhere else counts as zero.
            income: parseAmount(incomeText, Number.NaN),
            secondIncome: parseAmount(secondText, 0),
            monthlyCommitments: parseAmount(commitmentsText, 0),
            deposit: parseAmount(depositText, 0),
            incomeMultiple: parseNumber(multiple, Number.NaN),
            rate: parseNumber(rate, Number.NaN),
            termYears: parseNumber(term, Number.NaN),
            buyer,
        }),
        [incomeText, secondText, commitmentsText, depositText, multiple, rate, term, buyer],
    );
    const { summary, error } = useMemo(() => getAffordabilitySummary(input), [input]);

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    const { incomeMultiple: multiples, rate: rates, term: terms } = AFFORDABILITY_LIMITS;

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid">
                <MoneyField
                    cx={cx}
                    id={`${id}income`}
                    label="Yearly income before tax"
                    value={incomeText}
                    onChange={setIncomeText}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}second`}
                    label="Second applicant's income (optional)"
                    value={secondText}
                    onChange={setSecondText}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}commitments`}
                    label="Monthly commitments"
                    value={commitmentsText}
                    onChange={setCommitmentsText}
                />
                <MoneyField cx={cx} id={`${id}deposit`} label="Deposit" value={depositText} onChange={setDepositText} />
                <NumberField
                    cx={cx}
                    id={`${id}multiple`}
                    label="Income multiple"
                    step={0.25}
                    min={multiples.min}
                    max={multiples.max}
                    value={multiple}
                    onChange={setMultiple}
                />
                <NumberField
                    cx={cx}
                    id={`${id}rate`}
                    label="Interest rate (%)"
                    step={0.05}
                    min={rates.min}
                    max={rates.max}
                    value={rate}
                    onChange={setRate}
                />
                <NumberField
                    cx={cx}
                    id={`${id}term`}
                    label="Term (years)"
                    min={terms.min}
                    max={terms.max}
                    value={term}
                    onChange={setTerm}
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

            {summary ? (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <PdfButton
                        pdf={pdf}
                        filename={`affordability-${summary.maxPrice}.pdf`}
                        className={cx('download')}
                        make={(api, options) => api.affordabilityPdf(input, options)}
                    />
                </>
            ) : (
                <Hints cx={cx} lines={[error]} />
            )}
        </div>
    );
}
