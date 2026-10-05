import { transitionStatusMapping } from '~@attributes/styleHookMapping';

import { MenuItemDataAttributes } from './MenuItemDataAttributes';

export const menuItemCheckedMapping = {
    checked(value: boolean): Record<string, string> {
        return value ? { [MenuItemDataAttributes.checked]: '' } : { [MenuItemDataAttributes.unchecked]: '' };
    },
    ...transitionStatusMapping
};
