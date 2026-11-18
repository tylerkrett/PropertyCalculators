import { expect, test } from 'vitest';

import * as utils from '../src/calculator/engine';

test('It should be able to handle the currency conversion;', () => {
    const currencies = [
        { currency: 'BTC', description: 'Bitcoin', value: 5714.83 },
        { currency: 'EUR', description: 'Euro', value: 0.912798 },
        { currency: 'USD', description: 'US Dollars', value: 0.85024 },
    ];

    expect(utils.mapCurrencies(currencies)).toEqual({
        BTC: 5714.83,
        EUR: 0.912798,
        USD: 0.85024,
    });
});

test('It should be able to place numbers together;', () => {
    const expression = utils.constructExpression([1], 2);
    expect(expression).toEqual(['12']);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([123], 4);
        expect(expression).toEqual(['1234']);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to separate operations from numbers;', () => {
    const expression = utils.constructExpression([1], utils.operation.add);
    expect(expression).toEqual([1, utils.operation.add]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([123], utils.operation.multiply);
        expect(expression).toEqual([123, utils.operation.multiply]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to handle clearing of operation segments;', () => {
    const expression = utils.constructExpression([123, utils.operation.add], utils.operation.clear);
    expect(expression).toEqual([123]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([123], utils.operation.clear);
        expect(expression).toEqual([]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([789, utils.operation.multiply, 123], utils.operation.clear);
        expect(expression).toEqual([789, utils.operation.multiply]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to handle the clearing of the entire expression;', () => {
    const expression = utils.constructExpression(
        [123, utils.operation.add, 456, utils.operation.add, 789],
        utils.operation.allClear,
    );
    expect(expression).toEqual([]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([123, utils.operation.add], utils.operation.allClear);
        expect(expression).toEqual([]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test(`It should be able to invert the last value only if it's numeric;`, () => {
    const expression = utils.constructExpression([123, utils.operation.add, 456], utils.operation.invert);
    expect(expression).toEqual([123, utils.operation.add, -456]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression(
            [123, utils.operation.add, 456, utils.operation.divide, -789],
            utils.operation.invert,
        );
        expect(expression).toEqual([123, utils.operation.add, 456, utils.operation.divide, 789]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([123, utils.operation.add], utils.operation.invert);
        expect(expression).toEqual([123, utils.operation.add]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to delete the last operation as part of the expression;', () => {
    const expression = utils.constructExpression([], utils.operation.back);
    expect(expression).toEqual([]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([1], utils.operation.back);
        expect(expression).toEqual([]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([123], utils.operation.back);
        expect(expression).toEqual(['12']);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([123, utils.operation.minus], utils.operation.back);
        expect(expression).toEqual([123]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([123, utils.operation.minus, -4], utils.operation.back);

        expect(expression).toEqual([123, utils.operation.minus]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to handle temporary and full decimal numbers;', () => {
    const expression = utils.constructExpression([1], utils.operation.decimal);
    expect(expression).toEqual(['1.']);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression(['1.'], 5);
        expect(expression).toEqual(['1.5']);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to calculate the values entered;', () => {
    const expression = utils.constructExpression([1, utils.operation.add, 1], utils.operation.equals);
    expect(expression).toEqual([utils.final.wrap(2)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle operating on an unfinished decimal;', () => {
    const expression = utils.constructExpression(['1.', utils.operation.add, 2], utils.operation.equals);
    expect(expression).toEqual([utils.final.wrap(3)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle deleting a decimal value;', () => {
    const expression = utils.constructExpression(['123.4'], utils.operation.back);
    expect(expression).toEqual(['123.']);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression(['123.'], utils.operation.back);
        expect(expression).toEqual(['123']);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to handle deleting a negative number;', () => {
    const expression = utils.constructExpression(['-56'], utils.operation.back);
    expect(expression).toEqual(['-5']);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([-5], utils.operation.back);
        expect(expression).toEqual([]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to reject the insertion of multiple decimals;', () => {
    const expression = utils.constructExpression([1.23], utils.operation.decimal);
    expect(expression).toEqual([1.23]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle multiple consecutive operators;', () => {
    const expression = utils.constructExpression([20, utils.operation.multiply], utils.operation.divide);
    expect(expression).toEqual([20, utils.operation.divide]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to calculate the total when entering the second operator;', () => {
    const expression = utils.constructExpression([5, utils.operation.multiply, 5], utils.operation.multiply);
    expect(expression).toEqual([25, utils.operation.multiply]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to ignore operations when there is nothing to calculate;', () => {
    const expression = utils.constructExpression([123], utils.operation.equals);
    expect(expression).toEqual([123]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle invalid calculations and reset to zero;', () => {
    const expression = utils.constructExpression([0, utils.operation.divide, 0], utils.operation.equals);
    expect(expression).toEqual([]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle entering a decimal without any number;', () => {
    const expression = utils.constructExpression([], utils.operation.decimal);
    expect(expression).toEqual(['0.']);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([123, utils.operation.add], utils.operation.decimal);
        expect(expression).toEqual([123, utils.operation.add, '0.']);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to only accept a number as the first value;', () => {
    const expression = utils.constructExpression([], utils.operation.minus);
    expect(expression).toEqual([]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});
