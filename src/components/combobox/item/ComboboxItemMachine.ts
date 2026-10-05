import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { type ListRegistry, ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { compareItemEquality, findItemIndex } from '~@lib/itemEquality';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { MutableRef } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';
import type { AnyEvent } from '../utils/AnyEvent';

export type ComboboxItemState = {
    disabled: boolean;
    selected: boolean;
    highlighted: boolean;
};

export type ComboboxItemOptions = {
    value?: unknown;
    /**
     * Explicit index (virtualized lists).
     */
    index?: number | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default false
     */
    nativeButton?: boolean | undefined;
};

export type ComboboxItemSetup = {
    registry: ListRegistry | null;
    /**
     * Whether the item is inside `Combobox.Row` (grid cell).
     * @default false
     */
    inRow?: boolean | undefined;
};

/**
 * State machine of `Combobox.Item`.
 */
export class ComboboxItemMachine {
    readonly button: ButtonMachine;

    readonly listIndex = new Store<{ index: number }>({ index: -1 });

    readonly textRef: MutableRef<HTMLElement | null> = { current: null };

    private options: ComboboxItemOptions;

    private readonly root: ComboboxRootMachine;

    private readonly setup: ComboboxItemSetup;

    private readonly listItem: ListRegistryItem | null;

    private element: HTMLElement | null = null;

    private didPointerDown = false;

    private readonly listRefEffect = new Effect(() => this.registerInListRef());

    private readonly valueEffect = new Effect(() => this.registerValue());

    private readonly selectedIndexEffect = new Effect(() => this.syncSelectedIndex());

    private readonly unsubscribe: () => void;

    constructor(root: ComboboxRootMachine, options: ComboboxItemOptions, setup: ComboboxItemSetup) {
        this.root = root;
        this.options = options;
        this.setup = setup;
        this.button = new ButtonMachine({ disabled: options.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
        this.listItem = setup.registry
            ? new ListRegistryItem(setup.registry, {
                  index: options.index,
                  guessIndex: true,
                  onIndexChange: (index) => {
                      this.listIndex.set('index', index);
                      this.sync();
                  }
              })
            : null;
        this.listIndex.set('index', this.listItem?.getIndex() ?? options.index ?? -1);
        this.unsubscribe = root.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: ComboboxItemOptions) {
        this.options = options;
        this.button.setOptions({ disabled: options.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
        this.sync();
    }

    setElement = (element: HTMLElement | null) => {
        this.element = element;
        this.listItem?.setElement(element);
        this.button.setElement(element);
        if (this.listItem) {
            this.listIndex.set('index', this.listItem.getIndex());
        }
        this.sync();
    };

    get value(): unknown {
        return this.options.value ?? null;
    }

    /**
     * The item's index in the (filtered) list.
     */
    get index(): number {
        const { store, derived } = this.root;
        if (this.options.index != null) {
            return this.options.index;
        }
        if (store.state.virtualized) {
            return findItemIndex(derived.state.flatFilteredItems, this.value, store.state.isItemEqualToValue);
        }
        return this.listIndex.state.index;
    }

    private get hasRegistered() {
        return this.listIndex.state.index !== -1 || this.options.index != null;
    }

    get highlighted(): boolean {
        return this.root.store.state.activeIndex === this.index;
    }

    get selected(): boolean {
        const { state } = this.root.store;
        if (state.selectionMode === 'none') {
            return false;
        }
        const { selectedValue, isItemEqualToValue } = state;
        if (Array.isArray(selectedValue)) {
            return selectedValue.some((value) => compareItemEquality(value, this.value, isItemEqualToValue));
        }
        return compareItemEquality(selectedValue, this.value, isItemEqualToValue);
    }

    getState(): ComboboxItemState {
        return { disabled: this.options.disabled ?? false, selected: this.selected, highlighted: this.highlighted };
    }

    static attrs(state: ComboboxItemState) {
        return getStyleHookProps(state);
    }

    getItemProps(elementProps: Props = {}): Props {
        const { root } = this;
        const { store } = root;
        const { id: rootId, selectionMode, readOnly } = store.state;
        const disabled = this.options.disabled ?? false;
        const highlighted = this.highlighted;
        const selectable = selectionMode !== 'none';
        const index = this.index;

        const rootProps = store.state.getItemProps({ active: highlighted, selected: this.selected });
        rootProps.id = undefined;
        rootProps.onFocus = undefined;

        return mergeProps(
            rootProps,
            {
                id: rootId != null && this.hasRegistered ? `${rootId}-${index}` : undefined,
                role: this.setup.inRow ? 'gridcell' : 'option',
                'aria-disabled': disabled || undefined,
                'aria-selected': selectable ? this.selected : undefined,
                // Focusable items would steal focus from the input upon mouseup.
                tabIndex: undefined,
                onPointerDownCapture: (event: Event) => {
                    this.didPointerDown = true;
                    event.preventDefault();
                },
                onClick: (event: AnyEvent) => {
                    if (disabled || readOnly) {
                        return;
                    }
                    root.commitItemSelection(getNativeEvent(event as MouseEvent), this.value);
                },
                onMouseUp: (event: MouseEvent) => {
                    const pointerStartedOnItem = this.didPointerDown;
                    this.didPointerDown = false;
                    if (disabled || readOnly || event.button !== 0 || pointerStartedOnItem || !this.highlighted) {
                        return;
                    }
                    root.commitItemSelection(getNativeEvent(event), this.value);
                }
            },
            elementProps,
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    destroy() {
        this.unsubscribe();
        this.listRefEffect.destroy();
        this.valueEffect.destroy();
        this.selectedIndexEffect.destroy();
        this.listItem?.setElement(null);
        this.listItem?.destroy();
    }

    private sync() {
        const { store } = this.root;
        const index = this.index;
        this.listRefEffect.sync([this.hasRegistered, store.state.virtualized, index, this.options.index, this.element]);
        this.valueEffect.sync([this.hasRegistered, store.state.items, index, this.value, store.state.selectionMode]);
        this.selectedIndexEffect.sync([
            this.hasRegistered,
            store.state.items,
            store.state.open,
            index,
            this.value,
            store.state.isItemEqualToValue
        ]);
        if (!store.state.open) {
            this.didPointerDown = false;
        }
    }

    private registerInListRef() {
        const { store } = this.root;
        if (!this.hasRegistered || !(store.state.virtualized || this.options.index != null)) {
            return;
        }
        const list = store.state.listRef.current;
        const index = this.index;
        list[index] = this.element;
        return () => {
            delete list[index];
        };
    }

    private registerValue() {
        const { store } = this.root;
        if (!this.hasRegistered || store.state.items) {
            return;
        }
        const index = this.index;
        const visibleMap = store.state.valuesRef.current;
        visibleMap[index] = this.value;
        // Stable registry independent of filtering (an `items` prop is required for filtered registries).
        if (store.state.selectionMode !== 'none') {
            store.state.allValuesRef.current.push(this.value);
        }
        return () => {
            delete visibleMap[index];
        };
    }

    private syncSelectedIndex() {
        const { store } = this.root;
        if (!store.state.open || !this.hasRegistered || store.state.items) {
            return;
        }
        const { selectedValue, isItemEqualToValue } = store.state;
        const lastSelectedValue = Array.isArray(selectedValue) ? selectedValue[selectedValue.length - 1] : selectedValue;
        if (compareItemEquality(lastSelectedValue, this.value, isItemEqualToValue)) {
            store.set('selectedIndex', this.index);
        }
        return;
    }
}
