/*
 * The desk calculator's vocabulary: the operation symbols, the `Final` result wrapper, and the
 * small helpers the rest of the engine shares.
 */

export const dropLast = <T>(list: readonly T[]): T[] => list.slice(0, -1);

export const operation = {
    add: Symbol('+'),
    minus: Symbol('−'),
    multiply: Symbol('×'),
    divide: Symbol('÷'),
    equals: Symbol('='),
    percent: Symbol('%'),
    decimal: Symbol('.'),
    invert: Symbol('+/-'),
    allClear: Symbol('AC'),
    clear: Symbol('C'),
    back: Symbol('Back'),
    vatMinus: Symbol('VAT-'),
    vatPlus: Symbol('VAT+'),
    pwToPcm: Symbol('PW/PCM'),
    pcmToPw: Symbol('PCM/PW'),
    ftToM: Symbol('FT/M'),
    mToFt: Symbol('M/FT'),
    gbpUsd: Symbol('GBP/USD'),
    usdGbp: Symbol('USD/GBP'),
    gbpEur: Symbol('GBP/EUR'),
    eurGbp: Symbol('EUR/GBP'),
    letterThousand: Symbol('Letter/Thousand'),
    letterMillion: Symbol('Letter/Million'),
};

export const type = {
    isSymbol: (x: unknown): x is symbol => typeof x === 'symbol',
    isNumber: (x: unknown): x is number | bigint => typeof x === 'number' || typeof x === 'bigint',
    isString: (x: unknown): x is string => typeof x === 'string',
    isNumbery: (x: unknown): boolean => type.isString(x) || type.isNumber(x),
    isNumberAsString: (x: unknown): boolean => /^[0-9]+$/i.test(x as string),
    isDecimal: (x: unknown): boolean => String(x).includes('.'),
    isPartialDecimal: (x: unknown): boolean => String(x).endsWith('.'),
};

export const infinity = Symbol('∞');

export class Final {
    value: unknown = null;
    constructor(value: unknown) {
        this.value = value;
    }
}

export const final = {
    wrap: (x: unknown) => new Final(x),
    unwrap: (x: Final) => x.value,
};

export function mapKey(value: unknown) {
    return type.isNumberAsString(value) ? Number(value) : getMatchingSymbol(value) || null;
}

export type Rates = Record<string, number>;

export type Expression = unknown[];

export type Args = {
    expression: unknown[];
    meta?: { rates?: Record<string, number> };
    value?: unknown;
    lastValue?: unknown;
    lastValueDropped?: unknown[];
    isNumberyCurrent?: boolean;
    isOperationCurrent?: boolean;
    isFinalLast?: boolean;
    isNumberyLast?: boolean;
    isOperationLast?: boolean;
    isInfinityLast?: boolean;
    isCalculable?: boolean;
    isImmutable?: boolean;
    operation?: symbol;
};

function getMatchingSymbol(value: unknown) {
    switch (value) {
        case '+':
            return operation.add;
        case '-':
            return operation.minus;
        case '*':
            return operation.multiply;
        case '/':
            return operation.divide;
        case 'Enter':
        case '=':
            return operation.equals;
        case '%':
            return operation.percent;
        case '.':
            return operation.decimal;
        case 'Backspace':
            return operation.back;
        case 'k':
            return operation.letterThousand;
        case 'm':
            return operation.letterMillion;
    }

    return null;
}

export function getExpression(expression: unknown[]) {
    return expression.length === 0
        ? [0]
        : expression
              .map((x) => {
                  if (x instanceof Final) return type.isSymbol(x.value) ? (x.value as symbol).description : x.value;
                  if (type.isSymbol(x)) return (x as symbol).description;
                  return x;
              })
              .join('');
}

export function getLastValue(expression: unknown[]) {
    return expression[expression.length - 1] ?? null;
}

export function getNumericValue(value: unknown) {
    if (!Number.isFinite(value)) return infinity;

    return Number(value) > Number.MAX_SAFE_INTEGER
        ? BigInt(value as number)
        : Number(parseFloat(value as string).toPrecision(12));
}

export function mapCurrencies(currencies: { currency: string; value: unknown }[]) {
    return currencies.reduce(
        (accum, model) => ({
            ...accum,
            [model.currency]: model.value,
        }),
        {} as Record<string, unknown>,
    );
}
