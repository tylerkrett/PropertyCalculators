import { useEffect, useId, useMemo, useState } from 'react';

import {
    BUYER_TYPES,
    type BuyerType,
    calculateStampDuty,
    DEFAULT_BUYER_TYPE,
    MAX_PRICE,
    type StampDutyEstimate,
} from '../stamp-duty/estimate';
import { getStampDutyTable, STAMP_DUTY_LABELS } from '../stamp-duty/labels';
import { amountText, BandTable, CheckField, MoneyField, oneOf, parseAmount, Status, SummaryItems } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type StampDutyCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Defaults to `"home-mover"`; a value that is not a buyer type falls back to it. */
    defaultBuyer?: BuyerType;
    defaultNonUkResident?: boolean;
    /** Show the band-by-band table. Defaults to `true`. */
    showBreakdown?: boolean;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the estimate whenever it changes, or `null` when there is no valid price. */
    onChange?: (estimate: StampDutyEstimate | null) => void;
};

/** Stamp Duty Land Tax on a purchase in England or Northern Ireland, with the band-by-band working. */
export function StampDutyCalculator({
    defaultPrice,
    defaultBuyer = DEFAULT_BUYER_TYPE,
    defaultNonUkResident = false,
    showBreakdown = true,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: StampDutyCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-stamp-duty', className);
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [buyer, setBuyer] = useState<BuyerType>(() => oneOf(BUYER_TYPES, defaultBuyer, DEFAULT_BUYER_TYPE));
    const [nonUkResident, setNonUkResident] = useState(Boolean(defaultNonUkResident));

    const price = parseAmount(priceText, Number.NaN);
    const valid = price > 0 && price <= MAX_PRICE;
    const estimate = useMemo(
        () => (valid ? calculateStampDuty({ price, buyer, nonUkResident }) : null),
        [valid, price, buyer, nonUkResident],
    );
    const table = estimate && getStampDutyTable(estimate);
    const prompt = table ? null : price > MAX_PRICE ? 'Enter a lower price.' : 'Enter a price to see the stamp duty.';

    useEffect(() => {
        onChange?.(estimate);
        // Report results, not new callback identities.
    }, [estimate]);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')}>
                <MoneyField
                    cx={cx}
                    id={`${id}price`}
                    label={STAMP_DUTY_LABELS.price}
                    value={priceText}
                    onChange={setPriceText}
                    invalid={!valid && priceText.trim() !== ''}
                    describedBy={prompt ? statusId : undefined}
                />

                <fieldset className={cx('field')}>
                    <legend className={cx('label')}>Buyer</legend>
                    <div className={cx('options')}>
                        {BUYER_TYPES.map((option) => (
                            <label
                                key={option.value}
                                className={cx('option')}
                                data-checked={buyer === option.value || undefined}
                            >
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

                <CheckField
                    cx={cx}
                    id={`${id}resident`}
                    label={STAMP_DUTY_LABELS.nonUkResident}
                    checked={nonUkResident}
                    onChange={setNonUkResident}
                />
            </div>

            <Status cx={cx} id={statusId} error={prompt} headline={table?.summary[1]} />

            {table && (
                <div>
                    <SummaryItems cx={cx} items={table.summary} />
                    {showBreakdown && (
                        <BandTable
                            cx={cx}
                            caption={STAMP_DUTY_LABELS.breakdown}
                            columns={table.columns}
                            rows={table.rows}
                            totals={table.totals}
                        />
                    )}
                    <PdfButton
                        pdf={pdf}
                        filename={`stamp-duty-${estimate.price}.pdf`}
                        cx={cx}
                        make={(api, options) => api.stampDutyPdf(estimate, options)}
                    />
                </div>
            )}
        </div>
    );
}
