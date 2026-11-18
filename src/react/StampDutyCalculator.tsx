import { useEffect, useId, useMemo, useState } from 'react';

import {
    BUYER_TYPES,
    type BuyerType,
    calculateStampDuty,
    DEFAULT_BUYER_TYPE,
    MAX_PRICE,
    type StampDutyEstimate,
} from '../stamp-duty/estimate';
import { formatNumber, parsePrice } from '../stamp-duty/format';
import { getStampDutyTable, STAMP_DUTY_LABELS } from '../stamp-duty/labels';
import { type BaseProps, slots, Styles } from './shared';

export type StampDutyCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    defaultBuyer?: BuyerType;
    defaultNonUkResident?: boolean;
    /** Show the band-by-band table. Defaults to `true`. */
    showBreakdown?: boolean;
    /** Called with the estimate whenever it changes, or `null` when there is no valid price. */
    onChange?: (estimate: StampDutyEstimate | null) => void;
};

export function StampDutyCalculator({
    defaultPrice,
    defaultBuyer = DEFAULT_BUYER_TYPE,
    defaultNonUkResident = false,
    showBreakdown = true,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: StampDutyCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-stamp-duty', className);
    const [priceText, setPriceText] = useState(defaultPrice ? formatNumber(defaultPrice) : '');
    const [buyer, setBuyer] = useState<BuyerType>(defaultBuyer);
    const [nonUkResident, setNonUkResident] = useState(defaultNonUkResident);

    const price = parsePrice(priceText);
    const valid = Number.isFinite(price) && price > 0 && price <= MAX_PRICE;
    const estimate = useMemo(
        () => (valid ? calculateStampDuty({ price, buyer, nonUkResident }) : null),
        [valid, price, buyer, nonUkResident],
    );
    const table = estimate && getStampDutyTable(estimate);

    useEffect(() => {
        onChange?.(estimate);
        // Report results, not new callback identities.
    }, [estimate]);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')}>
                <div className={cx('field')}>
                    <label className={cx('label')} htmlFor={`${id}price`}>
                        {STAMP_DUTY_LABELS.price}
                    </label>
                    <div className={cx('money')}>
                        <span className={cx('prefix')} aria-hidden="true">
                            £
                        </span>
                        <input
                            id={`${id}price`}
                            className={cx('input')}
                            inputMode="decimal"
                            autoComplete="off"
                            value={priceText}
                            onChange={(event) => setPriceText(event.target.value)}
                        />
                    </div>
                </div>

                <fieldset className={cx('field')}>
                    <legend className={cx('label')}>Buyer</legend>
                    <div className={cx('options')}>
                        {BUYER_TYPES.map((option) => (
                            <label key={option.value} className={cx('option')} data-checked={buyer === option.value || undefined}>
                                <input
                                    type="radio"
                                    name={`${id}buyer`}
                                    value={option.value}
                                    checked={buyer === option.value}
                                    onChange={() => setBuyer(option.value)}
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <label className={cx('check')}>
                    <input
                        type="checkbox"
                        checked={nonUkResident}
                        onChange={(event) => setNonUkResident(event.target.checked)}
                    />
                    <span>{STAMP_DUTY_LABELS.nonUkResident}</span>
                </label>
            </div>

            {table ? (
                <div aria-live="polite">
                    <dl className={cx('summary')}>
                        {table.summary.map((item) => (
                            <div key={item.key} className={cx('summaryItem')} data-key={item.key}>
                                <dt>{item.label}</dt>
                                <dd>{item.formatted}</dd>
                            </div>
                        ))}
                    </dl>

                    {showBreakdown && (
                        <table className={cx('table')}>
                            <caption className={cx('heading')}>{STAMP_DUTY_LABELS.breakdown}</caption>
                            <thead>
                                <tr>
                                    {table.columns.map((column) => (
                                        <th key={column.key} scope="col" data-align={column.align}>
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {table.rows.map((row) => (
                                    <tr key={row.key}>
                                        {table.columns.map((column) => (
                                            <td key={column.key} data-align={column.align}>
                                                {row[column.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    {table.columns.map((column) => (
                                        <td key={column.key} data-align={column.align}>
                                            {table.totals[column.key]}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            ) : (
                <p className={cx('hint')} role="status">
                    {price > MAX_PRICE ? 'Enter a lower price.' : 'Enter a price to see the stamp duty.'}
                </p>
            )}
        </div>
    );
}
