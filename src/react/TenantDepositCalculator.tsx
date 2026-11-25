import { useEffect, useId, useMemo, useState } from 'react';

import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import {
    checkTenantDeposit,
    getTenantDepositSummary,
    RENT_PAID_OPTIONS,
    type RentPaid,
    TENANT_DEPOSIT_DEFAULTS,
    TENANT_DEPOSIT_JURISDICTION,
    type TenantDepositSummary,
} from '../tenant-deposit/index';
import { amountText, Hints, MoneyField, oneOf, parseAmount, ResultRows, SelectField, Status } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type TenantDepositCalculatorProps = BaseProps & {
    /** Rent to start with, for the whole property, in pounds per `defaultRentPeriod`. */
    defaultRent?: number;
    /** The period the rent is quoted for. Defaults to `"month"`, as does a value that is not a rent period. */
    defaultRentPeriod?: RentPeriod;
    /**
     * How often the rent is paid, which sets the rent-in-advance limit: one month's rent when
     * `"monthly"`, 28 days' rent when `"more-often"`. Left out, it follows the rent period (a weekly
     * rent is paid more often than monthly) until the visitor chooses.
     */
    defaultRentPaid?: RentPaid;
    /** A tenancy deposit to check against the cap, in pounds. */
    defaultProposedDeposit?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: TenantDepositSummary | null) => void;
};

const JURISDICTION_HINT = `These caps are the law in ${TENANT_DEPOSIT_JURISDICTION} only. Wales, Scotland and Northern Ireland have their own rules.`;

/** The most a landlord or agent in England may take as a tenancy deposit, a holding deposit and rent in advance. */
export function TenantDepositCalculator({
    defaultRent,
    defaultRentPeriod = TENANT_DEPOSIT_DEFAULTS.rentPeriod,
    defaultRentPaid,
    defaultProposedDeposit,
    pdf,
    onChange,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: TenantDepositCalculatorProps) {
    const id = useId();
    const statusId = `${id}status`;
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-tenant-deposit', className);
    const [rentText, setRentText] = useState(amountText(defaultRent));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(() =>
        oneOf(RENT_PERIODS, defaultRentPeriod, TENANT_DEPOSIT_DEFAULTS.rentPeriod),
    );
    // Until it is chosen (here or by the prop), how the rent is paid follows how it is quoted.
    const [chosenRentPaid, setRentPaid] = useState<RentPaid | undefined>(() =>
        RENT_PAID_OPTIONS.some((option) => option.value === defaultRentPaid) ? defaultRentPaid : undefined,
    );
    const rentPaid = chosenRentPaid ?? (rentPeriod === 'week' ? 'more-often' : 'monthly');
    const [proposedText, setProposedText] = useState(amountText(defaultProposedDeposit));

    // Memoised on the numbers, not the text, so retyping 1200 as 1,200 reports nothing new.
    const rent = parseAmount(rentText, Number.NaN);
    const input = useMemo(() => ({ rent, rentPeriod, rentPaid }), [rent, rentPeriod, rentPaid]);
    const { summary, error } = useMemo(() => getTenantDepositSummary(input), [input]);
    // An empty box means nothing to check: the calculator refuses the NaN and no sentence is shown.
    const proposed = parseAmount(proposedText, Number.NaN);
    const check = useMemo(() => checkTenantDeposit(input, proposed), [input, proposed]);

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
                    label="Rent is quoted"
                    value={rentPeriod}
                    onChange={setRentPeriod}
                    options={RENT_PERIODS}
                />
                <SelectField
                    cx={cx}
                    id={`${id}paid`}
                    label="Rent is paid"
                    value={rentPaid}
                    onChange={setRentPaid}
                    options={RENT_PAID_OPTIONS}
                />
                <MoneyField
                    cx={cx}
                    id={`${id}proposed`}
                    label="Proposed deposit (optional)"
                    value={proposedText}
                    onChange={setProposedText}
                />
            </div>

            <Status cx={cx} id={statusId} error={error} headline={summary?.rows[0]} />

            {summary && (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <Hints cx={cx} lines={[check && `${check.formatted.sentence}.`, JURISDICTION_HINT]} />
                    <PdfButton
                        pdf={pdf}
                        filename={`tenant-deposit-${input.rent}.pdf`}
                        cx={cx}
                        make={(api, options) =>
                            api.tenantDepositPdf({ ...input, proposedDeposit: check ? proposed : undefined }, options)
                        }
                    />
                </>
            )}
            {!summary && <Hints cx={cx} lines={[JURISDICTION_HINT]} />}
        </div>
    );
}
