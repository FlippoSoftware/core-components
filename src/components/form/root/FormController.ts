import { createGenericEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { EMPTY_OBJECT } from '~@lib/constants';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { Store } from '~@store/Store';

import type { FieldValidityData } from '~@components/field/utils/fieldValidity';
import type { GenericEventDetails } from '~@events/changeEventDetails';
import type { MutableRef } from '~@lib/types';

export type FormValidationMode = 'onSubmit' | 'onBlur' | 'onChange';

export type FormErrors = Record<string, string | string[]>;

export type FormValues = Record<string, unknown>;

export type FormSubmitEventDetails = GenericEventDetails<typeof REASONS.none>;

/**
 * A field registered in a form.
 */
export type FormField = {
    name: string | undefined;
    validate: () => void;
    validityData: FieldValidityData;
    controlRef: MutableRef<HTMLElement | null>;
    getValue: () => unknown;
};

export type FormOptions<Values extends FormValues = FormValues> = {
    /**
     * @default 'onSubmit'
     */
    validationMode?: FormValidationMode | undefined;
    /**
     * Validation errors returned externally (e.g. by a server), keyed by field name.
     */
    errors?: FormErrors | undefined;
    /**
     * Called with the native submit event when the form is valid.
     */
    onSubmit?: ((event: SubmitEvent) => void) | undefined;
    /**
     * Called with the form values when the form is valid; prevents the native submission.
     */
    onFormSubmit?: ((formValues: Values, eventDetails: FormSubmitEventDetails) => void) | undefined;
};

function focusControl(control: HTMLElement | null) {
    if (!control) {
        return;
    }

    control.focus();

    if (control.tagName === 'INPUT') {
        (control as HTMLInputElement).select();
    }
}

/**
 * A native form with consolidated validation: fields register here, the form validates them
 * on submit and focuses the first invalid control.
 * Replacement for the logic of `Form` + `FormContext`.
 */
export class FormController<Values extends FormValues = FormValues> {
    readonly fields = new Map<string, FormField>();

    readonly store: Store<{ errors: FormErrors | undefined }>;

    readonly submitAttemptedRef: MutableRef<boolean> = { current: false };

    private options: FormOptions<Values>;

    private submitted = false;

    private externalErrors: FormErrors | undefined;

    constructor(options: FormOptions<Values> = {}) {
        this.options = options;
        this.externalErrors = options.errors;
        this.store = new Store({ errors: options.errors });
    }

    setOptions(options: FormOptions<Values>) {
        this.options = options;
        if (options.errors !== this.externalErrors) {
            this.externalErrors = options.errors;
            this.setErrors(options.errors);
        }
    }

    get validationMode(): FormValidationMode {
        return this.options.validationMode ?? 'onSubmit';
    }

    get errors(): FormErrors {
        return this.store.state.errors ?? (EMPTY_OBJECT as FormErrors);
    }

    clearErrors = (name: string | undefined) => {
        const errors = this.store.state.errors;
        if (name && errors && Object.hasOwn(errors, name)) {
            const nextErrors = { ...errors };
            delete nextErrors[name];
            this.setErrors(nextErrors);
        }
    };

    /**
     * Props of the `<form>` element.
     */
    getFormProps() {
        return { noValidate: true, onSubmit: this.onSubmit };
    }

    private setErrors(errors: FormErrors | undefined) {
        this.store.set('errors', errors);
        this.afterErrorsChange();
    }

    // After a successful submit, focus the first field the server marked invalid.
    private afterErrorsChange() {
        if (!this.submitted) {
            return;
        }

        this.submitted = false;

        const invalidFields = Array.from(this.fields.values()).filter((field) => field.validityData.state.valid === false);

        if (invalidFields.length) {
            focusControl(invalidFields[0]?.controlRef.current ?? null);
        }
    }

    private readonly onSubmit = (event: SubmitEvent) => {
        this.submitAttemptedRef.current = true;

        // Async validation isn't supported to stop the submit event.
        for (const field of this.fields.values()) {
            field.validate();
        }

        const values = Array.from(this.fields.values());
        const invalidFields = values.filter((field) => !field.validityData.state.valid);

        if (invalidFields.length) {
            event.preventDefault();
            focusControl(invalidFields[0]?.controlRef.current ?? null);
            return;
        }

        this.submitted = true;
        this.options.onSubmit?.(event);

        if (this.options.onFormSubmit) {
            event.preventDefault();
            const formValues = values.reduce<FormValues>((acc, field) => {
                if (field.name) {
                    acc[field.name] = field.getValue();
                }
                return acc;
            }, {}) as Values;
            this.options.onFormSubmit(formValues, createGenericEventDetails(REASONS.none, getNativeEvent(event)));
        }
    };
}

/**
 * The form used when a field is rendered outside of a form.
 */
export function createDefaultForm() {
    return new FormController();
}
