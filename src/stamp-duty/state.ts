import { type CalculatedBand, computeActualRate, getBands, getStampDuty } from './calculate';

/*
 * Form state for a stamp duty calculator, framework-free: `methods(state).price(500000)` returns
 * the next state. Works directly with react-use's `useMethods(methods, initialState)`.
 */

export type State = {
    stampDuty: number | null;
    actualRate: number | null;
    computable: boolean;
    bands: CalculatedBand[] | null;
    address: string | null;
    price: number | string | null;
    excludeAddressNumbers: boolean;
    secondHome: boolean;
    firstTimeBuyer: boolean;
    ukResident: boolean;
};

export const initialState: State = {
    stampDuty: null,
    actualRate: null,
    computable: true,
    bands: null,
    address: null,
    price: null,
    excludeAddressNumbers: false,
    secondHome: false,
    firstTimeBuyer: false,
    ukResident: true,
};

export function methods(state: State = initialState) {
    return {
        address(value: string | null): State {
            return { ...state, address: value };
        },
        price(value: number | string | null): State {
            return { ...state, price: value };
        },
        excludeAddressNumbers(value: boolean): State {
            return { ...state, excludeAddressNumbers: value };
        },
        /** Second home and first-time buyer are mutually exclusive: setting one clears the other. */
        secondHome(value: boolean): State {
            return { ...state, firstTimeBuyer: false, secondHome: value };
        },
        firstTimeBuyer(value: boolean): State {
            return { ...state, secondHome: false, firstTimeBuyer: value };
        },
        ukResident(value: boolean): State {
            return { ...state, ukResident: value };
        },
        calculate(): State {
            const bands = getBands(Number(state.price), state);
            const total = getStampDuty(Number(state.price), bands);

            return {
                ...state,
                bands: total.bands,
                stampDuty: total.value,
                actualRate: computeActualRate(Number(state.price), bands),
            };
        },
    };
}

/** Whether the Calculate button should be enabled. */
export const canCalculate = (state: State): boolean => Number(state.price) > 0 && state.computable;
