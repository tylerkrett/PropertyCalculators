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
