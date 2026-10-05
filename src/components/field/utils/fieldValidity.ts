import { FieldControlDataAttributes } from '../control/FieldControlDataAttributes';

export type FieldValidityState = {
    badInput: boolean;
    customError: boolean;
    patternMismatch: boolean;
    rangeOverflow: boolean;
    rangeUnderflow: boolean;
    stepMismatch: boolean;
    tooLong: boolean;
    tooShort: boolean;
    typeMismatch: boolean;
    valueMissing: boolean;
    valid: boolean | null;
};

export type FieldValidityData = {
    state: FieldValidityState;
    error: string;
    errors: string[];
    value: unknown;
    initialValue: unknown;
};

export const DEFAULT_VALIDITY_STATE: FieldValidityState = {
    badInput: false,
    customError: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valid: null,
    valueMissing: false
};

export const fieldValidityMapping = {
    valid(value: boolean | null): Record<string, string> | null {
        if (value === null) {
            return null;
        }
        if (value) {
            return { [FieldControlDataAttributes.valid]: '' };
        }
        return { [FieldControlDataAttributes.invalid]: '' };
    }
};

/**
 * Combines the field's client-side, stateful validity data with the external invalid state to
 * determine the field's true validity.
 */
export function getCombinedFieldValidityData(validityData: FieldValidityData, invalid: boolean | undefined): FieldValidityData {
    return {
        ...validityData,
        state: {
            ...validityData.state,
            valid: !invalid && validityData.state.valid
        }
    };
}
