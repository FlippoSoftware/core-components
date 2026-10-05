import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { Store } from '~@store/Store';

import type { ListRegistryMap } from '~@components/composite/list/ListRegistry';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { Orientation, TextDirection } from '~@lib/types';

import type { TabsPanelMetadata } from '../panel/TabsPanelMachine';
import type { TabsTabMetadata } from '../tab/TabsTabMachine';

import { tabsStateAttributesMapping } from './tabsStateAttributesMapping';

export type TabsValue = unknown;

export type TabsActivationDirection = 'left' | 'right' | 'up' | 'down' | 'none';

export type TabsChangeEventDetails = ChangeEventDetails<typeof REASONS.none, { activationDirection: TabsActivationDirection }>;

export type TabsState = {
    orientation: Orientation;
    tabActivationDirection: TabsActivationDirection;
};

type TabsInternalState = {
    value: TabsValue;
    tabActivationDirection: TabsActivationDirection;
    tabMap: ListRegistryMap<TabsTabMetadata>;
    panelMap: ListRegistryMap<TabsPanelMetadata>;
};

export type TabsOptions = {
    value?: TabsValue | undefined;
    /**
     * @default 0
     */
    defaultValue?: TabsValue | undefined;
    /**
     * @default 'horizontal'
     */
    orientation?: Orientation | undefined;
    onValueChange?: ((value: TabsValue, eventDetails: TabsChangeEventDetails) => void) | undefined;
    direction?: TextDirection | undefined;
};

/**
 * State machine of tabs: the active value, the activation direction, and tab/panel associations.
 */
export class TabsMachine {
    readonly store: Store<TabsInternalState>;

    readonly panelRegistry: ListRegistry<TabsPanelMetadata>;

    private options: TabsOptions;

    constructor(options: TabsOptions = {}) {
        this.options = options;
        this.store = new Store<TabsInternalState>({
            value: options.defaultValue === undefined ? 0 : options.defaultValue,
            tabActivationDirection: 'none' as TabsActivationDirection,
            tabMap: new Map() as ListRegistryMap<TabsTabMetadata>,
            panelMap: new Map() as ListRegistryMap<TabsPanelMetadata>
        });
        this.panelRegistry = new ListRegistry<TabsPanelMetadata>({ onMapChange: (map) => this.store.set('panelMap', map) });
    }

    setOptions(options: TabsOptions) {
        this.options = options;
    }

    get value() {
        return this.options.value !== undefined ? this.options.value : this.store.state.value;
    }

    get orientation(): Orientation {
        return this.options.orientation ?? 'horizontal';
    }

    get direction(): TextDirection {
        return this.options.direction ?? 'ltr';
    }

    getState(): TabsState {
        return { orientation: this.orientation, tabActivationDirection: this.store.state.tabActivationDirection };
    }

    static attrs(state: TabsState): Record<string, string> {
        return getStyleHookProps(state, tabsStateAttributesMapping);
    }

    setTabMap = (map: ListRegistryMap<TabsTabMetadata>) => {
        this.store.set('tabMap', map);
    };

    onValueChange = (newValue: TabsValue, eventDetails: TabsChangeEventDetails) => {
        this.options.onValueChange?.(newValue, eventDetails);

        if (eventDetails.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('value', newValue);
        }
        this.store.set('tabActivationDirection', eventDetails.activationDirection);
    };

    /**
     * The `id` of the panel for `aria-controls` on a tab.
     */
    getTabPanelIdByTabValueOrIndex(tabValue: TabsValue | undefined, index: number) {
        if (tabValue === undefined && index < 0) {
            return;
        }

        for (const tabPanelMetadata of this.store.state.panelMap.values()) {
            // find by tabValue
            if (tabValue !== undefined && tabPanelMetadata && tabValue === tabPanelMetadata.value) {
                return tabPanelMetadata.id;
            }

            // find by index
            if (tabValue === undefined && tabPanelMetadata?.index && tabPanelMetadata.index === index) {
                return tabPanelMetadata.id;
            }
        }

        return;
    }

    /**
     * The `id` of the tab for `aria-labelledby` on a panel.
     */
    getTabIdByPanelValueOrIndex(tabPanelValue: TabsValue | undefined, index: number) {
        if (tabPanelValue === undefined && index < 0) {
            return;
        }

        for (const tabMetadata of this.store.state.tabMap.values()) {
            const tabValue = tabMetadata?.value ?? tabMetadata?.index ?? undefined;
            // find by tabPanelValue
            if (tabPanelValue !== undefined && index > -1 && tabPanelValue === tabValue) {
                return tabMetadata?.id;
            }

            // find by index
            if (tabPanelValue === undefined && index > -1 && index === tabValue) {
                return tabMetadata?.id;
            }
        }

        return;
    }

    getTabElementBySelectedValue(selectedValue: TabsValue | undefined): HTMLElement | null {
        if (selectedValue === undefined) {
            return null;
        }

        for (const [tabElement, tabMetadata] of this.store.state.tabMap.entries()) {
            if (tabMetadata != null && selectedValue === (tabMetadata.value ?? tabMetadata.index)) {
                return tabElement as HTMLElement;
            }
        }

        return null;
    }

    destroy() {
        this.panelRegistry.destroy();
    }
}
