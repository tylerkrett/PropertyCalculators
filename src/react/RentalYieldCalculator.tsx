import { useEffect, useId, useMemo, useState } from 'react';

import {
    getRentalYieldSummary,
    RENT_PERIODS,
    RENTAL_YIELD_DEFAULTS,
    type RentalYieldSummary,
    type RentPeriod,
} from '../rental-yield/index';
import { BUYER_TYPES, type BuyerType } from '../stamp-duty/estimate';
import { formatNumber, parsePrice } from '../stamp-duty/format';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type RentalYieldCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Rent to start with, in pounds per `defaultRentPeriod`. */
    defaultRent?: number;
    defaultRentPeriod?: RentPeriod;
    /** Running costs per year, in pounds. */
    defaultAnnualCosts?: number;
    /** Costs of buying other than stamp duty, in pounds. */
    defaultPurchaseCosts?: number;
    defaultVoidWeeks?: number;
    /** Buyer type for the stamp duty. Defaults to `"additional-property"`. */
    defaultBuyer?: BuyerType;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: RentalYieldSummary | null) => void;
};

const text = (value: number | undefined) => (value ? formatNumber(value) : '');
/** An empty box counts as zero for the optional costs, and as missing for the price and rent. */
const amount = (value: string, empty: number) => (value.trim() === '' ? empty : parsePrice(value));

export function RentalYieldCalculator({
    defaultPrice,
    defaultRent,
    defaultRentPeriod = RENTAL_YIELD_DEFAULTS.rentPeriod,
    defaultAnnualCosts,
    defaultPurchaseCosts,
    defaultVoidWeeks = 0,
    defaultBuyer = RENTAL_YIELD_DEFAULTS.buyer,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: RentalYieldCalculatorProps) {
    const id = useId();
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-rental-yield', className);
    const [priceText, setPriceText] = useState(text(defaultPrice));
    const [rentText, setRentText] = useState(text(defaultRent));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(defaultRentPeriod);
    const [costsText, setCostsText] = useState(text(defaultAnnualCosts));
    const [purchaseText, setPurchaseText] = useState(text(defaultPurchaseCosts));
    const [voidWeeks, setVoidWeeks] = useState(String(defaultVoidWeeks));
    const [buyer, setBuyer] = useState<BuyerType>(defaultBuyer);

    const input = useMemo(
        () => ({
            price: amount(priceText, Number.NaN),
            rent: amount(rentText, Number.NaN),
            rentPeriod,
            annualCosts: amount(costsText, 0),
            purchaseCosts: amount(purchaseText, 0),
            voidWeeks: voidWeeks.trim() === '' ? 0 : Number(voidWeeks),
            buyer,
        }),
        [priceText, rentText, rentPeriod, costsText, purchaseText, voidWeeks, buyer],
    );
    const { summary, error } = useMemo(() => getRentalYieldSummary(input), [input]);

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
    const select = <T extends string>(
        key: string,
        label: string,
        value: T,
        set: (value: T) => void,
        options: readonly { value: T; label: string }[],
    ) => (
        <div className={cx('field')}>
            <label className={cx('label')} htmlFor={`${id}${key}`}>
                {label}
            </label>
            <select
                id={`${id}${key}`}
                className={cx('select')}
                value={value}
                onChange={(event) => set(event.target.value as T)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <div className={cx('form')} data-layout="grid">
                {money('price', 'Property price', priceText, setPriceText)}
                {money('rent', 'Rent', rentText, setRentText)}
                {select('period', 'Rent is paid', rentPeriod, setRentPeriod, RENT_PERIODS)}
                {money('costs', 'Running costs per year', costsText, setCostsText)}
                {money('purchase', 'Other purchase costs', purchaseText, setPurchaseText)}
                <div className={cx('field')}>
                    <label className={cx('label')} htmlFor={`${id}void`}>
                        Empty weeks per year
                    </label>
                    <input
                        id={`${id}void`}
                        className={cx('input')}
                        type="number"
                        min={0}
                        max={52}
                        value={voidWeeks}
                        onChange={(event) => setVoidWeeks(event.target.value)}
                    />
                </div>
                {select('buyer', 'Buyer (for stamp duty)', buyer, setBuyer, BUYER_TYPES)}
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
                        filename={`rental-yield-${input.price}.pdf`}
                        className={cx('download')}
                        make={(api, options) => api.rentalYieldPdf(input, options)}
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
