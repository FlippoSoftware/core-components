import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

import { CheckboxCardRootDataAttributes } from './CheckboxCardRootDataAttributes';

export const checkboxCardStateAttributesMapping = {
    checked(value: boolean): Record<string, string> {
        return value ? { [CheckboxCardRootDataAttributes.checked]: '' } : { [CheckboxCardRootDataAttributes.unchecked]: '' };
    },
    indeterminate(value: boolean): Record<string, string> | null {
        return value ? { [CheckboxCardRootDataAttributes.indeterminate]: '' } : null;
    },
    disabled(value: boolean) {
        return value ? ({ [CheckboxCardRootDataAttributes.disabled]: '' } as Record<string, string>) : null;
    },
    required(value: boolean) {
        return value ? ({ [CheckboxCardRootDataAttributes.required]: '' } as Record<string, string>) : null;
    },
    ...fieldValidityMapping
};
