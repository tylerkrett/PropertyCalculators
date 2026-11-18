import { useEffect, useId, useMemo, useState } from 'react';

import {
    calculateCompanyStampDuty,
    COMPANY_RELIEFS,
    type CompanyRelief,
    type CompanyStampDuty,
} from '../stamp-duty/company';
import { MAX_PRICE } from '../stamp-duty/estimate';
import { getStampDutyTable, STAMP_DUTY_LABELS } from '../stamp-duty/labels';
import { amountText, CheckField, Hints, MoneyField, parseAmount, SelectField } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type CompanyStampDutyCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** A relief from the flat 17% rate to start with. Defaults to `null`: no relief. */
    defaultRelief?: CompanyRelief | null;
    /** The company is not UK resident for this purchase. Defaults to `false`. */
    defaultNonUkResident?: boolean;
    /** Show the band-by-band table. Defaults to `true`. */
    showBreakdown?: boolean;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the result whenever it changes, or `null` when there is no valid price. */
    onChange?: (result: CompanyStampDuty | null) => void;
};

/** The dropdown's "no relief" choice is the empty string; the calculator takes `null`. */
const NO_RELIEF = '';
const RELIEF_OPTIONS: readonly { value: CompanyRelief | typeof NO_RELIEF; label: string }[] = [
    { value: NO_RELIEF, label: 'No relief' },
    ...COMPANY_RELIEFS,
];

/**
 * Stamp duty in England and Northern Ireland for a purchase by a company: the flat 17% on a
 * dwelling over £500,000, or the higher rates for additional dwellings when a relief applies.
 */
export function CompanyStampDutyCalculator({
    defaultPrice,
    defaultRelief = null,
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
}: CompanyStampDutyCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-company-stamp-duty', className);
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [relief, setRelief] = useState<CompanyRelief | typeof NO_RELIEF>(defaultRelief ?? NO_RELIEF);
    const [nonUkResident, setNonUkResident] = useState(defaultNonUkResident);

    const price = parseAmount(priceText, Number.NaN);
    const valid = price > 0 && price <= MAX_PRICE;
    const result = useMemo(
        () => (valid ? calculateCompanyStampDuty({ price, relief: relief || null, nonUkResident }) : null),
        [valid, price, relief, nonUkResident],
    );
    const table = result && getStampDutyTable(result);

    useEffect(() => {
        onChange?.(result);
        // Report results, not new callback identities.
    }, [result]);

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
                />
                <SelectField
                    cx={cx}
                    id={`${id}relief`}
                    label="Relief from the flat rate"
                    value={relief}
                    onChange={setRelief}
                    options={RELIEF_OPTIONS}
                />
                <CheckField
                    cx={cx}
                    id={`${id}resident`}
                    label="Company is a non-UK resident"
                    checked={nonUkResident}
                    onChange={setNonUkResident}
                />
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

                    <Hints cx={cx} lines={result.notes} />
                    <PdfButton
                        pdf={pdf}
                        filename={`company-stamp-duty-${result.price}.pdf`}
                        className={cx('download')}
                        make={(api, options) => api.companyStampDutyPdf(result, options)}
                    />
                </div>
            ) : (
                <Hints
                    cx={cx}
                    lines={[price > MAX_PRICE ? 'Enter a lower price.' : 'Enter a price to see the stamp duty.']}
                />
            )}
        </div>
    );
}
