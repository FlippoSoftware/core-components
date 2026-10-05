import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { type ListRegistry, ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { ACTIVE_COMPOSITE_ITEM } from '~@components/composite/utils/compositeKeys';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { ownerDocument } from '~@lib/owner';
import { activeElement, contains } from '~@packages/floating-ui/utils/element';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Orientation } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { TabsListMachine } from '../list/TabsListMachine';
import type { TabsActivationDirection, TabsMachine, TabsValue } from '../root/TabsMachine';

export type TabsTabState = {
    disabled: boolean;
    active: boolean;
    orientation: Orientation;
};

export type TabsTabMetadata = {
    disabled: boolean;
    id: string | undefined;
    value: TabsValue | undefined;
};

export type TabsTabOptions = {
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    value?: TabsValue | undefined;
    /**
     * @default true
     */
    nativeButton?: boolean | undefined;
    /**
     * The tab's id (generated when not provided).
     */
    id: string;
};

/**
 * One tab.
 */
export class TabsTabMachine {
    readonly button: ButtonMachine;

    readonly listItem: ListRegistryItem<TabsTabMetadata>;

    readonly store = new Store({ index: -1 });

    private options: TabsTabOptions;

    private readonly tabs: TabsMachine;

    private readonly list: TabsListMachine;

    private isNavigating = false;

    private isPressing = false;

    private isMainButton = false;

    constructor(tabs: TabsMachine, list: TabsListMachine, options: TabsTabOptions) {
        this.tabs = tabs;
        this.list = list;
        this.options = options;
        this.button = new ButtonMachine({
            disabled: options.disabled ?? false,
            native: options.nativeButton ?? true,
            focusableWhenDisabled: true
        });
        this.listItem = new ListRegistryItem<TabsTabMetadata>(list.composite.registry as unknown as ListRegistry<TabsTabMetadata>, {
            metadata: this.metadata,
            onIndexChange: (index) => {
                this.store.set('index', index);
                this.syncHighlight();
            }
        });
    }

    setOptions(options: TabsTabOptions) {
        this.options = options;
        this.button.setOptions({ disabled: options.disabled ?? false, native: options.nativeButton ?? true, focusableWhenDisabled: true });
        this.listItem.setMetadata(this.metadata);
        this.syncHighlight();
    }

    private get metadata(): TabsTabMetadata {
        return { disabled: this.options.disabled ?? false, id: this.options.id, value: this.options.value };
    }

    get index() {
        return this.store.state.index;
    }

    get tabValue() {
        return this.options.value ?? this.index;
    }

    get active() {
        const { value } = this.options;
        const index = this.index;
        if (value === undefined) {
            return index < 0 ? false : index === this.tabs.value;
        }
        return value === this.tabs.value;
    }

    getState(): TabsTabState {
        return { disabled: this.options.disabled ?? false, active: this.active, orientation: this.tabs.orientation };
    }

    /**
     * Keeps the highlighted item in sync with the active tab when the value changes externally.
     * Call when the value, the index or the highlighted index change.
     */
    syncHighlight() {
        if (this.isNavigating) {
            this.isNavigating = false;
            return;
        }

        const index = this.index;
        if (!(this.active && index > -1 && this.list.highlightedTabIndex !== index)) {
            return;
        }

        // If focus is currently within the tabs list, don't override the roving focus highlight.
        const listElement = this.list.listElement;
        if (listElement != null) {
            const activeEl = activeElement(ownerDocument(listElement));
            if (activeEl && contains(listElement, activeEl)) {
                return;
            }
        }

        this.list.setHighlightedTabIndex(index);
    }

    private activate(event: Event) {
        this.list.onTabActivation(
            this.tabValue,
            createChangeEventDetails(REASONS.none, getNativeEvent(event), undefined, {
                activationDirection: 'none' as TabsActivationDirection
            })
        );
    }

    getProps(elementProps: Props = {}): Props {
        const index = this.index;
        const active = this.active;
        const disabled = this.options.disabled ?? false;
        const tabPanelId = index > -1 ? this.tabs.getTabPanelIdByTabValueOrIndex(this.options.value, index) : undefined;

        return this.button.getButtonProps(
            mergeProps(
                this.list.composite.getItemProps(index),
                {
                    role: 'tab',
                    'aria-controls': tabPanelId,
                    'aria-selected': active,
                    id: this.options.id,
                    onClick: (event: MouseEvent) => {
                        if (this.active || disabled) {
                            return;
                        }
                        this.activate(event);
                    },
                    onFocus: (event: FocusEvent) => {
                        if (this.active) {
                            return;
                        }

                        if (this.index > -1) {
                            this.list.setHighlightedTabIndex(this.index);
                        }

                        if (disabled) {
                            return;
                        }

                        if (this.list.activateOnFocus && (!this.isPressing || (this.isPressing && this.isMainButton))) {
                            this.activate(event);
                        }
                    },
                    onPointerDown: (event: PointerEvent) => {
                        if (this.active || disabled) {
                            return;
                        }

                        this.isPressing = true;

                        const handlePointerUp = () => {
                            this.isPressing = false;
                            this.isMainButton = false;
                        };

                        if (!event.button || event.button === 0) {
                            this.isMainButton = true;
                            ownerDocument(event.currentTarget as Element).addEventListener('pointerup', handlePointerUp, { once: true });
                        }
                    },
                    [ACTIVE_COMPOSITE_ITEM]: active ? '' : undefined,
                    onKeyDownCapture: () => {
                        this.isNavigating = true;
                    }
                },
                elementProps
            )
        );
    }

    setElement = (element: HTMLElement | null) => {
        this.button.setElement(element);
        this.listItem.setElement(element);
    };

    destroy() {
        this.listItem.destroy();
    }
}
