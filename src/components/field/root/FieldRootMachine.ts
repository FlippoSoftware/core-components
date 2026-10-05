import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { createDefaultForm } from '~@components/form/root/FormController';
import { EMPTY_OBJECT } from '~@lib/constants';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { FieldsetMachine } from '~@components/fieldset/root/FieldsetMachine';
import type { FormController, FormValidationMode, FormValues } from '~@components/form/root/FormController';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { MutableRef } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { DEFAULT_VALIDITY_STATE, fieldValidityMapping, getCombinedFieldValidityData } from '../utils/fieldValidity';

import type { FieldValidityData } from '../utils/fieldValidity';

export type FieldValidate = (value: unknown, formValues: FormValues) => string | string[] | null | Promise<string | string[] | null>;

export type FieldRootOptions = {
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * Identifies the field when a form is submitted.
     */
    name?: string | undefined;
    /**
     * Custom validation: return error message(s), or `null` when valid.
     */
    validate?: FieldValidate | undefined;
    /**
     * Defaults to the form's validation mode.
     */
    validationMode?: FormValidationMode | undefined;
    /**
     * Debounce of `validate` with `validationMode="onChange"`, in milliseconds.
     * @default 0
     */
    validationDebounceTime?: number | undefined;
    invalid?: boolean | undefined;
    dirty?: boolean | undefined;
    touched?: boolean | undefined;
    /**
     * The enclosing form.
     */
    form?: FormController | null | undefined;
    /**
     * The enclosing fieldset.
     */
    fieldset?: FieldsetMachine | null | undefined;
    /**
     * Label/description associations of the field.
     */
    labelable?: LabelableController | null | undefined;
    /**
     * Runs a state change synchronously in the adapter's renderer (`ReactDOM.flushSync`), so that
     * form submission can be prevented right after validation.
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

export type FieldRootState = {
    disabled: boolean;
    touched: boolean;
    dirty: boolean;
    valid: boolean | null;
    filled: boolean;
    focused: boolean;
};

type FieldInternalState = {
    touched: boolean;
    dirty: boolean;
    filled: boolean;
    focused: boolean;
    validityData: FieldValidityData;
};

const validityKeys = Object.keys(DEFAULT_VALIDITY_STATE) as (keyof ValidityState)[];

function isOnlyValueMissing(state: Record<keyof ValidityState, boolean> | undefined) {
    if (!state || state.valid || !state.valueMissing) {
        return false;
    }

    let onlyValueMissing = false;

    for (const key of validityKeys) {
        if (key === 'valid') {
            continue;
        }
        if (key === 'valueMissing') {
            onlyValueMissing = state[key];
        }
        if (state[key]) {
            onlyValueMissing = false;
        }
    }

    return onlyValueMissing;
}

const runImmediately = (fn: () => void) => fn();

/**
 * State machine of a form field: touched/dirty/filled/focused flags and validation.
 * Replacement for `FieldRoot` + `useFieldValidation` + `useField`.
 */
export class FieldRootMachine {
    readonly store: Store<FieldInternalState>;

    /**
     * The validated input element.
     */
    readonly inputRef: MutableRef<HTMLInputElement | null> = { current: null };

    readonly markedDirtyRef: MutableRef<boolean> = { current: false };

    private options: FieldRootOptions;

    private readonly timeout = new Timeout();

    private readonly defaultForm = createDefaultForm();

    constructor(options: FieldRootOptions = {}) {
        this.options = options;
        this.store = new Store<FieldInternalState>({
            touched: false,
            dirty: false,
            filled: false,
            focused: false,
            validityData: {
                state: DEFAULT_VALIDITY_STATE,
                error: '',
                errors: [],
                value: null,
                initialValue: null
            }
        });
    }

    setOptions(options: FieldRootOptions) {
        this.options = options;
    }

    destroy() {
        this.timeout.clear();
    }

    get form(): FormController {
        return this.options.form ?? this.defaultForm;
    }

    get name() {
        return this.options.name;
    }

    get disabled() {
        return (this.options.fieldset?.disabled ?? false) || (this.options.disabled ?? false);
    }

    get validationMode(): FormValidationMode {
        return this.options.validationMode ?? this.form.validationMode;
    }

    get validationDebounceTime() {
        return this.options.validationDebounceTime ?? 0;
    }

    get validityData() {
        return this.store.state.validityData;
    }

    get invalid() {
        const { name, invalid } = this.options;
        const errors = this.form.errors;
        return Boolean(invalid || (name && Object.hasOwn(errors, name) && errors[name] !== undefined));
    }

    getState(): FieldRootState {
        const { dirty, touched } = this.options;
        const internal = this.store.state;
        return {
            disabled: this.disabled,
            touched: touched ?? internal.touched,
            dirty: dirty ?? internal.dirty,
            valid: !this.invalid && internal.validityData.state.valid,
            filled: internal.filled,
            focused: internal.focused
        };
    }

    static attrs(state: FieldRootState): Record<string, string> {
        return getStyleHookProps(state, fieldValidityMapping);
    }

    setTouched = (value: boolean) => {
        if (this.options.touched === undefined) {
            this.store.set('touched', value);
        }
    };

    setDirty = (value: boolean) => {
        if (this.options.dirty !== undefined) {
            return;
        }
        if (value) {
            this.markedDirtyRef.current = true;
        }
        this.store.set('dirty', value);
    };

    setFilled = (value: boolean) => {
        this.store.set('filled', value);
    };

    setFocused = (value: boolean) => {
        this.store.set('focused', value);
    };

    setValidityData = (update: FieldValidityData | ((previous: FieldValidityData) => FieldValidityData)) => {
        this.store.set('validityData', typeof update === 'function' ? update(this.store.state.validityData) : update);
    };

    shouldValidateOnChange = () => {
        const validationMode = this.validationMode;
        return validationMode === 'onChange' || (validationMode === 'onSubmit' && this.form.submitAttemptedRef.current);
    };

    private writeFormField(nextValidityData: FieldValidityData, invalid: boolean) {
        const controlId = this.options.labelable?.controlId;
        if (controlId) {
            const currentFieldData = this.form.fields.get(controlId);
            if (currentFieldData) {
                this.form.fields.set(controlId, {
                    ...currentFieldData,
                    validityData: getCombinedFieldValidityData(nextValidityData, invalid)
                });
            }
        }
    }

    /**
     * Validates `value` (native constraint validation + custom `validate`) and stores the result.
     *
     * @param revalidate Only re-check a field that is already invalid (used on change before the first submit).
     */
    commit = async (value: unknown, revalidate = false) => {
        const element = this.inputRef.current;
        if (!element) {
            return;
        }

        const validityData = this.store.state.validityData;

        if (revalidate) {
            if (this.getState().valid !== false) {
                return;
            }

            const currentNativeValidity = element.validity;

            if (!currentNativeValidity.valueMissing) {
                // The 'valueMissing' (required) condition has been resolved by the user typing.
                // Temporarily mark the field as valid for this onChange event.
                // Other native errors (e.g., typeMismatch) will be caught by full validation on blur or submit.
                const nextValidityData: FieldValidityData = {
                    value,
                    state: { ...DEFAULT_VALIDITY_STATE, valid: true },
                    error: '',
                    errors: [],
                    initialValue: validityData.initialValue
                };
                element.setCustomValidity('');
                this.writeFormField(nextValidityData, false);
                this.setValidityData(nextValidityData);
                return;
            }

            const currentNativeValidityObject = validityKeys.reduce(
                (acc, key) => {
                    acc[key] = currentNativeValidity[key];
                    return acc;
                },
                {} as Record<keyof ValidityState, boolean>
            );

            // If it's (still) natively invalid due to something other than just valueMissing,
            // then bail from this revalidation on change to avoid "scolding" for other errors.
            if (!currentNativeValidityObject.valid && !isOnlyValueMissing(currentNativeValidityObject)) {
                return;
            }
        }

        const getState = (el: HTMLInputElement) => {
            const computedState = validityKeys.reduce(
                (acc, key) => {
                    acc[key] = el.validity[key];
                    return acc;
                },
                {} as Record<keyof ValidityState, boolean>
            );

            let hasOnlyValueMissingError = false;

            for (const key of validityKeys) {
                if (key === 'valid') {
                    continue;
                }
                if (key === 'valueMissing' && computedState[key]) {
                    hasOnlyValueMissingError = true;
                } else if (computedState[key]) {
                    return computedState;
                }
            }

            // Only make `valueMissing` mark the field invalid if it's been changed
            // to reduce error noise.
            if (hasOnlyValueMissingError && !this.markedDirtyRef.current) {
                computedState.valid = true;
                computedState.valueMissing = false;
            }
            return computedState;
        };

        this.timeout.clear();

        let result: null | string | string[] = null;
        let validationErrors: string[] = [];

        const nextState = getState(element);

        let defaultValidationMessage: string | undefined;
        const validateOnChange = this.shouldValidateOnChange();

        if (element.validationMessage && !validateOnChange) {
            // not validating on change, if there is a `validationMessage` from
            // native validity, set errors and skip calling the custom validate fn
            defaultValidationMessage = element.validationMessage;
            validationErrors = [element.validationMessage];
        } else {
            const formValues = Array.from(this.form.fields.values()).reduce<FormValues>((acc, field) => {
                if (field.name) {
                    acc[field.name] = field.getValue();
                }
                return acc;
            }, {});

            const validate = this.options.validate ?? (() => null);
            const resultOrPromise = validate(value, formValues);
            result =
                typeof resultOrPromise === 'object' && resultOrPromise !== null && 'then' in resultOrPromise
                    ? await resultOrPromise
                    : resultOrPromise;

            if (result !== null) {
                nextState.valid = false;
                nextState.customError = true;

                if (Array.isArray(result)) {
                    validationErrors = result;
                    element.setCustomValidity(result.join('\n'));
                } else if (result) {
                    validationErrors = [result];
                    element.setCustomValidity(result);
                }
            } else if (validateOnChange) {
                // validate function returned no errors, if validating on change
                // we need to clear the custom validity state
                element.setCustomValidity('');
                nextState.customError = false;

                if (element.validationMessage) {
                    defaultValidationMessage = element.validationMessage;
                    validationErrors = [element.validationMessage];
                } else if (element.validity.valid && !nextState.valid) {
                    nextState.valid = true;
                }
            }
        }

        const nextValidityData: FieldValidityData = {
            value,
            state: nextState,
            error: defaultValidationMessage ?? (Array.isArray(result) ? (result[0] ?? '') : (result ?? '')),
            errors: validationErrors,
            initialValue: this.store.state.validityData.initialValue
        };

        this.writeFormField(nextValidityData, this.invalid);
        this.setValidityData(nextValidityData);
    };

    /**
     * `aria-describedby` and `aria-invalid` for a control.
     */
    getValidationProps = (externalProps: Props = {}): Props => {
        const getDescriptionProps = this.options.labelable?.getDescriptionProps ?? ((props: Props) => props);
        return mergeProps(getDescriptionProps, this.getState().valid === false ? { 'aria-invalid': true } : EMPTY_OBJECT, externalProps);
    };

    /**
     * Validation props for an `<input>`: validates on change according to the validation mode.
     */
    getInputValidationProps = (externalProps: Props = {}): Props => {
        return mergeProps(
            {
                onChange: (event: Event & { nativeEvent?: Event }) => {
                    // Workaround for https://github.com/facebook/react/issues/9023
                    if ((event.nativeEvent ?? event).defaultPrevented) {
                        return;
                    }

                    this.form.clearErrors(this.name);

                    const element = event.currentTarget as HTMLInputElement;

                    if (!this.shouldValidateOnChange()) {
                        this.commit(element.value, true);
                        return;
                    }

                    if (this.invalid) {
                        return;
                    }

                    if (element.value === '') {
                        // Ignore the debounce time for empty values.
                        this.commit(element.value);
                        return;
                    }

                    this.timeout.clear();

                    if (this.validationDebounceTime) {
                        this.timeout.start(this.validationDebounceTime, () => {
                            this.commit(element.value);
                        });
                    } else {
                        this.commit(element.value);
                    }
                }
            },
            this.getValidationProps(externalProps)
        );
    };

    /**
     * Registers a control in the form (replacement for `useField`). Call again whenever a parameter changes.
     *
     * @returns A function that unregisters the control.
     */
    registerControl(params: {
        id: string | undefined;
        name?: string | undefined;
        value: unknown;
        getValue: () => unknown;
        controlRef: MutableRef<HTMLElement | null>;
        commit?: ((value: unknown) => void) | undefined;
        enabled?: boolean | undefined;
    }): () => void {
        const { id, name, value, getValue, controlRef, commit = this.commit, enabled = true } = params;
        if (!enabled) {
            return () => {};
        }

        let initialValue = value;
        if (initialValue === undefined) {
            initialValue = getValue();
        }

        if (this.store.state.validityData.initialValue === null && initialValue !== null) {
            this.setValidityData((prev) => ({ ...prev, initialValue }));
        }

        if (!id) {
            return () => {};
        }

        const flushSync = this.options.flushSync ?? runImmediately;
        const fields = this.form.fields;

        fields.set(id, {
            getValue,
            name,
            controlRef,
            validityData: getCombinedFieldValidityData(this.store.state.validityData, this.invalid),
            validate: () => {
                let nextValue = value;
                if (nextValue === undefined) {
                    nextValue = getValue();
                }
                this.markedDirtyRef.current = true;
                // Synchronously update the validity state so the submit event can be prevented.
                flushSync(() => {
                    commit(nextValue);
                });
            }
        });

        return () => {
            fields.delete(id);
        };
    }

    /**
     * Whether `<Field.Error>` with `match` should render.
     */
    isErrorRendered(match?: boolean | keyof ValidityState) {
        const name = this.name;
        const formError = name ? this.form.errors[name] : null;
        if (formError || match === true) {
            return true;
        }
        if (match) {
            return Boolean(this.validityData.state[match as keyof typeof this.validityData.state]);
        }
        return this.validityData.state.valid === false;
    }

    /**
     * Error message(s) to show: form errors first, then the validation errors.
     */
    getErrorMessages(): string | string[] {
        const name = this.name;
        const formError = name ? this.form.errors[name] : null;
        if (formError) {
            return formError;
        }
        return this.validityData.errors.length > 1 ? this.validityData.errors : this.validityData.error;
    }

    /**
     * Validity exposed to `<Field.Validity>`.
     */
    getValidityState() {
        const combined = getCombinedFieldValidityData(this.validityData, this.invalid);
        return { ...combined, validity: combined.state };
    }
}

/**
 * The field used by controls rendered outside of `<Field.Root>`: default state,
 * no-op setters and pass-through validation props (same as the default field context).
 */
export class DetachedFieldRoot extends FieldRootMachine {
    readonly detached = true;

    override setTouched = () => {};

    override setDirty = () => {};

    override setFilled = () => {};

    override setFocused = () => {};

    override setValidityData = () => {};

    override shouldValidateOnChange = () => false;

    override commit = async () => {};

    override getValidationProps = (externalProps: Props = {}) => externalProps;

    override getInputValidationProps = (externalProps: Props = {}) => externalProps;

    override getState(): FieldRootState {
        return { disabled: false, valid: null, touched: false, dirty: false, filled: false, focused: false };
    }

    override get disabled() {
        return false;
    }

    override registerControl() {
        return () => {};
    }
}

/**
 * Creates the field used by controls rendered outside of `<Field.Root>`.
 */
export function createDetachedField(): FieldRootMachine {
    return new DetachedFieldRoot();
}
