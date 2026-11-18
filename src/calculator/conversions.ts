import { apply } from './editing';
import { type Args, final, getNumericValue, operation } from './operations';

/*
 * One-tap conversions on the current value: percent, VAT, rent per week and per month, square
 * feet and metres, currency, and the K and M shortcuts.
 */

export function percent(args: Args) {
    if (args.isInfinityLast) return args.expression;
    return apply(args)((x) => final.wrap(x / 100));
}

export function vat(args: Args) {
    if (args.isInfinityLast) return args.expression;

    const f = apply(args);

    switch (args.operation) {
        case operation.vatMinus:
            return f((x) => final.wrap(Number(Number(x / 1.2).toFixed(2))));
        case operation.vatPlus:
            return f((x) => final.wrap(Number(Number(x * 1.2).toFixed(2))));
        default:
            return undefined;
    }
}

export function pcwPm(args: Args) {
    if (args.isInfinityLast) return args.expression;

    const f = apply(args);

    switch (args.operation) {
        case operation.pcmToPw:
            return f((x) => final.wrap(Number(Math.round((x * 12) / 52))));
        case operation.pwToPcm:
            return f((x) => final.wrap(Number(Math.round((x * 52) / 12))));
        default:
            return undefined;
    }
}

export function ftM(args: Args) {
    if (args.isInfinityLast) return args.expression;

    const f = apply(args);
    const a = 10.7639;

    switch (args.operation) {
        case operation.mToFt:
            return f((x) => final.wrap(Number((x * a).toFixed(2))));
        case operation.ftToM:
            return f((x) => final.wrap(Number((x / a).toFixed(2))));
        default:
            return undefined;
    }
}

export function currency(args: Args) {
    if (args.isInfinityLast) return args.expression;

    // Without a usable rate the conversion does nothing, rather than throwing or showing Infinity.
    const code = args.operation === operation.gbpUsd || args.operation === operation.usdGbp ? 'USD' : 'EUR';
    const rate = args.meta?.rates?.[code];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return args.expression;

    // Buttons named "GBP to X" divide by the rate; "X to GBP" multiply.
    const toForeign = args.operation === operation.gbpUsd || args.operation === operation.gbpEur;
    return apply(args)((x) => final.wrap(Number((toForeign ? x / rate : x * rate).toFixed(2))));
}

export function letter(args: Args) {
    if (args.isInfinityLast) return args.expression;

    const f = apply(args);

    switch (args.operation) {
        case operation.letterThousand:
            return f((x) => final.wrap(getNumericValue(x * 1_000)));
        case operation.letterMillion:
            return f((x) => final.wrap(getNumericValue(x * 1_000_000)));
        default:
            return undefined;
    }
}
