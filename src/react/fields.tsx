import type { ReactNode } from 'react';

import { formatNumber, parsePrice } from '../stamp-duty/format';
import type { Slot } from './shared';

/*
 * The form controls and result list the calculators share, so each component is only its own
 * fields and wiring. Every control takes `cx` (the class builder from `slots`) and an `id`.
 */

type Cx = (slot: Slot) => string;
type FieldProps = { cx: Cx; id: string; label: string };

/** The text an amount starts as: `"750,000"`, or empty when there is none. */
export const amountText = (value: number | undefined) => (value ? formatNumber(value) : '');

/** Reads a typed amount; an empty box gives `empty` (0 for optional costs, `NaN` for required ones). */
export const parseAmount = (value: string, empty: number) => (value.trim() === '' ? empty : parsePrice(value));

/** Reads a typed plain number (a rate, a term); an empty box gives `empty`. */
export const parseNumber = (value: string, empty: number) => (value.trim() === '' ? empty : Number(value));

function Field({ cx, id, label, children }: FieldProps & { children: ReactNode }) {
    return (
        <div className={cx('field')}>
            <label className={cx('label')} htmlFor={id}>
                {label}
            </label>
            {children}
        </div>
    );
}

/** A pounds box with the £ prefix. */
export function MoneyField({
    value,
    onChange,
    ...field
}: FieldProps & { value: string; onChange: (value: string) => void }) {
    return (
        <Field {...field}>
            <div className={field.cx('money')}>
                <span className={field.cx('prefix')} aria-hidden="true">
                    £
                </span>
                <input
                    id={field.id}
                    className={field.cx('input')}
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
            </div>
        </Field>
    );
}

/** A plain number box: a rate, a term, a count. */
export function NumberField({
    value,
    onChange,
    min,
    max,
    step,
    ...field
}: FieldProps & { value: string; onChange: (value: string) => void; min?: number; max?: number; step?: number }) {
    return (
        <Field {...field}>
            <input
                id={field.id}
                className={field.cx('input')}
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </Field>
    );
}

/** A dropdown over `{ value, label }` options. */
export function SelectField<T extends string>({
    value,
    onChange,
    options,
    ...field
}: FieldProps & { value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[] }) {
    return (
        <Field {...field}>
            <select
                id={field.id}
                className={field.cx('select')}
                value={value}
                onChange={(event) => onChange(event.target.value as T)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </Field>
    );
}

/** A tick box with its label. */
export function CheckField({
    cx,
    id,
    label,
    checked,
    onChange,
}: FieldProps & { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className={cx('check')} htmlFor={id}>
            <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span>{label}</span>
        </label>
    );
}

/** A summary's labelled rows as a definition list; the first row is the headline. */
export function ResultRows({
    cx,
    rows,
}: {
    cx: Cx;
    rows: readonly { key: string; label: string; formatted: string }[];
}) {
    return (
        <dl className={cx('rows')} aria-live="polite">
            {rows.map((row, index) => (
                <div key={row.key} className={cx('row')} data-key={row.key} data-lead={index === 0 || undefined}>
                    <dt>{row.label}</dt>
                    <dd>{row.formatted}</dd>
                </div>
            ))}
        </dl>
    );
}

/** Plain-English notes or a form error, one paragraph each. */
export function Hints({ cx, lines }: { cx: Cx; lines: readonly (string | null | undefined)[] }) {
    return (
        <>
            {lines.filter(Boolean).map((line) => (
                <p key={line} className={cx('hint')} role="status">
                    {line}
                </p>
            ))}
        </>
    );
}
