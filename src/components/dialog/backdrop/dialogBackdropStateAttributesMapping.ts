import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

export const dialogBackdropStateAttributesMapping = {
    ...popupStateMapping,
    ...transitionStatusMapping
};
