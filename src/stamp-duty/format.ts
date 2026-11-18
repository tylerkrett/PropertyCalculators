/*
 * Number formatting. The legacy formatters reproduce `numeral`'s output for these formats, without the
 * dependency, so existing API and PDF output keeps its exact strings. Only these three
 * format strings are supported.
 */

/** `'0,0'` and `'0,00'` round to whole numbers; `'0,00[.0]'` always shows two decimals. */
export type NumberFormat = '0,0' | '0,00' | '0,00[.0]';

const group = (digits: string) => digits.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');

/** Thousands-separated number with a fixed number of decimals, rounded half up. */
export function formatNumber(value: number, decimals = 0): string {
    const number = Number.isNaN(Number(value)) || value === null ? 0 : Number(value);
    const rounded = Math.round(Number(`${Math.abs(number)}e+${decimals}`)) / 10 ** decimals;
    if (!Number.isFinite(rounded)) return 'NaN';

    const [integer = '0', fraction] = rounded.toFixed(decimals).split('.');
    const sign = number < 0 && rounded !== 0 ? '-' : '';
    return `${sign}${group(integer)}${fraction ? `.${fraction}` : ''}`;
}

const decimalsOf = (fmt: string) => (fmt === '0,00[.0]' ? 2 : 0);

/** `£43,750` (`'0,0'`, `'0,00'`) or `£43,750.00` (the default), rounded down to `nearest`. */
export function formatPrice(value: number, fmt: NumberFormat | (string & {}) = '0,00[.0]', nearest = 1): string {
    return `£${formatNumber(Math.floor(value / nearest) * nearest, decimalsOf(fmt))}`;
}

/** `5.00%` by default, `5%` with `'0,0'` or `'0,00'`. */
export function formatPercentage(value: number, fmt: NumberFormat | (string & {}) = '0,00[.0]'): string {
    return `${formatNumber(value, decimalsOf(fmt))}%`;
}

/** Strips everything but digits and the decimal point: `"£1,250,000"` is `1250000`. */
export function parsePrice(value: unknown): number {
    return Number(String(value).replace(/[^0-9.]/gi, ''));
}

/**
 * A band as HMRC states it: `£0 – £125,000`, `£125,001 – £250,000`, `£1,500,001+`. The open-ended
 * top band may be `Infinity` or `null` (how it arrives after a trip through JSON).
 */
export function formatRange(values: readonly [number, number | null]): string {
    const first = values[0] === 0 ? 0 : values[0] + 1;
    const second = values[1];

    return second === null || !Number.isFinite(second)
        ? `${formatPrice(first, '0,00', 1)}+`
        : [first, second].map((value) => formatPrice(value, '0,00', 1)).join(' – ');
}

/** `£1,250,000`: whole pounds. */
export const formatPounds = (amount: number): string => `£${formatNumber(Math.round(amount))}`;

/** `£2,338.36`: pounds and pence. */
export const formatPoundsAndPence = (amount: number): string => `£${formatNumber(amount, 2)}`;

/** `5%`, `12.5%`, `3.67%`: up to two decimals, trailing zeros dropped. */
export const formatRate = (rate: number): string => `${formatNumber(rate, 2).replace(/\.?0+$/, '')}%`;
