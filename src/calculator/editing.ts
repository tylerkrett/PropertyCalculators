import { type Args, Final, dropLast, final, getLastValue, getNumericValue, operation, type } from './operations';

/*
 * Building and evaluating an expression: typing digits and operators, deleting, inverting,
 * decimals, and working out the result.
 */

export function concat({
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
        const expression = equals({ ...args, isCalculable });
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

export function clear({ expression }: Args) {
    return dropLast(expression);
}

export function back({ expression, lastValue, isNumberyLast, lastValueDropped }: Args) {
    if (!isNumberyLast) return lastValueDropped;

    return [...dropLast(expression), String(lastValue).slice(0, -1)].filter((x) => x !== '-' && x !== '');
}

export function invert({ expression, lastValue, isInfinityLast, isFinalLast, isNumberyLast }: Args) {
    if (isInfinityLast) return expression;

    if (isFinalLast) return [-Number(final.unwrap(lastValue as Final))];

    return isNumberyLast ? [...dropLast(expression), -(lastValue as number)] : expression;
}

export function decimal({ isNumberyLast, isFinalLast, lastValueDropped, ...args }: Args) {
    if (isFinalLast) return ['0.'];

    const lastValue = isNumberyLast ? args.lastValue : 0;
    const expression = isNumberyLast ? lastValueDropped : args.expression;

    return [...(expression ?? []), type.isDecimal(lastValue) ? lastValue : `${lastValue}.`];
}

export function equals({ expression, isCalculable, isImmutable }: Args) {
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

export function apply({ isFinalLast, isCalculable, lastValue, isNumberyLast, ...args }: Args) {
    return (f: (x: number) => unknown) => {
        if (isFinalLast) return [f(Number(final.unwrap(getLastValue(args.expression) as Final)))];

        if (!isNumberyLast) return args.expression;

        if (isCalculable) {
            const expression = equals({
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
