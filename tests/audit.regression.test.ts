import { describe, expect, it } from 'vitest';

import { calculateStampDuty, decodeStampDutyHash, getStampDutyPdfModel } from '../src/index';
import { constructExpression, createCalculator, operation } from '../src/calculator/index';

describe('stamp duty accuracy', () => {
    it('does not lose a pound to floating point', () => {
        // (820 / 100) * 15 is 122.99999999999999 in floating point; the tax on that slice is £123.
        expect(calculateStampDuty({ price: 925_820, buyer: 'additional-property' }).stampDuty).toBe(82_623);
        expect(calculateStampDuty({ price: 926_640, buyer: 'additional-property' }).stampDuty).toBe(82_746);
    });

    it('agrees with whole-pence arithmetic at every band edge and around it', () => {
        const buyers = ['home-mover', 'first-time-buyer', 'additional-property'] as const;
        const edges = [40_000, 125_000, 250_000, 300_000, 500_000, 925_000, 1_500_000];
        for (const buyer of buyers)
            for (const nonUkResident of [false, true])
                for (const edge of edges)
                    for (let price = edge - 1500; price <= edge + 1500; price++) {
                        const estimate = calculateStampDuty({ price, buyer, nonUkResident });
                        const expected = estimate.bands.reduce(
                            (sum, band) => sum + Number((BigInt(band.taxable) * BigInt(band.rate)) / 100n),
                            0,
                        );
                        if (estimate.stampDuty !== expected)
                            throw new Error(`${buyer} ${nonUkResident} ${price}: ${estimate.stampDuty} != ${expected}`);
                    }
    });

    it('accounts for the whole price in the breakdown', () => {
        for (const buyer of ['home-mover', 'first-time-buyer', 'additional-property'] as const)
            for (const price of [1, 39_999, 40_000, 40_001, 500_000, 500_001, 2_000_000]) {
                const { bands } = calculateStampDuty({ price, buyer });
                expect(bands.reduce((sum, band) => sum + band.taxable, 0)).toBe(price);
            }
    });
});

describe('untrusted input', () => {
    it('rejects a hash that is not a base64 JSON object', () => {
        for (const hash of ['', '!!!', btoa('null'), btoa('123'), btoa('[]'), btoa('{')])
            expect(() => decodeStampDutyHash(hash)).toThrow(TypeError);
        expect(() => getStampDutyPdfModel({ hash: btoa('null') })).toThrow(/Invalid stamp duty hash/);
    });
});

describe('calculator robustness', () => {
    it('ignores currency buttons until usable rates are set', () => {
        const calculator = createCalculator();
        calculator.input(5);
        calculator.input(operation.gbpEur);
        expect(calculator.getDisplay()).toBe('5');
        calculator.setRates([
            { currency: 'EUR', value: 0 },
            { currency: 'USD', value: Number.NaN },
        ]);
        calculator.input(operation.gbpEur);
        calculator.input(operation.usdGbp);
        expect(calculator.getDisplay()).toBe('5');
    });

    it('recovers from dividing by zero mid-expression', () => {
        const calculator = createCalculator();
        for (const input of [5, operation.divide, 0, operation.minus, 7, operation.equals]) calculator.input(input);
        expect(calculator.getDisplay()).toBe('7');
        expect(constructExpression([5, operation.divide, 0], operation.add)).toEqual([]);
    });

    it('never throws, whatever is pressed', () => {
        const inputs = [...Object.values(operation), 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        let seed = 20261118;
        const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
        for (let run = 0; run < 3000; run++) {
            const calculator = createCalculator();
            if (run % 2) calculator.setRates([{ currency: 'EUR', value: 0.86 }, { currency: 'USD', value: 0.79 }]);
            for (let step = 0; step < 25; step++) calculator.input(inputs[Math.floor(next() * inputs.length)]!);
            expect(typeof calculator.getDisplay()).toBe('string');
        }
    });
});
