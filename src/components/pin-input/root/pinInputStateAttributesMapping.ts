import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

export const pinInputStateAttributesMapping = {
    ...transitionStatusMapping,
    ...fieldValidityMapping
};
