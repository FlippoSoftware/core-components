import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

export const popoverPopupStateAttributesMapping = {
    ...popupStateMapping,
    ...transitionStatusMapping
};
