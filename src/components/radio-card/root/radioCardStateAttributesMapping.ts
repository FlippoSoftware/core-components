import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

import { RadioCardRootDataAttributes } from './RadioCardRootDataAttributes';

export const radioCardStateAttributesMapping = {
    checked(value: boolean): Record<string, string> {
        return value ? { [RadioCardRootDataAttributes.checked]: '' } : { [RadioCardRootDataAttributes.unchecked]: '' };
    },
    disabled(value: boolean) {
        return value ? ({ [RadioCardRootDataAttributes.disabled]: '' } as Record<string, string>) : null;
    },
    readOnly(value: boolean) {
        return value ? ({ [RadioCardRootDataAttributes.readonly]: '' } as Record<string, string>) : null;
    },
    required(value: boolean) {
        return value ? ({ [RadioCardRootDataAttributes.required]: '' } as Record<string, string>) : null;
    },
    ...fieldValidityMapping
};
