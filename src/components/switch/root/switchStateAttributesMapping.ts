import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

import { SwitchRootDataAttributes } from './SwitchRootDataAttributes';

export const switchStateAttributesMapping = {
    ...fieldValidityMapping,
    checked(value: boolean): Record<string, string> {
        return value ? { [SwitchRootDataAttributes.checked]: '' } : { [SwitchRootDataAttributes.unchecked]: '' };
    }
};
