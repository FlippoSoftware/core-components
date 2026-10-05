import type { Style } from '~@lib/types';

import type { TabsMachine } from '../root/TabsMachine';

import { TabsIndicatorCssVars } from './TabsIndicatorCssVars';

export type TabsIndicatorGeometry = {
    position: { left: number; right: number; top: number; bottom: number } | null;
    size: { width: number; height: number } | null;
    style: Style | undefined;
    /**
     * Whether the indicator is shown (a tab is selected and measured).
     */
    displayed: boolean;
};

/**
 * Position and size of the active tab relative to the tab list (for `<Tabs.Indicator>`).
 */
export function getTabsIndicatorGeometry(tabs: TabsMachine, listElement: HTMLElement | null): TabsIndicatorGeometry {
    const value = tabs.value;
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    let width = 0;
    let height = 0;
    let isTabSelected = false;

    if (value != null && listElement != null) {
        const activeTab = tabs.getTabElementBySelectedValue(value);
        isTabSelected = true;

        if (activeTab != null) {
            const tabsListRect = listElement.getBoundingClientRect();
            const { left: tabLeft, top: tabTop, width: computedWidth, height: computedHeight } = activeTab.getBoundingClientRect();

            left = tabLeft - tabsListRect.left + listElement.scrollLeft - listElement.clientLeft;
            top = tabTop - tabsListRect.top + listElement.scrollTop - listElement.clientTop;
            width = computedWidth;
            height = computedHeight;
            right =
                tabs.direction === 'ltr' ? listElement.scrollWidth - left - width - listElement.clientLeft : left - listElement.clientLeft;
            bottom = listElement.scrollHeight - top - height - listElement.clientTop;
        }
    }

    if (!isTabSelected) {
        return { position: null, size: null, style: undefined, displayed: false };
    }

    return {
        position: { left, right, top, bottom },
        size: { width, height },
        style: {
            [TabsIndicatorCssVars.activeTabLeft]: `${left}px`,
            [TabsIndicatorCssVars.activeTabRight]: `${right}px`,
            [TabsIndicatorCssVars.activeTabTop]: `${top}px`,
            [TabsIndicatorCssVars.activeTabBottom]: `${bottom}px`,
            [TabsIndicatorCssVars.activeTabWidth]: `${width}px`,
            [TabsIndicatorCssVars.activeTabHeight]: `${height}px`
        },
        displayed: width > 0 && height > 0
    };
}
