import { expect, test } from 'vitest';

import * as utils from '../src/calculator/engine';

test('It should be able to calculate the percentage of the last entered number;', () => {
    const expression = utils.constructExpression([10], utils.operation.percent);
    expect(expression).toEqual([utils.final.wrap(0.1)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([], utils.operation.percent);
        expect(expression).toEqual([]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([20.5], utils.operation.percent);
        expect(expression).toEqual([utils.final.wrap(0.205)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression(['15.'], utils.operation.percent);
        expect(expression).toEqual([utils.final.wrap(0.15)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to calculate the VAT both plus and minus;', () => {
    const expression = utils.constructExpression([10], utils.operation.vatPlus);
    expect(expression).toEqual([utils.final.wrap(12)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([10], utils.operation.vatMinus);
        expect(expression).toEqual([utils.final.wrap(8.33)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression(['8.'], utils.operation.vatPlus);
        expect(expression).toEqual([utils.final.wrap(9.6)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([8.5, utils.operation.add], utils.operation.vatPlus);
        expect(expression).toEqual([8.5, utils.operation.add]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([], utils.operation.vatPlus);
        expect(expression).toEqual([]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to handle divide by zero;', () => {
    const expression = utils.constructExpression([100, utils.operation.divide, 0], utils.operation.equals);
    expect(expression).toEqual([]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to evaluate expression before calculating percentage;', () => {
    const expression = utils.constructExpression([10, utils.operation.multiply, 10], utils.operation.percent);
    expect(expression).toEqual([utils.final.wrap(1)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be to handle the PCW to PM conversions;', () => {
    const expression = utils.constructExpression([577], utils.operation.pwToPcm);
    expect(expression).toEqual([utils.final.wrap(2500)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([2500], utils.operation.pcmToPw);
        expect(expression).toEqual([utils.final.wrap(577)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be to handle the FT to M conversions;', () => {
    const expression = utils.constructExpression([200], utils.operation.ftToM);
    expect(expression).toEqual([utils.final.wrap(18.58)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([50], utils.operation.mToFt);
        expect(expression).toEqual([utils.final.wrap(538.19)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be to handle the currency conversions;', () => {
    const rates = {
        EUR: 0.91161,
        USD: 0.85134,
    };

    const expression = utils.constructExpression([100], utils.operation.gbpUsd, {
        rates,
    });
    expect(expression).toEqual([utils.final.wrap(117.46)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([100], utils.operation.usdGbp, {
            rates,
        });
        expect(expression).toEqual([utils.final.wrap(85.13)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([100], utils.operation.gbpEur, {
            rates,
        });
        expect(expression).toEqual([utils.final.wrap(109.7)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }

    {
        const expression = utils.constructExpression([100], utils.operation.eurGbp, {
            rates,
        });
        expect(expression).toEqual([utils.final.wrap(91.16)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to remove the partial decimal when performing an operation;', () => {
    const expression = utils.constructExpression(['1.'], utils.operation.minus);
    expect(expression).toEqual([1, utils.operation.minus]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to prevent a leading zero value being part of the expression;', () => {
    const expression = utils.constructExpression([0], 0);
    expect(expression).toEqual([0]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([0], 5);
        expect(expression).toEqual([5]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});

test('It should be able to assume the second value is the same as first when calculating;', () => {
    const expression = utils.constructExpression([10, utils.operation.multiply], utils.operation.equals);
    expect(expression).toEqual([utils.final.wrap(100)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle zero integers with decimal places;', () => {
    const expression = utils.constructExpression(['0.'], 1);
    expect(expression).toEqual(['0.1']);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle 0.1 + 0.2 to equal 0.3;', () => {
    const expression = utils.constructExpression([0.1, utils.operation.add, 0.2], utils.operation.equals);
    expect(expression).toEqual([utils.final.wrap(0.3)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();
});

test('It should be able to handle K and M letters;', () => {
    const expression = utils.constructExpression([1], utils.operation.letterThousand);
    expect(expression).toEqual([utils.final.wrap(1_000)]);
    expect(utils.getExpression(expression!)).toMatchSnapshot();

    {
        const expression = utils.constructExpression([5], utils.operation.letterMillion);
        expect(expression).toEqual([utils.final.wrap(5_000_000)]);
        expect(utils.getExpression(expression!)).toMatchSnapshot();
    }
});
