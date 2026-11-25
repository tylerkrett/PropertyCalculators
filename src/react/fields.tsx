import type { ReactNode } from 'react';

import { formatNumber } from '../stamp-duty/format';
import type { Slot } from './shared';

/*
 * The form controls the calculators share, so each component is only its own fields and wiring.
 * Every control takes `cx` (the class builder from `slots`) and an `id`. The results side
 * (rows, summary, band table, notes) lives in ./results and is re-exported here.
 */

export { BandTable, Hints, ResultRows, SummaryItems } from './results';

/** The class builder `slots` returns. */
export type Cx = (slot: Slot) => string;
type FieldProps = { cx: Cx; id: string; label: string };

/** The text an amount starts as, keeping pence when it has them: `"750,000"`, `"350.50"`, or empty when there is none. */
export const amountText = (value: number | undefined) =>
    value ? formatNumber(value, Number.isInteger(value) ? 0 : 2) : '';

/** `£`, digits with optional commas, one optional decimal point, then an optional `k` or `m`. */
const AMOUNT = /^£?\s*(\d[\d,]*)?(?:\.(\d*))?\s*([km])?$/i;
const SUFFIX_EXPONENT = { k: 3, m: 6 } as const;

/**
 * Reads a typed amount: `"£750,000"`, `"1250.50"`, `"750k"` (750,000), `"1.5m"` (1,500,000).
 * An empty box gives `empty` (0 for optional costs, `NaN` for required ones). Anything else,
 * such as `"-500"`, `"1e6"` or `"abc"`, is `NaN`, which the calculators report as a form error
 * instead of working out a confident answer for a number nobody typed.
 */
export function parseAmount(value: string, empty: number): number {
    const text = String(value ?? '').trim();
    if (text === '') return empty;
    const [, whole = '', fraction = '', suffix] = AMOUNT.exec(text) ?? [];
    if (whole === '' && fraction === '') return Number.NaN;
    const exponent = suffix ? SUFFIX_EXPONENT[suffix.toLowerCase() as keyof typeof SUFFIX_EXPONENT] : 0;
    // Parsed as one decimal literal, so "2.3m" is exactly 2,300,000 and not 2,299,999.9999999995.
    return Number(`${whole.replace(/,/g, '') || '0'}.${fraction || '0'}e${exponent}`);
}

/** Reads a typed plain number (a rate, a term); an empty box gives `empty`. */
export const parseNumber = (value: string, empty: number) => (value.trim() === '' ? empty : Number(value));

/**
 * `value` when it is one of `options`, else `fallback`: a starting value from a CMS or a query
 * string may be anything, and a bad one should fall back to the default, not break the render.
 */
export function oneOf<T extends string>(options: readonly { value: T }[], value: unknown, fallback: T): T {
    return options.find((option) => option.value === value)?.value ?? fallback;
}

/** What the status region says: the form error, else the headline result as `"Label: value"`, else nothing. */
export function statusText(
    error: string | null | undefined,
    headline?: { label: string; formatted: string } | null,
): string {
    if (error) return error;
    return headline ? `${headline.label}: ${headline.formatted}` : '';
}

/**
 * The one polite live region of a calculator. It is always mounted, so screen readers announce
 * each change, and it holds only the form error or the headline result: tables and rows stay
 * outside it and are not re-read on every keystroke. The error is shown; the headline repeats
 * what the first result already shows, so the default styles hide it visually
 * (`data-state="result"`). Point the form at it with `aria-describedby={id}` while there is an error.
 */
export function Status({
    cx,
    id,
    error,
    headline,
}: {
    cx: Cx;
    id: string;
    /** The form error or prompt; shown when set. */
    error?: string | null;
    /** The headline result, announced when there is no error. */
    headline?: { label: string; formatted: string } | null;
}) {
    return (
        <p id={id} className={cx('status')} role="status" data-state={error ? 'error' : 'result'}>
            {statusText(error, headline)}
        </p>
    );
}

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
    invalid,
    describedBy,
    ...field
}: FieldProps & {
    value: string;
    onChange: (value: string) => void;
    /** Marks the box `aria-invalid` when what was typed can't be used. */
    invalid?: boolean;
    /** The id of the message that explains what this box needs. */
    describedBy?: string;
}) {
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
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
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
