import { currency, ftM, letter, pcwPm, percent, vat } from './conversions';
import { back, clear, concat, decimal, equals, invert } from './editing';
import { type Args, Final, dropLast, getLastValue, infinity, operation, type } from './operations';

/*
 * The desk calculator's expression engine. An expression is an array of numbers, numeric strings
 * (while typing), operation symbols and `Final` results; `constructExpression(expression, input,
 * meta)` returns the next one.
 */

export type { Expression, Rates } from './operations';
export { Final, final, getExpression, getLastValue, infinity, mapCurrencies, mapKey, operation } from './operations';

export const method = { clear, back, invert, decimal, percent, vat, equals, concat, pcwPm, ftM, currency, letter };

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
