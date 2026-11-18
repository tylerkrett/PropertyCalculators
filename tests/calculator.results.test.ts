import { expect, test } from 'vitest';

import * as utils from '../src/calculator/engine';

test('It should be able to clear final values when deleting;', () => {
    const expression = utils.constructExpression([utils.final.wrap(100)], utils.operation.back);
    expect(expression).toEqual([]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to start the number from scratch when last value is final;', () => {
    const expression = utils.constructExpression([utils.final.wrap(100)], 5);
    expect(expression).toEqual([5]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to start decimals from scratch when last value is final;', () => {
    const expression = utils.constructExpression([utils.final.wrap(100)], utils.operation.decimal);
    expect(expression).toEqual(['0.']);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to unwrap the final value when performing a calculation;', () => {
    const expression = utils.constructExpression([utils.final.wrap(2)], utils.operation.multiply);
    expect(expression).toEqual([2, utils.operation.multiply]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to compute the percentage when the last value is final;', () => {
    const expression = utils.constructExpression([utils.final.wrap(1500)], utils.operation.percent);
    expect(expression).toEqual([utils.final.wrap(15)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to unwrap and invert the final value;', () => {
    const expression = utils.constructExpression([utils.final.wrap(10)], utils.operation.invert);
    expect(expression).toEqual([-10]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([utils.final.wrap(-25)], utils.operation.invert);
        expect(expression).toEqual([25]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to handle big numbers when calculating with standard numbers;', () => {
    const expression = utils.constructExpression(
        [utils.final.wrap(BigInt(1_000_000_000_000_000_000))],
        utils.operation.letterMillion,
    );
    expect(expression).toEqual([
        // biome-ignore lint: it is for test
        utils.final.wrap(BigInt(999_999_999_999_999_983_222_784)),
    ]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression(
            [Number.MAX_SAFE_INTEGER, utils.operation.multiply, 2],
            utils.operation.equals,
        );
        expect(expression).toEqual([utils.final.wrap(BigInt(18_014_398_509_481_982))]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to gracefully handled infinity values;', () => {
    const expression = utils.constructExpression([utils.final.wrap(utils.infinity)], 7);
    expect(expression).toEqual([7]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([utils.final.wrap(utils.infinity)], utils.operation.multiply);
        expect(expression).toEqual([utils.final.wrap(utils.infinity)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([utils.final.wrap(utils.infinity)], utils.operation.decimal);
        expect(expression).toEqual(['0.']);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([utils.final.wrap(utils.infinity)], utils.operation.percent);
        expect(expression).toEqual([utils.final.wrap(utils.infinity)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([utils.final.wrap(utils.infinity)], utils.operation.pcmToPw);
        expect(expression).toEqual([utils.final.wrap(utils.infinity)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([utils.final.wrap(utils.infinity)], utils.operation.invert);
        expect(expression).toEqual([utils.final.wrap(utils.infinity)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});
