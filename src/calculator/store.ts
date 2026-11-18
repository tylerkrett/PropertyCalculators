import { constructExpression, type Expression, getExpression, mapCurrencies, mapKey, type Rates } from './engine';

/*
 * Calculator state. `reducer`/`bindActions`/`getInitialState` are a plain reducer set (for
 * `useReducer` or `hooks.useDuck`); `createCalculator()` wraps them in a tiny store for anything
 * else, including `useSyncExternalStore`.
 */

export type CalculatorState = { expression: Expression; rates?: Rates };

/** An exchange rate: the value of one unit of `currency` in pounds. */
export type ExchangeRate = { currency: string; value: number };

/** A digit, an `operation` symbol, or `null` (ignored). */
export type CalculatorInput = number | symbol | null;

const actionTypes = {
    expression: Symbol('expression'),
    rates: Symbol('exchangeRates'),
};

type Action =
    | { type: symbol; payload: { value: CalculatorInput } }
    | { type: symbol; payload: { values: ExchangeRate[] } };

export function getInitialState(): CalculatorState {
    return { expression: [] };
}

export function bindActions(dispatch: (action: Action) => void) {
    return {
        /** A button press: a digit or an `operation` symbol. */
        updateExpression: (value: CalculatorInput) => dispatch({ type: actionTypes.expression, payload: { value } }),
        /** A keyboard key (`event.key`); keys the calculator doesn't use are ignored. */
        handleInput: (key: string) => dispatch({ type: actionTypes.expression, payload: { value: mapKey(key) } }),
        /** Exchange rates, needed before the currency buttons work. */
        setRates: (values: ExchangeRate[]) => dispatch({ type: actionTypes.rates, payload: { values } }),
    };
}

export function reducer(state: CalculatorState, event: Action): CalculatorState {
    switch (event.type) {
        case actionTypes.expression: {
            const { value } = event.payload as { value: CalculatorInput };
            if (value === null || value === undefined) return state;

            return { ...state, expression: constructExpression(state.expression, value, state) ?? state.expression };
        }

        case actionTypes.rates:
            return {
                ...state,
                rates: mapCurrencies((event.payload as { values: ExchangeRate[] }).values) as Rates,
            };
    }

    return state;
}

/** The text for the calculator's screen: `"0"` when empty, otherwise e.g. `"25×4"`. */
export function getDisplay(state: CalculatorState | Expression): string {
    const expression = Array.isArray(state) ? state : state.expression;
    return expression.length === 0 ? '0' : String(getExpression(expression));
}

/** Whether the currency buttons can be used yet. */
export const hasRates = (state: CalculatorState): boolean =>
    typeof state.rates?.USD === 'number' && typeof state.rates?.EUR === 'number';

export function createCalculator(initial: CalculatorState = getInitialState()) {
    let state = initial;
    const listeners = new Set<() => void>();
    const actions = bindActions((action) => {
        const next = reducer(state, action);
        if (next === state) return;
        state = next;
        for (const listener of listeners) listener();
    });

    return {
        getState: () => state,
        getDisplay: () => getDisplay(state),
        hasRates: () => hasRates(state),
        /** Press a button: a digit or an `operation` symbol (the `value` of a layout button). */
        input: actions.updateExpression,
        /** Feed a keyboard key. Returns whether the calculator used it, so the caller can `preventDefault`. */
        press(key: string): boolean {
            if (mapKey(key) === null) return false;
            actions.handleInput(key);
            return true;
        },
        setRates: actions.setRates,
        /** Returns the unsubscribe function. */
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

export type Calculator = ReturnType<typeof createCalculator>;
