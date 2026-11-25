import { useEffect, useId, useMemo, useState } from 'react';

import {
    BUYING_COST_FEES,
    BUYING_COSTS_DEFAULTS,
    BUYING_COSTS_LABELS,
    type BuyingCostFeeKey,
    type BuyingCostsSummary,
    getBuyingCostsSummary,
} from '../buying-costs/index';
import { BUYER_TYPES, type BuyerType } from '../stamp-duty/estimate';
import { amountText, MoneyField, oneOf, parseAmount, ResultRows, SelectField, Status } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

type Fees<T> = Partial<Record<BuyingCostFeeKey, T>>;

export type BuyingCostsCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Deposit to start with, in pounds. */
    defaultDeposit?: number;
    /** Buyer type for the stamp duty. Defaults to `"home-mover"`. */
    defaultBuyer?: BuyerType;
    /** Fees to start with, in pounds, by key: `{ legalFees: 1500, survey: 500 }`. */
    defaultFees?: Fees<number>;
    /** Show the item-by-item table. Defaults to `true`. */
    showBreakdown?: boolean;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: BuyingCostsSummary | null) => void;
};

const COLUMNS = [
    { key: 'label', label: 'Item', align: 'left' },
    { key: 'formatted', label: 'Amount', align: 'right' },
    { key: 'formattedShare', label: 'Share of cash upfront', align: 'right' },
] as const;

/** One entry per named fee, built from its key. */
const eachFee = <T,>(value: (key: BuyingCostFeeKey) => T) =>
    Object.fromEntries(BUYING_COST_FEES.map(({ key }) => [key, value(key)])) as Fees<T>;

/** The cash a purchase needs upfront: deposit, stamp duty and the fees entered, item by item. */
export function BuyingCostsCalculator({
    defaultPrice,
    defaultDeposit,
    defaultBuyer = BUYING_COSTS_DEFAULTS.buyer,
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
}: BuyingCostsCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-buying-costs', className);
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [depositText, setDepositText] = useState(amountText(defaultDeposit));
    const [buyer, setBuyer] = useState<BuyerType>(() => oneOf(BUYER_TYPES, defaultBuyer, BUYING_COSTS_DEFAULTS.buyer));
    const [feeTexts, setFeeTexts] = useState(() => eachFee((key) => amountText(defaultFees?.[key])));

    // Memoised on the numbers, not the text, so retyping 1500 as 1,500 reports nothing new.
    const price = parseAmount(priceText, Number.NaN);
    // An empty deposit box is a purchase with no deposit, as an empty fee is no fee.
    const deposit = parseAmount(depositText, 0);
    const fees = BUYING_COST_FEES.map(({ key }) => parseAmount(feeTexts[key] ?? '', 0));
    const input = useMemo(
        () => ({ price, deposit, buyer, ...eachFee((key) => parseAmount(feeTexts[key] ?? '', 0)) }),
        // The fee list is fixed, so this is always the same number of dependencies.
        [price, deposit, buyer, ...fees],
    );
    const { summary, error } = useMemo(() => getBuyingCostsSummary(input), [input]);
    const items = summary?.items.filter((item) => item.value > 0) ?? [];

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
                <MoneyField
                    cx={cx}
                    id={`${id}deposit`}
                    label={BUYING_COSTS_LABELS.deposit}
                    value={depositText}
                    onChange={setDepositText}
                />
                <SelectField
                    cx={cx}
                    id={`${id}buyer`}
                    label="Buyer (for stamp duty)"
                    value={buyer}
                    onChange={setBuyer}
                    options={BUYER_TYPES}
                />
                {BUYING_COST_FEES.map(({ key, label }) => (
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

                    {showBreakdown && items.length > 0 && (
                        <table className={cx('table')}>
                            <caption className={cx('heading')}>Where the cash goes</caption>
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
                        filename={`buying-costs-${input.price}.pdf`}
                        cx={cx}
                        make={(api, options) => api.buyingCostsPdf(input, options)}
                    />
                </>
            )}
        </div>
    );
}
