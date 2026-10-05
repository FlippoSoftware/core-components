import { pressableTriggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

export const selectTriggerStateAttributesMapping = {
    ...pressableTriggerOpenStateMapping,
    ...fieldValidityMapping,
    value: () => null
};
