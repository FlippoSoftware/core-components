import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '~@lib/constants';
import { defaultItemEquality, findItemIndex } from '~@lib/itemEquality';
import { stringifyAsValue } from '~@lib/valueLabel';
import { visuallyHidden, visuallyHiddenInput } from '~@lib/visuallyHidden';
import { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import { ClickInteraction } from '~@packages/floating-ui/interactions/ClickInteraction';
import { DismissInteraction } from '~@packages/floating-ui/interactions/DismissInteraction';
import { ListNavigationInteraction } from '~@packages/floating-ui/interactions/ListNavigationInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { TypeaheadInteraction } from '~@packages/floating-ui/interactions/TypeaheadInteraction';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootMachine } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { ElementProps, Interaction, MutableRef } from '~@lib/types';
import type { ItemRecord, LabeledItem } from '~@lib/valueLabel';
import type { Props } from '~@props/mergeProps';

import type { SelectState } from '../store/SelectStore';

export type SelectChangeEventReason =
    | typeof REASONS.triggerPress
    | typeof REASONS.outsidePress
    | typeof REASONS.escapeKey
    | typeof REASONS.windowResize
    | typeof REASONS.itemPress
    | typeof REASONS.focusOut
    | typeof REASONS.listNavigation
    | typeof REASONS.cancelOpen
    | typeof REASONS.none
    | (string & {});

export type SelectChangeEventDetails = ChangeEventDetails<SelectChangeEventReason>;

export type SelectRootOptions = {
    id?: string | undefined;
    value?: unknown;
    /**
     * @default null (`[]` when `multiple`)
     */
    defaultValue?: unknown;
    onValueChange?: ((value: unknown, eventDetails: SelectChangeEventDetails) => void) | undefined;
    open?: boolean | undefined;
    /**
     * @default false
     */
    defaultOpen?: boolean | undefined;
    onOpenChange?: ((open: boolean, eventDetails: SelectChangeEventDetails) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
    name?: string | undefined;
    autoComplete?: string | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default false
     */
    readOnly?: boolean | undefined;
    /**
     * @default false
     */
    required?: boolean | undefined;
    /**
     * @default true
     */
    modal?: boolean | undefined;
    /**
     * @default false
     */
    multiple?: boolean | undefined;
    items?: ItemRecord | readonly LabeledItem[] | undefined;
    itemToStringLabel?: ((item: unknown) => string) | undefined;
    itemToStringValue?: ((item: unknown) => string) | undefined;
    isItemEqualToValue?: ((itemValue: unknown, value: unknown) => boolean) | undefined;
    /**
     * @default true
     */
    highlightItemOnHover?: boolean | undefined;
    /**
     * Whether an `actionsRef` is used (the adapter then unmounts through `actions.unmount`).
     * @default false
     */
    hasActionsRef?: boolean | undefined;
};

export type SelectRootSetup = {
    /**
     * Generated ID (used when `id` is not provided).
     */
    defaultId: string;
    /**
     * The enclosing field (a detached one is used otherwise).
     */
    field?: FieldRootMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
};

/**
 * Non-reactive data shared by the select's parts (replacement for the refs of `SelectRootContext`).
 */
export type SelectRootRefs = {
    listRef: MutableRef<(HTMLElement | null)[]>;
    labelsRef: MutableRef<(string | null)[]>;
    valuesRef: MutableRef<unknown[]>;
    popupRef: MutableRef<HTMLElement | null>;
    valueRef: MutableRef<HTMLElement | null>;
    selectedItemTextRef: MutableRef<HTMLElement | null>;
    scrollHandlerRef: MutableRef<((element: HTMLElement) => void) | null>;
    scrollArrowsMountedCountRef: MutableRef<number>;
    typingRef: MutableRef<boolean>;
    keyboardActiveRef: MutableRef<boolean>;
    alignItemWithTriggerActiveRef: MutableRef<boolean>;
    selectionRef: MutableRef<{ allowSelectedMouseUp: boolean; allowUnselectedMouseUp: boolean }>;
    initialValueRef: MutableRef<unknown>;
};

/**
 * State machine of `Select.Root`: value and open state (controlled or not), mount transitions,
 * click/dismiss/list navigation/typeahead interactions, form field integration and the hidden input.
 */
export class SelectRootMachine {
    readonly store: Store<SelectState>;

    readonly floatingRoot: FloatingRootStore<SelectChangeEventReason>;

    readonly refs: SelectRootRefs;

    readonly transitions: TransitionStatusController;

    readonly actions: { unmount: () => void };

    private options: SelectRootOptions;

    private readonly setup: SelectRootSetup;

    private readonly detachedField = createDetachedField();

    private readonly click: ClickInteraction;

    private readonly dismiss: DismissInteraction;

    private readonly listNavigation: ListNavigationInteraction;

    private readonly typeahead: TypeaheadInteraction;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly openMethodStore = new Store<{ openMethod: Interaction | null }>({ openMethod: null });

    private lastInteractionType: Interaction = '';

    private previousValue: unknown;

    private readonly selectedIndexEffect = new Effect(() => this.syncSelectedIndex());

    private readonly propsEffect = new Effect(() => this.updateSharedProps());

    private readonly unsubscribers: (() => void)[] = [];

    constructor(options: SelectRootOptions, setup: SelectRootSetup) {
        this.options = options;
        this.setup = setup;

        const { multiple = false, defaultValue = null, defaultOpen = false } = options;
        const value = options.value !== undefined ? options.value : multiple ? (defaultValue ?? EMPTY_ARRAY) : defaultValue;
        const open = options.open ?? defaultOpen;

        this.refs = {
            listRef: { current: [] },
            labelsRef: { current: [] },
            valuesRef: { current: [] },
            popupRef: { current: null },
            valueRef: { current: null },
            selectedItemTextRef: { current: null },
            scrollHandlerRef: { current: null },
            scrollArrowsMountedCountRef: { current: 0 },
            typingRef: { current: false },
            keyboardActiveRef: { current: false },
            alignItemWithTriggerActiveRef: { current: false },
            selectionRef: { current: { allowSelectedMouseUp: false, allowUnselectedMouseUp: false } },
            initialValueRef: { current: value }
        };
        this.previousValue = value;

        this.transitions = new TransitionStatusController(open);
        this.store = new Store<SelectState>({
            id: this.id,
            modal: options.modal ?? true,
            multiple,
            itemToStringLabel: options.itemToStringLabel,
            itemToStringValue: options.itemToStringValue,
            isItemEqualToValue: options.isItemEqualToValue ?? defaultItemEquality,
            value,
            open,
            mounted: this.transitions.state.mounted,
            transitionStatus: this.transitions.state.transitionStatus,
            items: options.items,
            forceMount: false,
            openMethod: null,
            activeIndex: null,
            selectedIndex: null,
            popupProps: EMPTY_OBJECT as ElementProps,
            triggerProps: EMPTY_OBJECT as ElementProps,
            triggerElement: null,
            positionerElement: null,
            listElement: null,
            scrollUpArrowVisible: false,
            scrollDownArrowVisible: false,
            hasScrollArrows: false
        });

        this.floatingRoot = new FloatingRootStore<SelectChangeEventReason>({
            open,
            referenceElement: null,
            floatingElement: null,
            triggerElements: new PopupTriggerMap(),
            floatingId: undefined,
            nested: false,
            noEmit: false,
            onOpenChange: this.setOpen
        });

        this.click = new ClickInteraction(this.floatingRoot, this.getClickOptions());
        this.dismiss = new DismissInteraction(this.floatingRoot, { bubbles: false });
        this.listNavigation = new ListNavigationInteraction(this.floatingRoot, this.getListNavigationOptions());
        this.typeahead = new TypeaheadInteraction(this.floatingRoot, this.getTypeaheadOptions());

        this.openChangeComplete = new OpenChangeComplete(this.refs.popupRef, () => {
            if (!this.store.state.open) {
                this.handleUnmount();
            } else {
                this.options.onOpenChangeComplete?.(true);
            }
        });

        this.actions = { unmount: this.handleUnmount };

        this.unsubscribers.push(
            this.store.subscribe(() => this.sync()),
            this.transitions.store.subscribe(() => {
                this.store.update({
                    mounted: this.transitions.state.mounted,
                    transitionStatus: this.transitions.state.transitionStatus
                });
            }),
            this.openMethodStore.subscribe(() => this.store.set('openMethod', this.openMethodStore.state.openMethod))
        );

        this.sync();
    }

    setOptions(options: SelectRootOptions) {
        this.options = options;
        const { store } = this;

        if (options.value !== undefined) {
            store.set('value', options.value);
        }
        if (options.open !== undefined) {
            store.set('open', options.open);
        }
        store.update({
            id: this.id,
            modal: options.modal ?? true,
            multiple: options.multiple ?? false,
            items: options.items,
            itemToStringLabel: options.itemToStringLabel,
            itemToStringValue: options.itemToStringValue,
            isItemEqualToValue: options.isItemEqualToValue ?? defaultItemEquality
        });
        this.click.setOptions(this.getClickOptions());
        this.sync();
    }

    get field(): FieldRootMachine {
        return this.setup.field ?? this.detachedField;
    }

    get id(): string {
        const { labelable } = this.setup;
        const id = this.options.id ?? this.setup.defaultId;
        return labelable ? labelable.resolveControlId(id) : id;
    }

    get disabled(): boolean {
        return this.field.disabled || (this.options.disabled ?? false);
    }

    get readOnly(): boolean {
        return this.options.readOnly ?? false;
    }

    get required(): boolean {
        return this.options.required ?? false;
    }

    get name(): string | undefined {
        return this.field.name ?? this.options.name;
    }

    get multiple(): boolean {
        return this.options.multiple ?? false;
    }

    get highlightItemOnHover(): boolean {
        return this.options.highlightItemOnHover ?? true;
    }

    /**
     * Item props from the list navigation (`active`/`selected` are consumed, not rendered).
     */
    getItemProps(userProps?: Record<string, unknown>): Record<string, unknown> {
        return mergeInteractionProps(userProps, this.getInteractionList(), 'item');
    }

    /**
     * Registers the control in the field and labelable contexts. @returns A cleanup function.
     */
    register(): () => void {
        const { labelable } = this.setup;
        const unregisterLabelable = labelable?.registerControl({ id: this.options.id, defaultId: this.setup.defaultId }) ?? (() => {});
        const store = this.store;
        const triggerRef = {
            get current() {
                return store.state.triggerElement;
            },
            set current(_element: HTMLElement | null) {
                // Read-only: the trigger registers itself through `setTriggerElement`.
            }
        };
        const unregisterField = this.field.registerControl({
            id: this.id,
            name: this.name,
            value: this.store.state.value,
            getValue: () => this.getFieldStringValue(),
            controlRef: triggerRef,
            commit: this.field.commit
        });
        return () => {
            unregisterLabelable();
            unregisterField();
        };
    }

    setValue = (nextValue: unknown, eventDetails: SelectChangeEventDetails) => {
        this.options.onValueChange?.(nextValue, eventDetails);
        if (eventDetails.isCanceled) {
            return;
        }
        if (this.options.value === undefined) {
            this.store.set('value', nextValue);
        }
    };

    setOpen = (nextOpen: boolean, eventDetails: SelectChangeEventDetails) => {
        this.options.onOpenChange?.(nextOpen, eventDetails);
        if (eventDetails.isCanceled) {
            return;
        }
        if (this.options.open === undefined) {
            this.store.set('open', nextOpen);
        }

        const field = this.field;
        if (!nextOpen && (eventDetails.reason === REASONS.focusOut || eventDetails.reason === REASONS.outsidePress)) {
            field.setTouched(true);
            field.setFocused(false);
            if (field.validationMode === 'onBlur') {
                field.commit(this.store.state.value);
            }
        }

        // Prevent options from retaining `tabindex=0` when closing by tabbing out with `keepMounted`.
        const { activeIndex } = this.store.state;
        if (!nextOpen && activeIndex !== null) {
            const activeOption = this.refs.listRef.current[activeIndex];
            queueMicrotask(() => {
                activeOption?.setAttribute('tabindex', '-1');
            });
        }
    };

    /**
     * Updates the scroll arrows' visibility from the scroll position.
     */
    handleScrollArrowVisibility = () => {
        const { store } = this;
        const scroller = store.state.listElement || this.refs.popupRef.current;
        if (!scroller) {
            return;
        }
        const shouldShowUp = scroller.scrollTop > 1;
        const shouldShowDown = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
        store.update({ scrollUpArrowVisible: shouldShowUp, scrollDownArrowVisible: shouldShowDown });
    };

    setTriggerElement = (element: HTMLElement | null) => {
        this.store.set('triggerElement', element);
    };

    setPositionerElement = (element: HTMLElement | null) => {
        this.store.set('positionerElement', element);
    };

    setListElement = (element: HTMLDivElement | null) => {
        this.store.set('listElement', element);
    };

    /**
     * Props of the hidden input holding the serialized value (also handles browser autofill).
     */
    getHiddenInputProps(): Props {
        const { store, field } = this;
        const multiple = this.multiple;
        const { value } = store.state;
        const name = this.name;
        const hasMultipleSelection = multiple && Array.isArray(value) && value.length > 0;
        const serializedValue =
            multiple && Array.isArray(value) && value.length === 0 ? '' : stringifyAsValue(value, this.options.itemToStringValue);

        return mergeProps(
            field.getInputValidationProps({
                onFocus: () => {
                    // Move focus to the trigger when the hidden input is focused.
                    store.state.triggerElement?.focus({ focusVisible: true } as FocusOptions);
                },
                onChange: (event: Event | { nativeEvent: Event; target: EventTarget | null }) => {
                    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
                    if (nativeEvent.defaultPrevented) {
                        return;
                    }
                    const nextValue = (event.target as HTMLInputElement).value;
                    const details = createChangeEventDetails(REASONS.none, nativeEvent);
                    store.set('forceMount', true);
                    queueMicrotask(() => {
                        // Browser autofill only writes a single scalar value.
                        if (multiple) {
                            return;
                        }
                        const matchingValue = this.refs.valuesRef.current.find(
                            (candidate) =>
                                stringifyAsValue(candidate, this.options.itemToStringValue).toLowerCase() === nextValue.toLowerCase()
                        );
                        if (matchingValue != null) {
                            field.setDirty(matchingValue !== field.validityData.initialValue);
                            this.setValue(matchingValue, details);
                            if (field.shouldValidateOnChange()) {
                                field.commit(matchingValue);
                            }
                        }
                    });
                }
            }),
            {
                name: multiple ? undefined : name,
                autoComplete: this.options.autoComplete,
                value: serializedValue,
                disabled: this.disabled,
                required: this.required && !hasMultipleSelection,
                readOnly: this.readOnly,
                style: name ? visuallyHiddenInput : visuallyHidden,
                tabIndex: -1,
                'aria-hidden': true
            }
        );
    }

    /**
     * Extra hidden inputs carrying each value of a multiple select (when named).
     */
    getHiddenInputs(): { name: string; value: string }[] {
        const { value } = this.store.state;
        const name = this.name;
        if (!this.multiple || !Array.isArray(value) || !name) {
            return [];
        }
        return value.map((v) => ({ name, value: stringifyAsValue(v, this.options.itemToStringValue) }));
    }

    /**
     * Ref callback for the hidden input.
     */
    setInputElement = (element: HTMLInputElement | null) => {
        this.field.inputRef.current = element;
    };

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.selectedIndexEffect.destroy();
        this.propsEffect.destroy();
        this.click.destroy();
        this.dismiss.destroy();
        this.listNavigation.destroy();
        this.typeahead.destroy();
        this.openChangeComplete.destroy();
        this.transitions.destroy();
    }

    private readonly handleUnmount = () => {
        this.transitions.setMounted(false);
        this.store.set('activeIndex', null);
        this.openMethodStore.set('openMethod', null);
        this.options.onOpenChangeComplete?.(false);
    };

    private getFieldStringValue() {
        const { value } = this.store.state;
        if (this.multiple && Array.isArray(value)) {
            return value.map((current) => stringifyAsValue(current, this.options.itemToStringValue));
        }
        return stringifyAsValue(value, this.options.itemToStringValue);
    }

    private getClickOptions() {
        return { enabled: !this.readOnly && !this.disabled, event: 'mousedown' as const };
    }

    private getListNavigationOptions() {
        const { store } = this;
        return {
            enabled: !this.readOnly && !this.disabled,
            listRef: this.refs.listRef,
            activeIndex: store.state.activeIndex,
            selectedIndex: store.state.selectedIndex,
            disabledIndices: EMPTY_ARRAY as number[],
            onNavigate: (nextActiveIndex: number | null) => {
                // Retain the highlight while transitioning out.
                if (nextActiveIndex === null && !store.state.open) {
                    return;
                }
                store.set('activeIndex', nextActiveIndex);
            },
            // The items implement their own hover listeners.
            focusItemOnHover: false
        };
    }

    private getTypeaheadOptions() {
        const { store } = this;
        return {
            enabled: !this.readOnly && !this.disabled && (store.state.open || !this.multiple),
            listRef: this.refs.labelsRef,
            activeIndex: store.state.activeIndex,
            selectedIndex: store.state.selectedIndex,
            onMatch: (index: number) => {
                if (store.state.open) {
                    store.set('activeIndex', index);
                } else {
                    this.setValue(this.refs.valuesRef.current[index], createChangeEventDetails('none'));
                }
            },
            onTypingChange: (typing: boolean) => {
                this.refs.typingRef.current = typing;
            }
        };
    }

    private getInteractionList() {
        return [this.click.getProps(), this.dismiss.getProps(), this.listNavigation.getProps(), this.typeahead.getProps()];
    }

    private readonly interactionTypeProps = {
        onPointerDown: (event: PointerEvent) => {
            if (!event.defaultPrevented) {
                this.lastInteractionType = event.pointerType as Interaction;
            }
        },
        onClick: (event: MouseEvent | PointerEvent) => {
            let interactionType: Interaction;
            if (event.detail) {
                interactionType = 'keyboard';
            } else if ('pointerType' in event) {
                interactionType = event.pointerType as Interaction;
            } else {
                interactionType = this.lastInteractionType;
            }
            if (!this.store.state.open) {
                this.openMethodStore.set('openMethod', interactionType);
            }
            this.lastInteractionType = '';
        }
    };

    private sync() {
        const { store, field } = this;
        const { open, value, triggerElement, positionerElement } = store.state;

        this.transitions.setOpen(open);
        this.floatingRoot.update({
            open,
            referenceElement: triggerElement,
            domReferenceElement: triggerElement,
            floatingElement: positionerElement
        });
        // Ensure the values and labels are registered for programmatic value changes.
        if (value !== this.refs.initialValueRef.current && !store.state.forceMount) {
            store.set('forceMount', true);
        }

        field.setFilled(this.multiple ? Array.isArray(value) && value.length > 0 : value != null);

        if (value !== this.previousValue) {
            this.previousValue = value;
            field.form.clearErrors(this.name);
            field.setDirty(value !== field.validityData.initialValue);
            if (field.shouldValidateOnChange()) {
                field.commit(value);
            } else {
                field.commit(value, true);
            }
        }

        this.selectedIndexEffect.sync([this.multiple, open, value, store.state.isItemEqualToValue]);
        this.listNavigation.setOptions(this.getListNavigationOptions());
        this.typeahead.setOptions(this.getTypeaheadOptions());
        if (!this.options.hasActionsRef) {
            this.openChangeComplete.sync(open);
        }

        const rootState = this.floatingRoot.state;
        this.propsEffect.sync([
            rootState.open,
            rootState.domReferenceElement,
            rootState.floatingElement,
            this.disabled,
            this.readOnly,
            this.id
        ]);
    }

    private syncSelectedIndex() {
        const { store } = this;
        const { open, value, isItemEqualToValue } = store.state;
        if (open) {
            return;
        }
        const registry = this.refs.valuesRef.current;

        if (this.multiple) {
            const currentValue = Array.isArray(value) ? value : [];
            if (currentValue.length === 0) {
                store.set('selectedIndex', null);
                return;
            }
            const lastIndex = findItemIndex(registry, currentValue[currentValue.length - 1], isItemEqualToValue);
            store.set('selectedIndex', lastIndex === -1 ? null : lastIndex);
            return;
        }

        const index = findItemIndex(registry, value, isItemEqualToValue);
        store.set('selectedIndex', index === -1 ? null : index);
        return;
    }

    private updateSharedProps() {
        const list = this.getInteractionList();
        const triggerProps = mergeProps(
            mergeInteractionProps(undefined, list, 'reference'),
            this.interactionTypeProps,
            this.id ? { id: this.id } : EMPTY_OBJECT
        );
        this.store.update({
            popupProps: mergeInteractionProps(undefined, list, 'floating') as ElementProps,
            triggerProps: triggerProps as ElementProps
        });
    }
}
