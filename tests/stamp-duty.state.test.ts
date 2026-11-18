import { expect, test } from 'vitest';

import { canCalculate, methods } from '../src/stamp-duty/index';

test('It should be able to update the property address', () => {
    const state = methods().address('Eaton Square');
    expect(state.address).toBe('Eaton Square');
});

test('It should be able to update the property price', () => {
    const state = methods().price('1250000.00');
    expect(state.price).toBe('1250000.00');
});

test('It should be able to include or exclude address numbers', () => {
    const state = methods().excludeAddressNumbers(true);
    expect(state.excludeAddressNumbers).toBe(true);
    expect(methods(state).excludeAddressNumbers(false).excludeAddressNumbers).toBe(false);
});

test('It should be able to toggle second home', () => {
    const state = methods(methods().firstTimeBuyer(true)).secondHome(true);
    expect(state.secondHome).toBe(true);
    expect(state.firstTimeBuyer).toBe(false);
    expect(methods(state).secondHome(false).secondHome).toBe(false);
});

test('It should be able to toggle first time buyer', () => {
    const state = methods(methods().secondHome(true)).firstTimeBuyer(true);
    expect(state.firstTimeBuyer).toBe(true);
    expect(state.secondHome).toBe(false);
    expect(methods(state).secondHome(false).firstTimeBuyer).toBe(false);
});

test('It should be able to toggle UK resident', () => {
    const state = methods().ukResident(true);
    expect(state.ukResident).toBe(true);
    expect(methods(state).ukResident(false).ukResident).toBe(false);
});

test('It should be able to calculate the stamp duty', () => {
    const state = methods().price(750_000);
    expect(methods(state).calculate().stampDuty).toBe(27_500);
    expect(Math.round(methods(state).calculate().actualRate as number)).toBe(4);
    expect(methods(state).calculate().bands).toMatchSnapshot();
});

test('It should only allow calculating with a price', () => {
    expect(canCalculate(methods().price(null))).toBe(false);
    expect(canCalculate(methods().price(0))).toBe(false);
    expect(canCalculate(methods().price(500_000))).toBe(true);
});
