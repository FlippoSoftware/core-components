import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

import { RadioRootDataAttributes } from './RadioRootDataAttributes';

export const radioStateAttributesMapping = {
    checked(value: boolean): Record<string, string> {
        return value ? { [RadioRootDataAttributes.checked]: '' } : { [RadioRootDataAttributes.unchecked]: '' };
    },
    ...transitionStatusMapping,
    ...fieldValidityMapping
};
