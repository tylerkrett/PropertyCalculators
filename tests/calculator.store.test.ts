import { describe, expect, it, vi } from 'vitest';

import {
    BASIC_BUTTONS,
    CALCULATOR_LAYOUT,
    createCalculator,
    EXTRA_BUTTONS,
    getDisplay,
    operation,
} from '../src/calculator/index';

const rates = [
    { currency: 'EUR', value: 0.912798 },
    { currency: 'USD', value: 0.85024 },
];

describe('createCalculator', () => {
    it('evaluates button presses and reports the display', () => {
        const calculator = createCalculator();
        expect(calculator.getDisplay()).toBe('0');
        for (const input of [2, 5, operation.multiply, 4]) calculator.input(input);
        expect(calculator.getDisplay()).toBe('25×4');
        calculator.input(operation.equals);
        expect(calculator.getDisplay()).toBe('100');
        calculator.input(operation.vatPlus);
        expect(calculator.getDisplay()).toBe('120');
        calculator.input(operation.allClear);
        expect(calculator.getDisplay()).toBe('0');
    });

    it('takes keyboard keys and says whether it used them', () => {
        const calculator = createCalculator();
        expect('1.5m'.split('').map((key) => calculator.press(key))).toEqual([true, true, true, true]);
        expect(calculator.getDisplay()).toBe('1500000');
        expect(calculator.press('Tab')).toBe(false);
        expect(calculator.press('x')).toBe(false);
        expect(calculator.getDisplay()).toBe('1500000');
    });

    it('converts currency once rates are set', () => {
        const calculator = createCalculator();
        expect(calculator.hasRates()).toBe(false);
        calculator.setRates(rates);
        expect(calculator.hasRates()).toBe(true);
        for (const input of [1, 0, 0, operation.gbpUsd]) calculator.input(input);
        expect(calculator.getDisplay()).toBe('117.61');
    });

    it('notifies subscribers only when something changes', () => {
        const calculator = createCalculator();
        const listener = vi.fn();
        const unsubscribe = calculator.subscribe(listener);
        calculator.input(7);
        calculator.input(null);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        calculator.input(8);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(getDisplay(calculator.getState())).toBe('78');
    });
});

describe('layout', () => {
    it('describes every button once, in grid order', () => {
        expect(BASIC_BUTTONS).toHaveLength(20);
        expect(EXTRA_BUTTONS).toHaveLength(10);
        const all = [...BASIC_BUTTONS, ...EXTRA_BUTTONS];
        expect(new Set(all.map((button) => button.id)).size).toBe(30);
        expect(new Set(all.map((button) => button.value)).size).toBe(30);
        expect(BASIC_BUTTONS.slice(4, 7).map((button) => button.label)).toEqual(['7', '8', '9']);
        expect(EXTRA_BUTTONS.filter((button) => button.requiresRates).map((button) => button.label)).toEqual([
            '£ → €',
            '€ → £',
            '£ → $',
            '$ → £',
        ]);
        expect(CALCULATOR_LAYOUT.basic.columns).toBe(4);
    });

    it('drives the calculator from layout data alone', () => {
        const calculator = createCalculator();
        const press = (id: string) =>
            calculator.input([...BASIC_BUTTONS, ...EXTRA_BUTTONS].find((b) => b.id === id)!.value);
        ['digit-1', 'digit-0', 'digit-0', 'digit-0', 'pw-pcm'].forEach(press);
        expect(calculator.getDisplay()).toBe('4333');
    });
});
