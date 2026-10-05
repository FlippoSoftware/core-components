import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { isMouseWithinBounds } from '~@dom/isMouseWithinBounds';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { compareItemEquality, removeItem } from '~@lib/itemEquality';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { ListRegistry } from '~@components/composite/list/ListRegistry';
import type { MutableRef } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { selectSelectors } from '../store/SelectStore';

import type { SelectRootMachine } from '../root/SelectRootMachine';

export type SelectItemState = {
    disabled: boolean;
    selected: boolean;
    highlighted: boolean;
};

export type SelectItemOptions = {
    value?: unknown;
    label?: string | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default false
     */
    nativeButton?: boolean | undefined;
};

type PointerLikeEvent = { pointerType: string };

type MouseLikeEvent =
    | MouseEvent
    | { nativeEvent: MouseEvent; currentTarget: EventTarget | null; clientX: number; clientY: number; type: string };

/**
 * State machine of `Select.Item`: registration (value, label, index), highlight on hover,
 * selection on click or on release after pressing the trigger.
 */
export class SelectItemMachine {
    readonly button: ButtonMachine;

    readonly index = new Store<{ index: number }>({ index: -1 });

    /**
     * Ref to the item's text (typeahead label fallback, alignment with the trigger).
     */
    readonly textRef: MutableRef<HTMLElement | null> = { current: null };

    private options: SelectItemOptions;

    private readonly root: SelectRootMachine;

    private readonly listItem: ListRegistryItem;

    private lastKey: string | null = null;

    private pointerType = 'mouse';

    private didPointerDown = false;

    private readonly highlightTimeout = new Timeout();

    private readonly valueEffect = new Effect(() => this.registerValue());

    private readonly selectedIndexEffect = new Effect(() => this.syncSelectedIndex());

    constructor(root: SelectRootMachine, registry: ListRegistry, options: SelectItemOptions = {}) {
        this.root = root;
        this.options = options;
        this.button = new ButtonMachine({ disabled: options.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
        this.listItem = new ListRegistryItem(registry, {
            label: options.label,
            guessIndex: true,
            onIndexChange: (index) => {
                this.index.set('index', index);
                this.sync();
            }
        });
        this.index.set('index', this.listItem.getIndex());
        this.sync();
    }

    setOptions(options: SelectItemOptions) {
        this.options = options;
        this.listItem.setLabel(options.label);
        this.button.setOptions({ disabled: options.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
        this.sync();
    }

    setElement = (element: HTMLElement | null) => {
        this.listItem.setElement(element);
        this.button.setElement(element);
        this.index.set('index', this.listItem.getIndex());
        this.sync();
    };

    get value(): unknown {
        return this.options.value ?? null;
    }

    get hasRegistered(): boolean {
        return this.index.state.index !== -1;
    }

    get highlighted(): boolean {
        return selectSelectors.isActive(this.root.store.state, this.index.state.index);
    }

    get selected(): boolean {
        return selectSelectors.isSelected(this.root.store.state, this.index.state.index, this.value);
    }

    get selectedByFocus(): boolean {
        return selectSelectors.isSelectedByFocus(this.root.store.state, this.index.state.index);
    }

    getState(): SelectItemState {
        return { disabled: this.options.disabled ?? false, selected: this.selected, highlighted: this.highlighted };
    }

    static attrs(state: SelectItemState) {
        return getStyleHookProps(state);
    }

    getItemProps(elementProps: Props = {}): Props {
        const { root } = this;
        const { store, refs } = root;
        const index = this.index.state.index;
        const disabled = this.options.disabled ?? false;
        const highlighted = this.highlighted;
        const selected = this.selected;

        const rootProps = root.getItemProps({ active: highlighted, selected });
        // Our own hover logic replaces the list navigation's focus handling.
        rootProps.onFocus = undefined;
        rootProps.id = undefined;

        return mergeProps(
            rootProps,
            {
                role: 'option',
                'aria-selected': selected,
                tabIndex: highlighted ? 0 : -1,
                onFocus: () => {
                    store.set('activeIndex', index);
                },
                onMouseEnter: () => {
                    if (!refs.keyboardActiveRef.current && store.state.selectedIndex === null && root.highlightItemOnHover) {
                        store.set('activeIndex', index);
                    }
                },
                onMouseMove: () => {
                    if (root.highlightItemOnHover) {
                        store.set('activeIndex', index);
                    }
                },
                onMouseLeave: (event: MouseEvent) => {
                    if (!root.highlightItemOnHover || refs.keyboardActiveRef.current || isMouseWithinBounds(event)) {
                        return;
                    }
                    this.highlightTimeout.start(0, () => {
                        if (store.state.activeIndex === index) {
                            store.set('activeIndex', null);
                        }
                    });
                },
                onTouchStart: () => {
                    refs.selectionRef.current = { allowSelectedMouseUp: false, allowUnselectedMouseUp: false };
                },
                onKeyDown: (event: KeyboardEvent) => {
                    this.lastKey = event.key;
                    store.set('activeIndex', index);
                },
                onClick: (event: MouseLikeEvent) => {
                    this.didPointerDown = false;
                    // Prevent a double commit on Enter.
                    if (event.type === 'keydown' && this.lastKey === null) {
                        return;
                    }
                    if (disabled || (this.lastKey === ' ' && refs.typingRef.current) || (this.pointerType !== 'touch' && !highlighted)) {
                        return;
                    }
                    this.lastKey = null;
                    this.commitSelection(getNativeEvent(event as MouseEvent));
                },
                onPointerEnter: (event: PointerLikeEvent) => {
                    this.pointerType = event.pointerType;
                },
                onPointerDown: (event: PointerLikeEvent) => {
                    this.pointerType = event.pointerType;
                    this.didPointerDown = true;
                },
                onMouseUp: (event: MouseLikeEvent) => {
                    if (disabled) {
                        return;
                    }
                    if (this.didPointerDown) {
                        this.didPointerDown = false;
                        return;
                    }
                    const selection = refs.selectionRef.current;
                    const disallowSelectedMouseUp = !selection.allowSelectedMouseUp && selected;
                    const disallowUnselectedMouseUp = !selection.allowUnselectedMouseUp && !selected;
                    if (disallowSelectedMouseUp || disallowUnselectedMouseUp || (this.pointerType !== 'touch' && !highlighted)) {
                        return;
                    }
                    this.commitSelection(getNativeEvent(event as MouseEvent));
                }
            },
            elementProps,
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    /**
     * Ref callback of `Select.ItemText`: registers the selected item's text for alignment with the trigger.
     */
    setTextElement = (element: HTMLElement | null) => {
        this.textRef.current = element;
        if (!element || !this.hasRegistered) {
            return;
        }
        const { selectedItemTextRef } = this.root.refs;
        const hasNoSelectedItemText = selectedItemTextRef.current === null || !selectedItemTextRef.current.isConnected;
        if (this.selectedByFocus || (hasNoSelectedItemText && this.index.state.index === 0)) {
            selectedItemTextRef.current = element;
        }
    };

    destroy() {
        this.valueEffect.destroy();
        this.selectedIndexEffect.destroy();
        this.highlightTimeout.clear();
        this.listItem.setElement(null);
        this.listItem.destroy();
    }

    private commitSelection(event: MouseEvent) {
        const { root } = this;
        const selectedValue = root.store.state.value;
        if (root.multiple) {
            const currentValue = Array.isArray(selectedValue) ? selectedValue : [];
            const nextValue = this.selected
                ? removeItem(currentValue, this.value, root.store.state.isItemEqualToValue)
                : [...currentValue, this.value];
            root.setValue(nextValue, createChangeEventDetails(REASONS.itemPress, event));
        } else {
            root.setValue(this.value, createChangeEventDetails(REASONS.itemPress, event));
            root.setOpen(false, createChangeEventDetails(REASONS.itemPress, event));
        }
    }

    private sync() {
        const index = this.index.state.index;
        this.valueEffect.sync([this.hasRegistered, index, this.value]);
        this.selectedIndexEffect.sync([
            this.hasRegistered,
            index,
            this.root.multiple,
            this.root.store.state.isItemEqualToValue,
            this.value
        ]);
    }

    private registerValue() {
        if (!this.hasRegistered) {
            return;
        }
        const index = this.index.state.index;
        const values = this.root.refs.valuesRef.current;
        values[index] = this.value;
        return () => {
            delete values[index];
        };
    }

    private syncSelectedIndex() {
        if (!this.hasRegistered) {
            return;
        }
        const { store } = this.root;
        const selectedValue = store.state.value;
        let selectedCandidate = selectedValue;
        if (this.root.multiple && Array.isArray(selectedValue) && selectedValue.length > 0) {
            selectedCandidate = selectedValue[selectedValue.length - 1];
        }
        if (selectedCandidate !== undefined && compareItemEquality(this.value, selectedCandidate, store.state.isItemEqualToValue)) {
            store.set('selectedIndex', this.index.state.index);
        }
        return;
    }
}
