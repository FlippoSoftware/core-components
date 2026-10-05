import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

import { multipleActiveMapping } from '../trigger/multipleActiveMapping';

export const tooltipPopupStateAttributesMapping = {
    ...popupStateMapping,
    ...transitionStatusMapping,
    ...multipleActiveMapping
};
