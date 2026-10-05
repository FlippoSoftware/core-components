import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

import { nestedMapping } from '../utils/nestedMapping';

export const dialogViewportStateAttributesMapping = {
    ...popupStateMapping,
    ...transitionStatusMapping,
    ...nestedMapping
};
