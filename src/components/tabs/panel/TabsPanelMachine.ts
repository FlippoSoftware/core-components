import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import type { TabsMachine, TabsState, TabsValue } from '../root/TabsMachine';

import { TabsPanelDataAttributes } from './TabsPanelDataAttributes';

export type TabsPanelState = TabsState & {
    hidden: boolean;
};

export type TabsPanelMetadata = {
    id?: string | undefined;
    value: TabsValue | undefined;
};

export type TabsPanelOptions = {
    value?: TabsValue | undefined;
    /**
     * @default false
     */
    keepMounted?: boolean | undefined;
    /**
     * Generated id of the panel.
     */
    id: string;
};

/**
 * One tab panel.
 */
export class TabsPanelMachine {
    readonly listItem: ListRegistryItem<TabsPanelMetadata>;

    readonly store = new Store({ index: -1 });

    private options: TabsPanelOptions;

    private readonly tabs: TabsMachine;

    constructor(tabs: TabsMachine, options: TabsPanelOptions) {
        this.tabs = tabs;
        this.options = options;
        this.listItem = new ListRegistryItem(tabs.panelRegistry, {
            metadata: { id: options.id, value: options.value },
            onIndexChange: (index) => this.store.set('index', index)
        });
    }

    setOptions(options: TabsPanelOptions) {
        this.options = options;
        this.listItem.setMetadata({ id: options.id, value: options.value });
    }

    get hidden() {
        return (this.options.value ?? this.store.state.index) !== this.tabs.value;
    }

    /**
     * Whether the panel children are rendered.
     */
    get rendersChildren() {
        return !this.hidden || (this.options.keepMounted ?? false);
    }

    getState(): TabsPanelState {
        return { ...this.tabs.getState(), hidden: this.hidden };
    }

    getProps(): Props {
        const index = this.store.state.index;
        const hidden = this.hidden;
        return {
            'aria-labelledby': this.tabs.getTabIdByPanelValueOrIndex(this.options.value, index),
            hidden,
            id: this.options.id,
            role: 'tabpanel',
            tabIndex: hidden ? -1 : 0,
            [TabsPanelDataAttributes.index]: index
        };
    }

    setElement = (element: HTMLElement | null) => {
        this.listItem.setElement(element);
    };

    destroy() {
        this.listItem.destroy();
    }
}
