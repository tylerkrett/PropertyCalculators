import { useEffect, useId, useMemo, useState } from 'react';

import { RENT_PERIODS, type RentPeriod } from '../rental-yield/index';
import { formatNumber } from '../stamp-duty/format';
import {
    checkTenantDeposit,
    getTenantDepositSummary,
    TENANT_DEPOSIT_DEFAULTS,
    TENANT_DEPOSIT_JURISDICTION,
    type TenantDepositSummary,
} from '../tenant-deposit/index';
import { Hints, MoneyField, parseAmount, ResultRows, SelectField } from './fields';
import { type BaseProps, PdfButton, type PdfProp, slots, Styles } from './shared';

export type TenantDepositCalculatorProps = BaseProps & {
    /** Rent to start with, for the whole property, in pounds per `defaultRentPeriod`. */
    defaultRent?: number;
    /** How often the rent is paid. Defaults to `"month"`. */
    defaultRentPeriod?: RentPeriod;
    /** A tenancy deposit to check against the cap, in pounds. */
    defaultProposedDeposit?: number;
    /** Adds a "Download PDF" button: `true`, or your brand (`name`, `colour`, `logo`, `footer`...). */
    pdf?: PdfProp;
    /** Called with the summary whenever it changes, or `null` while the form has an error. */
    onChange?: (summary: TenantDepositSummary | null) => void;
};

/** The text an amount starts as, keeping pence when it has them: `"1,200"`, `"1,384.61"`. */
const text = (value: number | undefined) => (value ? formatNumber(value, Number.isInteger(value) ? 0 : 2) : '');

const JURISDICTION_HINT = `These caps are the law in ${TENANT_DEPOSIT_JURISDICTION} only. Wales, Scotland and Northern Ireland have their own rules.`;

/** The most a landlord or agent in England may take as a tenancy deposit, a holding deposit and rent in advance. */
export function TenantDepositCalculator({
    defaultRent,
    defaultRentPeriod = TENANT_DEPOSIT_DEFAULTS.rentPeriod,
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
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-tenant-deposit', className);
    const [rentText, setRentText] = useState(text(defaultRent));
    const [rentPeriod, setRentPeriod] = useState<RentPeriod>(defaultRentPeriod);
    const [proposedText, setProposedText] = useState(text(defaultProposedDeposit));

    const input = useMemo(() => ({ rent: parseAmount(rentText, Number.NaN), rentPeriod }), [rentText, rentPeriod]);
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

            <div className={cx('form')} data-layout="grid">
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
                    id={`${id}proposed`}
                    label="Proposed deposit (optional)"
                    value={proposedText}
                    onChange={setProposedText}
                />
            </div>

            {summary ? (
                <>
                    <ResultRows cx={cx} rows={summary.rows} />
                    <Hints cx={cx} lines={[check && `${check.formatted.sentence}.`, JURISDICTION_HINT]} />
                    <PdfButton
                        pdf={pdf}
                        filename={`tenant-deposit-${input.rent}.pdf`}
                        className={cx('download')}
                        make={(api, options) =>
                            api.tenantDepositPdf({ ...input, proposedDeposit: check ? proposed : undefined }, options)
                        }
                    />
                </>
            ) : (
                <Hints cx={cx} lines={[error, JURISDICTION_HINT]} />
            )}
        </div>
    );
}
