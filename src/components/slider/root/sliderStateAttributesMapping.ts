import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';

export const sliderStateAttributesMapping = {
    ...fieldValidityMapping,
    activeThumbIndex: () => null,
    max: () => null,
    min: () => null,
    minStepsBetweenValues: () => null,
    step: () => null,
    values: () => null
};
