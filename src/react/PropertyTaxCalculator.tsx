import { useEffect, useId, useMemo, useState } from 'react';

import {
    calculatePropertyTax,
    COUNTRIES,
    type Country,
    DEFAULT_COUNTRY,
    PROPERTY_TAX_NAMES,
    type PropertyTaxEstimate,
} from '../land-tax/index';
import {
    BUYER_TYPES,
    type BuyerType,
    DEFAULT_BUYER_TYPE,
    DEFAULT_PROPERTY_TYPE,
    MAX_PRICE,
    PROPERTY_TYPES,
    type PropertyType,
} from '../stamp-duty/estimate';
import { STAMP_DUTY_COLUMNS, STAMP_DUTY_LABELS } from '../stamp-duty/labels';
import { amountText, CheckField, Hints, MoneyField, parseAmount, SelectField } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type PropertyTaxCalculatorProps = BaseProps & {
    /** Where the property is, which decides the tax: SDLT, LBTT or LTT. Defaults to `"england"`. */
    defaultCountry?: Country;
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Defaults to `"home-mover"`. */
    defaultBuyer?: BuyerType;
    /** Defaults to `"residential"`. */
    defaultPropertyType?: PropertyType;
    /** Only offered, and only applied, in England and Northern Ireland. Defaults to `false`. */
    defaultNonUkResident?: boolean;
    /** Show the band-by-band table. Defaults to `true`. */
    showBreakdown?: boolean;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the estimate whenever it changes, or `null` when there is no valid price. */
    onChange?: (estimate: PropertyTaxEstimate | null) => void;
};

/** The headline figures; Scotland's supplement gets a line of its own beside the tax from the bands. */
function summaryOf({ tax, supplement, formatted }: PropertyTaxEstimate) {
    return [
        { key: 'price', label: STAMP_DUTY_LABELS.price, formatted: formatted.price },
        ...(supplement
            ? [
                  { key: 'bandTax', label: `${tax} from the bands`, formatted: formatted.bandTax },
                  {
                      key: 'supplement',
                      label: `${supplement.label} (${supplement.formatted.rate})`,
                      formatted: supplement.formatted.amount,
                  },
              ]
            : []),
        { key: 'total', label: `${tax} to pay`, formatted: formatted.total },
        { key: 'effectiveRate', label: STAMP_DUTY_LABELS.actualRate, formatted: formatted.effectiveRate },
    ];
}

/**
 * The property purchase tax anywhere in the UK: Stamp Duty Land Tax in England and Northern
 * Ireland, Land and Buildings Transaction Tax in Scotland and Land Transaction Tax in Wales.
 */
export function PropertyTaxCalculator({
    defaultCountry = DEFAULT_COUNTRY,
    defaultPrice,
    defaultBuyer = DEFAULT_BUYER_TYPE,
    defaultPropertyType = DEFAULT_PROPERTY_TYPE,
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
}: PropertyTaxCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-property-tax', className);
    const [country, setCountry] = useState<Country>(defaultCountry);
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [buyer, setBuyer] = useState<BuyerType>(defaultBuyer);
    const [propertyType, setPropertyType] = useState<PropertyType>(defaultPropertyType);
    const [nonUkResidentTicked, setNonUkResident] = useState(defaultNonUkResident);

    // Only SDLT charges non-UK residents more, so the box is hidden, and ignored, elsewhere.
    const asksResidence = COUNTRIES.find((option) => option.value === country)?.tax === 'SDLT';
    const nonUkResident = asksResidence && nonUkResidentTicked;
    const price = parseAmount(priceText, Number.NaN);
    const valid = price > 0 && price <= MAX_PRICE;
    const estimate = useMemo(
        () => (valid ? calculatePropertyTax({ country, price, buyer, propertyType, nonUkResident }) : null),
        [valid, country, price, buyer, propertyType, nonUkResident],
    );

    useEffect(() => {
        onChange?.(estimate);
        // Report results, not new callback identities.
    }, [estimate]);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid">
                <SelectField
                    cx={cx}
                    id={`${id}country`}
                    label="Country"
                    value={country}
                    onChange={setCountry}
                    options={COUNTRIES}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}price`}
                    label={STAMP_DUTY_LABELS.price}
                    value={priceText}
                    onChange={setPriceText}
                />
                <SelectField
                    cx={cx}
                    id={`${id}buyer`}
                    label="Buyer"
                    value={buyer}
                    onChange={setBuyer}
                    options={BUYER_TYPES}
                />
                <SelectField
                    cx={cx}
                    id={`${id}type`}
                    label="Property type"
                    value={propertyType}
                    onChange={setPropertyType}
                    options={PROPERTY_TYPES}
                />
                {asksResidence && (
                    <CheckField
                        cx={cx}
                        id={`${id}resident`}
                        label={STAMP_DUTY_LABELS.nonUkResident}
                        checked={nonUkResidentTicked}
                        onChange={setNonUkResident}
                    />
                )}
            </div>

            {estimate ? (
                <div aria-live="polite">
                    <dl className={cx('summary')}>
                        {summaryOf(estimate).map((item) => (
                            <div key={item.key} className={cx('summaryItem')} data-key={item.key}>
                                <dt>{item.label}</dt>
                                <dd>{item.formatted}</dd>
                            </div>
                        ))}
                    </dl>

                    {showBreakdown && (
                        <table className={cx('table')}>
                            <caption className={cx('heading')}>
                                {PROPERTY_TAX_NAMES[estimate.tax]}: {STAMP_DUTY_LABELS.breakdown.toLowerCase()}
                            </caption>
                            <thead>
                                <tr>
                                    {STAMP_DUTY_COLUMNS.map((column) => (
                                        <th key={column.key} scope="col" data-align={column.align}>
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {estimate.bands.map((band) => (
                                    <tr key={band.from}>
                                        {STAMP_DUTY_COLUMNS.map((column) => (
                                            <td key={column.key} data-align={column.align}>
                                                {band.formatted[column.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td data-align="left">Total</td>
                                    <td data-align="right" />
                                    <td data-align="right">{estimate.formatted.price}</td>
                                    <td data-align="right">{estimate.formatted.bandTax}</td>
                                </tr>
                            </tfoot>
                        </table>
                    )}

                    <Hints cx={cx} lines={estimate.notes} />
                    <PdfButton
                        pdf={pdf}
                        filename={`${estimate.tax.toLowerCase()}-${estimate.price}.pdf`}
                        className={cx('download')}
                        make={(api, options) => api.propertyTaxPdf(estimate, options)}
                    />
                </div>
            ) : (
                <Hints
                    cx={cx}
                    lines={[price > MAX_PRICE ? 'Enter a lower price.' : 'Enter a price to see the tax to pay.']}
                />
            )}
        </div>
    );
}
