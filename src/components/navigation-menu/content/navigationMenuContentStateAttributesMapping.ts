import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

import type { NavigationMenuActivationDirection } from '../root/NavigationMenuRootMachine';

export const navigationMenuContentStateAttributesMapping = {
    ...popupStateMapping,
    ...transitionStatusMapping,
    activationDirection(value: NavigationMenuActivationDirection) {
        return value ? { 'data-activation-direction': value } : null;
    }
};
