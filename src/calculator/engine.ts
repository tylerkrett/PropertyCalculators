/*
 * The desk calculator's expression engine. An expression is an array of numbers, numeric strings (while typing), operation
 * symbols and `Final` results; `constructExpression(expression, input, meta)` returns the next one.
 */

const dropLast = <T,>(list: readonly T[]): T[] => list.slice(0, -1);

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

const type = {
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

type Args = {
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

export function constructExpression(expression: unknown[], value: unknown, meta?: unknown) {
    const args = getArguments(expression, value, meta);

    switch (value) {
        case operation.allClear:
            return [];
        case operation.clear:
            return method.clear(args);
        case operation.back:
            return method.back(args);
        case operation.percent:
            return method.percent(args);
        case operation.invert:
            return method.invert(args);
        case operation.decimal:
            return method.decimal(args);
        case operation.equals:
            return method.equals({ ...args, isImmutable: true });
        case operation.vatMinus:
        case operation.vatPlus:
            return method.vat({ ...args, operation: value });
        case operation.pcmToPw:
        case operation.pwToPcm:
            return method.pcwPm({ ...args, operation: value });
        case operation.ftToM:
        case operation.mToFt:
            return method.ftM({ ...args, operation: value });
        case operation.gbpUsd:
        case operation.usdGbp:
        case operation.gbpEur:
        case operation.eurGbp:
            return method.currency({ ...args, operation: value });
        case operation.letterThousand:
        case operation.letterMillion:
            return method.letter({ ...args, operation: value });
        default:
            return method.concat(args);
    }
}

function getArguments(expression: unknown[], value: unknown, meta: unknown): Args {
    const lastValue = getLastValue(expression);
    const lastValueDropped = dropLast(expression);

    const isNumberyCurrent = type.isNumbery(value);
    const isOperationCurrent = type.isSymbol(value);

    const isNumberyLast = type.isNumbery(lastValue);
    const isOperationLast = type.isSymbol(lastValue);
    const isFinalLast = lastValue instanceof Final;
    const isInfinityLast = isFinalLast && lastValue.value === infinity;

    const hasOperation = expression.filter(type.isSymbol).length >= 1;

    return {
        expression,
        meta: meta as Args['meta'],
        value,
        lastValue,
        lastValueDropped,
        isNumberyCurrent,
        isOperationCurrent,
        isFinalLast,
        isNumberyLast,
        isOperationLast,
        isInfinityLast,
        isCalculable: hasOperation && isOperationCurrent,
    };
}

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

function getNumericValue(value: unknown) {
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

function concat({
    value,
    lastValue,
    lastValueDropped,
    isNumberyCurrent,
    isNumberyLast,
    isCalculable,
    isOperationCurrent,
    isOperationLast,
    isFinalLast,
    isInfinityLast,
    ...args
}: Args) {
    const isMultiOperator = isOperationCurrent && isOperationLast;
    const isPartialDecimal = type.isPartialDecimal(lastValue);

    if (isMultiOperator) return [...(lastValueDropped ?? []), value];

    if (isInfinityLast && isOperationCurrent) return args.expression;

    if (isNumberyCurrent && isFinalLast) return [value];
    if (isOperationCurrent && isFinalLast) return [final.unwrap(lastValue as Final), value];

    if (isCalculable) {
        const expression = method.equals({ ...args, isCalculable });
        // An invalid result (such as dividing by zero) clears the expression; don't start a new one with an operator.
        return expression.length === 0 ? [] : [...expression, value];
    }

    if (isNumberyCurrent && isPartialDecimal) return [...(lastValueDropped ?? []), `${lastValue}${value}`];

    if (isNumberyCurrent && isNumberyLast) {
        if (Number(lastValue) === 0) return [...(lastValueDropped ?? []), value];
        return [...(lastValueDropped ?? []), `${lastValue}${value}`];
    }

    if (isOperationCurrent && !isNumberyLast) return args.expression;

    if (isOperationCurrent && type.isPartialDecimal(lastValue)) return [Number(args.expression), value];

    return [...args.expression, value];
}

function clear({ expression }: Args) {
    return dropLast(expression);
}

function back({ expression, lastValue, isNumberyLast, lastValueDropped }: Args) {
    if (!isNumberyLast) return lastValueDropped;

    return [...dropLast(expression), String(lastValue).slice(0, -1)].filter((x) => x !== '-' && x !== '');
}

function invert({ expression, lastValue, isInfinityLast, isFinalLast, isNumberyLast }: Args) {
    if (isInfinityLast) return expression;

    if (isFinalLast) return [-Number(final.unwrap(lastValue as Final))];

    return isNumberyLast ? [...dropLast(expression), -(lastValue as number)] : expression;
}

function decimal({ isNumberyLast, isFinalLast, lastValueDropped, ...args }: Args) {
    if (isFinalLast) return ['0.'];

    const lastValue = isNumberyLast ? args.lastValue : 0;
    const expression = isNumberyLast ? lastValueDropped : args.expression;

    return [...(expression ?? []), type.isDecimal(lastValue) ? lastValue : `${lastValue}.`];
}

function equals({ expression, isCalculable, isImmutable }: Args) {
    if (!isCalculable) return expression;

    const [x, symbol, y = x] = expression;
    const a = Number(x);
    const b = Number(y);

    const result = (() => {
        switch (symbol) {
            case operation.add:
                return a + b;
            case operation.minus:
                return a - b;
            case operation.multiply:
                return a * b;
            case operation.divide:
                return a / b;
            default:
                return undefined;
        }
    })();

    const isInvalid = Number.isNaN(result) || !Number.isFinite(result) || !type.isNumber(result);

    const wrap = isImmutable ? final.wrap : (x: unknown) => x;
    return isInvalid ? [] : [wrap(getNumericValue(result))];
}

function apply({ isFinalLast, isCalculable, lastValue, isNumberyLast, ...args }: Args) {
    return (f: (x: number) => unknown) => {
        if (isFinalLast) return [f(Number(final.unwrap(getLastValue(args.expression) as Final)))];

        if (!isNumberyLast) return args.expression;

        if (isCalculable) {
            const expression = method.equals({
                isCalculable,
                lastValue,
                isNumberyLast,
                ...args,
            });

            return [f(Number(getLastValue(expression)))];
        }

        return [f(Number(lastValue))];
    };
}

function percent(args: Args) {
    if (args.isInfinityLast) return args.expression;
    return apply(args)((x) => final.wrap(x / 100));
}

function vat(args: Args) {
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

function pcwPm(args: Args) {
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

function ftM(args: Args) {
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

function currency(args: Args) {
    if (args.isInfinityLast) return args.expression;

    // Without a usable rate the conversion does nothing, rather than throwing or showing Infinity.
    const code = args.operation === operation.gbpUsd || args.operation === operation.usdGbp ? 'USD' : 'EUR';
    const rate = args.meta?.rates?.[code];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return args.expression;

    const f = apply(args);

    switch (args.operation) {
        case operation.gbpUsd:
            return f((x) => final.wrap(Number((x / args.meta!.rates!.USD!).toFixed(2))));
        case operation.usdGbp:
            return f((x) => final.wrap(Number((x * args.meta!.rates!.USD!).toFixed(2))));
        case operation.gbpEur:
            return f((x) => final.wrap(Number((x / args.meta!.rates!.EUR!).toFixed(2))));
        case operation.eurGbp:
            return f((x) => final.wrap(Number((x * args.meta!.rates!.EUR!).toFixed(2))));
        default:
            return undefined;
    }
}

function letter(args: Args) {
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

export const method = {
    clear,
    back,
    invert,
    decimal,
    percent,
    vat,
    equals,
    concat,
    pcwPm,
    ftM,
    currency,
    letter,
};
