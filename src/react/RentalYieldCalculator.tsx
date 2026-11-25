import { useEffect, useId, useMemo, useState } from 'react';

import {
    getRentalYieldSummary,
    RENT_PERIODS,
    RENTAL_YIELD_DEFAULTS,
    type RentalYieldSummary,
    type RentPeriod,
} from '../rental-yield/index';
import { BUYER_TYPES, type BuyerType } from '../stamp-duty/estimate';
import {
    amountText,
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

export type RentalYieldCalculatorProps = BaseProps & {
    /** Price to start with, in pounds. */
    defaultPrice?: number;
    /** Rent to start with, in pounds per `defaultRentPeriod`. */
    defaultRent?: number;
    /** Defaults to `"month"`; a value that is not a rent period falls back to it. */
    defaultRentPeriod?: RentPeriod;
    /** Running costs per year, in pounds. */
    defaultAnnualCosts?: number;
    /** Costs of buying other than stamp duty, in pounds. */
    defaultPurchaseCosts?: number;
    defaultVoidWeeks?: number;
    /** Buyer type for the stamp duty. Defaults to `"additional-property"`, as does an unknown value. */
    defaultBuyer?: BuyerType;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: RentalYieldSummary | null) => void;
};

/** Gross and net rental yield on a purchase, after stamp duty, running costs and empty weeks. */
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
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-rental-yield', className);
    const [priceText, setPriceText] = useState(amountText(defaultPrice));
    const [rentText, setRentText] = useState(amountText(defaultRent));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(() =>
        oneOf(RENT_PERIODS, defaultRentPeriod, RENTAL_YIELD_DEFAULTS.rentPeriod),
    );
    const [costsText, setCostsText] = useState(amountText(defaultAnnualCosts));
    const [purchaseText, setPurchaseText] = useState(amountText(defaultPurchaseCosts));
    const [voidText, setVoidText] = useState(String(defaultVoidWeeks));
    const [buyer, setBuyer] = useState<BuyerType>(() => oneOf(BUYER_TYPES, defaultBuyer, RENTAL_YIELD_DEFAULTS.buyer));

    // Memoised on the numbers, not the text, so retyping 500000 as 500,000 reports nothing new.
    // An empty box counts as zero for the optional costs, and as missing for the price and rent.
    const price = parseAmount(priceText, Number.NaN);
    const rent = parseAmount(rentText, Number.NaN);
    const annualCosts = parseAmount(costsText, 0);
    const purchaseCosts = parseAmount(purchaseText, 0);
    const voidWeeks = parseNumber(voidText, 0);
    const input = useMemo(
        () => ({ price, rent, rentPeriod, annualCosts, purchaseCosts, voidWeeks, buyer }),
        [price, rent, rentPeriod, annualCosts, purchaseCosts, voidWeeks, buyer],
    );
    const { summary, error } = useMemo(() => getRentalYieldSummary(input), [input]);

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
                    id={`${id}costs`}
                    label="Running costs per year"
                    value={costsText}
                    onChange={setCostsText}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}purchase`}
                    label="Other purchase costs"
                    value={purchaseText}
                    onChange={setPurchaseText}
                />
                <NumberField
                    cx={cx}
                    id={`${id}void`}
                    label="Empty weeks per year"
                    min={0}
                    max={52}
                    value={voidText}
                    onChange={setVoidText}
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

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <PdfButton
                        pdf={pdf}
                        filename={`rental-yield-${input.price}.pdf`}
                        cx={cx}
                        make={(api, options) => api.rentalYieldPdf(input, options)}
                    />
                </>
            )}
        </div>
    );
}
