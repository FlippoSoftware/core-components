import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

export const menuPopupStateAttributesMapping = {
    ...popupStateMapping,
    ...transitionStatusMapping
};
