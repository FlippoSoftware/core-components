import { pressableTriggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

import type { Side } from '~@lib/types';

export const comboboxInputStateAttributesMapping = {
    ...pressableTriggerOpenStateMapping,
    ...fieldValidityMapping,
    popupSide: (side: Side | null) => (side ? { 'data-popup-side': side } : null),
    listEmpty: (empty: boolean) => (empty ? { 'data-list-empty': '' } : null)
};
