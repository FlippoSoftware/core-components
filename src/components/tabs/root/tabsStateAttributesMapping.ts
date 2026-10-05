import { TabsRootDataAttributes } from './TabsRootDataAttributes';

import type { TabsActivationDirection } from './TabsMachine';

export const tabsStateAttributesMapping = {
    tabActivationDirection: (dir: TabsActivationDirection) => ({ [TabsRootDataAttributes.activationDirection]: dir })
};
