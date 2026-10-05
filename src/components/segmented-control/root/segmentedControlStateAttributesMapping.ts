import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

import { SegmentedControlRootDataAttributes } from './SegmentedControlRootDataAttributes';

export const segmentedControlStateAttributesMapping = {
    disabled(value: boolean) {
        return value ? ({ [SegmentedControlRootDataAttributes.disabled]: '' } as Record<string, string>) : null;
    },
    readOnly(value: boolean) {
        return value ? ({ [SegmentedControlRootDataAttributes.readonly]: '' } as Record<string, string>) : null;
    },
    ...fieldValidityMapping
};
