import { transitionStatusMapping } from '~@attributes/styleHookMapping';

import { ToastRootDataAttributes } from './ToastRootDataAttributes';

import type { ToastSwipeDirection } from './ToastRootMachine';

export const toastRootStateAttributesMapping = {
    ...transitionStatusMapping,
    swipeDirection(value: ToastSwipeDirection | undefined) {
        return value ? { [ToastRootDataAttributes.swipeDirection]: value } : null;
    }
};
