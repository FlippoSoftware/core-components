import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

export const numberFieldStateAttributesMapping = {
    ...fieldValidityMapping,
    inputValue: () => null,
    value: () => null
};
