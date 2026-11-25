import { useEffect, useId, useMemo, useState } from 'react';

import {
    getSellingCostsSummary,
    SELLING_COST_FEES,
    SELLING_COSTS_DEFAULTS,
    SELLING_COSTS_LIMITS,
    type SellingCostFeeKey,
    type SellingCostsSummary,
} from '../selling-costs/index';
import {
    amountText,
    CheckField,
    Hints,
    MoneyField,
    NumberField,
    parseAmount,
    parseNumber,
    ResultRows,
    SelectField,
    Status,
} from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

type Fees<T> = Partial<Record<SellingCostFeeKey, T>>;

export type SellingCostsCalculatorProps = BaseProps & {
    /** Sale price to start with, in pounds. */
    defaultPrice?: number;
    /** Mortgage balance to repay, in pounds. */
    defaultMortgage?: number;
    /** The lender's early repayment charge, in pounds. */
    defaultEarlyRepaymentCharge?: number;
    /** The agent's fee as a percentage of the price: 1.5 is 1.5%. */
    defaultAgentFeePercent?: number;
    /** The agent's fee as a fixed sum in pounds. When given, the form starts on a fixed fee. */
    defaultAgentFeeFixed?: number;
    /** Whether the agent's fee already includes VAT. Defaults to `false`: VAT is added on top. */
    defaultAgentFeeIncludesVat?: boolean;
    /** Fees to start with, in pounds, by key: `{ legalFees: 1500, removals: 900 }`. */
    defaultFees?: Fees<number>;
    /** Show the item-by-item table. Defaults to `true`. */
    showBreakdown?: boolean;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: SellingCostsSummary | null) => void;
};

const FEE_BASES = [
    { value: 'percent', label: 'A percentage of the price' },
    { value: 'fixed', label: 'A fixed amount' },
] as const;

type FeeBasis = (typeof FEE_BASES)[number]['value'];

const COLUMNS = [
    { key: 'label', label: 'Item', align: 'left' },
    { key: 'formatted', label: 'Amount', align: 'right' },
    { key: 'formattedShare', label: 'Share of sale price', align: 'right' },
] as const;

/** One entry per named fee, built from its key. */
const eachFee = <T,>(value: (key: SellingCostFeeKey) => T) =>
    Object.fromEntries(SELLING_COST_FEES.map(({ key }) => [key, value(key)])) as Fees<T>;

/** What a seller walks away with: the sale price less the agent's fee, the other costs and the mortgage. */
export function SellingCostsCalculator({
    defaultPrice,
    defaultMortgage,
    defaultEarlyRepaymentCharge,
    defaultAgentFeePercent,
    defaultAgentFeeFixed,
    defaultAgentFeeIncludesVat = SELLING_COSTS_DEFAULTS.agentFeeIncludesVat,
    defaultFees,
    showBreakdown = true,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: SellingCostsCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-selling-costs', className);
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [mortgageText, setMortgageText] = useState(amountText(defaultMortgage));
    const [chargeText, setChargeText] = useState(amountText(defaultEarlyRepaymentCharge));
    const [basis, setBasis] = useState<FeeBasis>(defaultAgentFeeFixed === undefined ? 'percent' : 'fixed');
    const [percentText, setPercentText] = useState(
        Number.isFinite(defaultAgentFeePercent) ? String(defaultAgentFeePercent) : '',
    );
    const [fixedText, setFixedText] = useState(amountText(defaultAgentFeeFixed));
    const [agentFeeIncludesVat, setIncludesVat] = useState(defaultAgentFeeIncludesVat === true);
    const [feeTexts, setFeeTexts] = useState(() => eachFee((key) => amountText(defaultFees?.[key])));

    // Memoised on the numbers, not the text, so retyping 1500 as 1,500 reports nothing new.
    const price = parseAmount(priceText, Number.NaN);
    // An empty box is nothing to pay: no mortgage, no charge, no fee.
    const mortgage = parseAmount(mortgageText, 0);
    const earlyRepaymentCharge = parseAmount(chargeText, 0);
    const agentFee = basis === 'percent' ? parseNumber(percentText, 0) : parseAmount(fixedText, 0);
    const fees = SELLING_COST_FEES.map(({ key }) => parseAmount(feeTexts[key] ?? '', 0));
    const input = useMemo(
        () => ({
            price,
            mortgage,
            earlyRepaymentCharge,
            ...(basis === 'percent' ? { agentFeePercent: agentFee } : { agentFeeFixed: agentFee }),
            agentFeeIncludesVat,
            ...eachFee((key) => parseAmount(feeTexts[key] ?? '', 0)),
        }),
        // The fee list is fixed, so this is always the same number of dependencies.
        [price, mortgage, earlyRepaymentCharge, basis, agentFee, agentFeeIncludesVat, ...fees],
    );
    const { summary, error } = useMemo(() => getSellingCostsSummary(input), [input]);
    const items = summary?.items.filter((item) => item.value > 0) ?? [];

    useEffect(() => {
        onChange?.(summary);
        // Report results, not new callback identities.
    }, [summary]);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid" aria-describedby={error ? statusId : undefined}>
                <MoneyField cx={cx} id={`${id}price`} label="Sale price" value={priceText} onChange={setPriceText} />
                <MoneyField
                    cx={cx}
                    id={`${id}mortgage`}
                    label="Mortgage to repay"
                    value={mortgageText}
                    onChange={setMortgageText}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}charge`}
                    label="Early repayment charge"
                    value={chargeText}
                    onChange={setChargeText}
                />
                <SelectField
                    cx={cx}
                    id={`${id}basis`}
                    label="Estate agent fee is"
                    value={basis}
                    onChange={setBasis}
                    options={FEE_BASES}
                />
                {basis === 'percent' ? (
                    <NumberField
                        cx={cx}
                        id={`${id}agentFee`}
                        label="Estate agent fee (%)"
                        value={percentText}
                        onChange={setPercentText}
                        min={SELLING_COSTS_LIMITS.agentFeePercent.min}
                        max={SELLING_COSTS_LIMITS.agentFeePercent.max}
                        step={0.05}
                    />
                ) : (
                    <MoneyField
                        cx={cx}
                        id={`${id}agentFee`}
                        label="Estate agent fee"
                        value={fixedText}
                        onChange={setFixedText}
                    />
                )}
                <CheckField
                    cx={cx}
                    id={`${id}vat`}
                    label="The agent fee already includes VAT"
                    checked={agentFeeIncludesVat}
                    onChange={setIncludesVat}
                />
                {SELLING_COST_FEES.map(({ key, label }) => (
                    <MoneyField
                        key={key}
                        cx={cx}
                        id={`${id}${key}`}
                        label={label}
                        value={feeTexts[key] ?? ''}
                        onChange={(value) => setFeeTexts((texts) => ({ ...texts, [key]: value }))}
                    />
                ))}
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <Hints
                        cx={cx}
                        lines={[
                            summary.shortfall
                                ? `The sale does not cover the costs and the mortgage: ${summary.formatted.netProceeds.slice(1)} would have to be found from elsewhere.`
                                : null,
                        ]}
                    />

                    {showBreakdown && items.length > 0 && (
                        <table className={cx('table')}>
                            <caption className={cx('heading')}>Where the sale price goes</caption>
                            <thead>
                                <tr>
                                    {COLUMNS.map((column) => (
                                        <th key={column.key} scope="col" data-align={column.align}>
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.key} data-key={item.key}>
                                        {COLUMNS.map((column) => (
                                            <td key={column.key} data-align={column.align}>
                                                {item[column.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    <PdfButton
                        pdf={pdf}
                        filename={`selling-costs-${input.price}.pdf`}
                        cx={cx}
                        make={(api, options) => api.sellingCostsPdf(input, options)}
                    />
                </>
            )}
        </div>
    );
}
