import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { createChangeEventDetails, createGenericEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '~@lib/constants';
import { defaultItemEquality, findItemIndex, itemIncludes, removeItem } from '~@lib/itemEquality';
import { NOOP } from '~@lib/noop';
import { isGroupedItems, stringifyAsLabel, stringifyAsValue } from '~@lib/valueLabel';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import { ClickInteraction } from '~@packages/floating-ui/interactions/ClickInteraction';
import { DismissInteraction } from '~@packages/floating-ui/interactions/DismissInteraction';
import { ListNavigationInteraction } from '~@packages/floating-ui/interactions/ListNavigationInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { contains, getTarget } from '~@packages/floating-ui/utils/element';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootMachine } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ElementProps, Interaction, MutableRef } from '~@lib/types';
import type { Group } from '~@lib/valueLabel';
import type { InteractionProps } from '~@packages/floating-ui/types';
import type { Props } from '~@props/mergeProps';

import { createCollatorItemFilter, createFilter, createSingleSelectionCollatorFilter } from '../utils/comboboxFilter';

import type {
    ComboboxChangeEventDetails,
    ComboboxHighlightEventDetails,
    ComboboxHighlightEventReason,
    ComboboxSelectionEvent,
    ComboboxState
} from '../store/ComboboxStore';

export type ComboboxSelectionMode = 'single' | 'multiple' | 'none';

export type ComboboxItemFilter = (item: unknown, query: string, itemToString?: (item: unknown) => string) => boolean;

export type ComboboxRootOptions = {
    id?: string | undefined;
    /**
     * @default 'none'
     */
    selectionMode?: ComboboxSelectionMode | undefined;
    selectedValue?: unknown;
    /**
     * @default null (`[]` when `multiple`)
     */
    defaultSelectedValue?: unknown;
    onSelectedValueChange?: ((value: unknown, eventDetails: ComboboxChangeEventDetails) => void) | undefined;
    inputValue?: string | number | readonly string[] | undefined;
    defaultInputValue?: string | number | readonly string[] | undefined;
    onInputValueChange?: ((value: string, eventDetails: ComboboxChangeEventDetails) => void) | undefined;
    open?: boolean | undefined;
    /**
     * @default false
     */
    defaultOpen?: boolean | undefined;
    onOpenChange?: ((open: boolean, eventDetails: ComboboxChangeEventDetails) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
    onItemHighlighted?: ((itemValue: unknown, eventDetails: ComboboxHighlightEventDetails) => void) | undefined;
    name?: string | undefined;
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
     * @default false
     */
    grid?: boolean | undefined;
    items?: readonly unknown[] | readonly Group<unknown>[] | undefined;
    filteredItems?: readonly unknown[] | readonly Group<unknown>[] | undefined;
    /**
     * `null` disables filtering.
     */
    filter?: ComboboxItemFilter | null | undefined;
    /**
     * @default true
     */
    openOnInputClick?: boolean | undefined;
    /**
     * @default false
     */
    autoHighlight?: boolean | 'always' | undefined;
    /**
     * @default false
     */
    keepHighlight?: boolean | undefined;
    /**
     * @default true
     */
    highlightItemOnHover?: boolean | undefined;
    itemToStringLabel?: ((item: unknown) => string) | undefined;
    itemToStringValue?: ((item: unknown) => string) | undefined;
    isItemEqualToValue?: ((item: unknown, value: unknown) => boolean) | undefined;
    /**
     * @default false
     */
    virtualized?: boolean | undefined;
    /**
     * @default false
     */
    inline?: boolean | undefined;
    /**
     * @default true
     */
    fillInputOnItemPress?: boolean | undefined;
    /**
     * @default false
     */
    modal?: boolean | undefined;
    /**
     * @default -1 (no limit)
     */
    limit?: number | undefined;
    /**
     * @default 'list'
     */
    autoComplete?: 'list' | 'both' | 'inline' | 'none' | undefined;
    locale?: Intl.LocalesArgument;
    /**
     * @default false
     */
    submitOnItemClick?: boolean | undefined;
    /**
     * Whether an `actionsRef` is used (the adapter then unmounts through `actions.unmount`).
     * @default false
     */
    hasActionsRef?: boolean | undefined;
};

export type ComboboxRootSetup = {
    /**
     * Generated ID (used when `id` is not provided).
     */
    defaultId: string;
    field?: FieldRootMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * `ReactDOM.flushSync` in React (used before submitting the form on item click).
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

export type ComboboxDerivedItems = {
    query: string;
    filteredItems: readonly unknown[];
    flatFilteredItems: readonly unknown[];
};

const NO_ACTIVE_VALUE = Symbol('none');

const INITIAL_LAST_HIGHLIGHT: { value: unknown; index: number } = { value: NO_ACTIVE_VALUE, index: -1 };

function toInputString(value: ComboboxRootOptions['inputValue']): string {
    return value == null ? '' : String(value);
}

/**
 * State machine of `Combobox.Root` / `Autocomplete.Root` (replacement for `AriaCombobox`):
 * selected value, input value and open state (controlled or not), filtering, highlight tracking,
 * interactions, form field integration and the hidden input.
 *
 * `store` holds the shared state and callbacks read by the parts, `inputValue` the text of the input and
 * `derived` the query and the filtered items.
 */
export class ComboboxRootMachine {
    readonly store: Store<ComboboxState>;

    readonly inputValue: Store<{ inputValue: string }>;

    readonly derived: Store<ComboboxDerivedItems>;

    readonly floatingRoot: FloatingRootStore;

    readonly transitions: TransitionStatusController;

    readonly actions: { unmount: () => void };

    private options: ComboboxRootOptions;

    private readonly setup: ComboboxRootSetup;

    private readonly detachedField = createDetachedField();

    private readonly internal = new Store<{ queryChangedAfterOpen: boolean; closeQuery: string | null }>({
        queryChangedAfterOpen: false,
        closeQuery: null
    });

    private readonly click: ClickInteraction;

    private readonly dismiss: DismissInteraction;

    private readonly listNavigation: ListNavigationInteraction;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly resolvedPopupRef: MutableRef<HTMLElement | null>;

    private readonly initialDefaultInputValue: string;

    private readonly initialSelectedValue: unknown;

    private hadInputClear = false;

    private lastHighlight = INITIAL_LAST_HIGHLIGHT;

    private pendingQueryHighlight: null | { hasQuery: boolean } = null;

    private lastInteractionType: Interaction = '';

    private readonly openMethodStore = new Store<{ openMethod: Interaction | null }>({ openMethod: null });

    private previous: { query: string; selectedValue: unknown; inputValue: string; items: unknown } | null = null;

    private readonly selectedIndexEffect = new Effect(() => this.syncSelectedIndex());

    private readonly valuesEffect = new Effect(() => this.syncValuesRef());

    private readonly highlightEffect = new Effect(() => this.syncHighlight());

    private readonly pruneEffect = new Effect(() => this.pruneSelectedValue());

    private readonly emptyListEffect = new Effect(() => this.clearHighlightWhenEmpty());

    private readonly propsEffect = new Effect(() => this.updateSharedProps());

    private readonly unsubscribers: (() => void)[] = [];

    constructor(options: ComboboxRootOptions, setup: ComboboxRootSetup) {
        this.options = options;
        this.setup = setup;

        const selectionMode = options.selectionMode ?? 'none';
        const multiple = selectionMode === 'multiple';
        const single = selectionMode === 'single';
        const { defaultSelectedValue = null } = options;
        const selectedValue =
            options.selectedValue !== undefined
                ? options.selectedValue
                : multiple
                  ? (defaultSelectedValue ?? EMPTY_ARRAY)
                  : defaultSelectedValue;

        // Without an input value, derive it from the selected value in single mode.
        if (options.inputValue !== undefined || options.defaultInputValue !== undefined) {
            this.initialDefaultInputValue = toInputString(options.defaultInputValue);
        } else {
            this.initialDefaultInputValue = single ? stringifyAsLabel(selectedValue, options.itemToStringLabel) : '';
        }
        this.initialSelectedValue = selectedValue;

        const open = options.open ?? options.defaultOpen ?? false;
        this.transitions = new TransitionStatusController(open);
        this.inputValue = new Store({
            inputValue: options.inputValue !== undefined ? toInputString(options.inputValue) : this.initialDefaultInputValue
        });
        this.derived = new Store<ComboboxDerivedItems>({ query: '', filteredItems: EMPTY_ARRAY, flatFilteredItems: EMPTY_ARRAY });

        const popupRef: MutableRef<HTMLDivElement | null> = { current: null };
        this.store = new Store<ComboboxState>({
            id: this.id,
            selectedValue,
            open,
            filter: () => true,
            query: '',
            items: options.items,
            selectionMode,
            listRef: { current: [] },
            labelsRef: { current: [] },
            popupRef,
            emptyRef: { current: null },
            inputRef: { current: null },
            keyboardActiveRef: { current: true },
            chipsContainerRef: { current: null },
            clearRef: { current: null },
            valuesRef: { current: [] },
            allValuesRef: { current: [] },
            selectionEventRef: { current: null },
            name: undefined,
            disabled: false,
            readOnly: false,
            required: false,
            grid: false,
            isGrouped: false,
            virtualized: false,
            openOnInputClick: true,
            itemToStringLabel: options.itemToStringLabel,
            isItemEqualToValue: options.isItemEqualToValue ?? defaultItemEquality,
            modal: false,
            autoHighlight: false,
            submitOnItemClick: false,
            hasInputValue: false,
            mounted: this.transitions.state.mounted,
            forceMounted: false,
            transitionStatus: this.transitions.state.transitionStatus,
            inline: options.inline ?? false,
            activeIndex: null,
            selectedIndex: null,
            popupProps: EMPTY_OBJECT as ElementProps,
            inputProps: EMPTY_OBJECT as ElementProps,
            triggerProps: EMPTY_OBJECT as ElementProps,
            positionerElement: null,
            listElement: null,
            triggerElement: null,
            inputElement: null,
            popupSide: null,
            openMethod: null,
            inputInsidePopup: true,
            onOpenChangeComplete: NOOP,
            setOpen: this.setOpen,
            setInputValue: this.setInputValue,
            setSelectedValue: this.setSelectedValue,
            setIndices: this.setIndices,
            onItemHighlighted: (item, details) => this.options.onItemHighlighted?.(item, details),
            handleSelection: this.handleSelection,
            getItemProps: (props) => mergeInteractionProps(props, this.getInteractionList(), 'item'),
            forceMount: this.forceMount,
            requestSubmit: this.requestSubmit
        });

        // An inline combobox composed in a dialog animates with the dialog (`[role="dialog"]`).
        const store = this.store;
        this.resolvedPopupRef = {
            get current() {
                const { inline, positionerElement } = store.state;
                if (inline && positionerElement) {
                    return positionerElement.closest('[role="dialog"]') as HTMLElement | null;
                }
                return popupRef.current;
            },
            set current(_element: HTMLElement | null) {
                // Derived.
            }
        };

        this.floatingRoot = new FloatingRootStore({
            open: options.inline ? true : open,
            referenceElement: null,
            floatingElement: null,
            triggerElements: new PopupTriggerMap(),
            floatingId: undefined,
            nested: false,
            noEmit: false,
            onOpenChange: this.setOpen as never
        });

        this.click = new ClickInteraction(this.floatingRoot, this.getClickOptions());
        this.dismiss = new DismissInteraction(this.floatingRoot, this.getDismissOptions());
        this.listNavigation = new ListNavigationInteraction(this.floatingRoot, this.getListNavigationOptions());

        this.openChangeComplete = new OpenChangeComplete(this.resolvedPopupRef, () => {
            if (!this.store.state.open) {
                this.handleUnmount();
            }
        });
        this.actions = { unmount: this.handleUnmount };

        this.unsubscribers.push(
            this.store.subscribe(() => this.sync()),
            this.inputValue.subscribe(() => this.sync()),
            this.internal.subscribe(() => this.sync()),
            this.transitions.store.subscribe(() => {
                this.store.update({ mounted: this.transitions.state.mounted, transitionStatus: this.transitions.state.transitionStatus });
            }),
            this.openMethodStore.subscribe(() => this.store.set('openMethod', this.openMethodStore.state.openMethod))
        );

        this.syncOptions();
        this.sync();
    }

    setOptions(options: ComboboxRootOptions) {
        this.options = options;
        if (options.selectedValue !== undefined) {
            this.store.set('selectedValue', options.selectedValue);
        }
        if (options.inputValue !== undefined) {
            this.inputValue.set('inputValue', toInputString(options.inputValue));
        }
        if (options.open !== undefined) {
            this.store.set('open', options.open);
        }
        this.syncOptions();
        this.click.setOptions(this.getClickOptions());
        this.dismiss.setOptions(this.getDismissOptions());
        this.sync();
    }

    get field(): FieldRootMachine {
        return this.setup.field ?? this.detachedField;
    }

    get id(): string {
        const id = this.options.id ?? this.setup.defaultId;
        return this.setup.labelable ? this.setup.labelable.resolveControlId(id) : id;
    }

    get selectionMode(): ComboboxSelectionMode {
        return this.options.selectionMode ?? 'none';
    }

    get disabled(): boolean {
        return this.field.disabled || (this.options.disabled ?? false);
    }

    private get multiple() {
        return this.selectionMode === 'multiple';
    }

    private get single() {
        return this.selectionMode === 'single';
    }

    private get autoHighlightMode(): false | 'input-change' | 'always' {
        const { autoHighlight = false } = this.options;
        if (autoHighlight === 'always') {
            return 'always';
        }
        return autoHighlight ? 'input-change' : false;
    }

    private get formValue() {
        return this.selectionMode === 'none' ? this.inputValue.state.inputValue : this.store.state.selectedValue;
    }

    /**
     * Registers the control in the field and labelable contexts. @returns A cleanup function.
     */
    register(): () => void {
        const { labelable } = this.setup;
        const store = this.store;
        const unregisterLabelable = labelable?.registerControl({ id: this.options.id, defaultId: this.setup.defaultId }) ?? (() => {});
        const controlRef = {
            get current(): HTMLElement | null {
                return store.state.inputInsidePopup ? store.state.triggerElement : store.state.inputRef.current;
            },
            set current(_element: HTMLElement | null) {
                // Derived.
            }
        };
        const unregisterField = this.field.registerControl({
            id: this.id,
            name: this.field.name ?? this.options.name,
            value: this.formValue,
            getValue: () => this.formValue,
            controlRef,
            commit: this.field.commit
        });
        return () => {
            unregisterLabelable();
            unregisterField();
        };
    }

    setIndices = (options: { activeIndex?: number | null; selectedIndex?: number | null; type?: ComboboxHighlightEventReason }) => {
        const { type = 'none', ...indices } = options;
        this.store.update(indices);
        if (options.activeIndex === undefined) {
            return;
        }
        if (options.activeIndex === null) {
            if (this.lastHighlight !== INITIAL_LAST_HIGHLIGHT) {
                this.lastHighlight = INITIAL_LAST_HIGHLIGHT;
                this.options.onItemHighlighted?.(undefined, createGenericEventDetails(type, undefined, { index: -1 }));
            }
            return;
        }
        const activeValue = this.store.state.valuesRef.current[options.activeIndex];
        this.lastHighlight = { value: activeValue, index: options.activeIndex };
        this.options.onItemHighlighted?.(activeValue, createGenericEventDetails(type, undefined, { index: options.activeIndex }));
    };

    setInputValue = (next: string, eventDetails: ComboboxChangeEventDetails) => {
        this.hadInputClear = eventDetails.reason === REASONS.inputClear;
        this.options.onInputValueChange?.(next, eventDetails);
        if (eventDetails.isCanceled) {
            return;
        }

        // While typing, don't auto-highlight on open due to a race with the post-open logic.
        if (eventDetails.reason === REASONS.inputChange) {
            const hasQuery = next.trim() !== '';
            if (hasQuery) {
                this.internal.set('queryChangedAfterOpen', true);
            }
            // Update the indices once the filtered items are derived so `onItemHighlighted` gets the latest item.
            this.pendingQueryHighlight = { hasQuery };
            if (hasQuery && this.autoHighlightMode && this.store.state.activeIndex == null) {
                this.store.set('activeIndex', 0);
            }
        }

        if (this.options.inputValue === undefined) {
            this.inputValue.set('inputValue', next);
        } else {
            // Re-derive the items for the pending highlight even if the value is controlled.
            this.sync();
        }
    };

    setOpen = (nextOpen: boolean, eventDetails: ComboboxChangeEventDetails) => {
        const { store } = this;
        if (store.state.open === nextOpen) {
            return;
        }

        // Without `Combobox.Empty`, let Escape bubble to a parent popup when there are no items to show.
        if (
            eventDetails.reason === REASONS.escapeKey &&
            this.options.items !== undefined &&
            this.derived.state.flatFilteredItems.length === 0 &&
            !store.state.emptyRef.current
        ) {
            eventDetails.allowPropagation();
        }

        this.options.onOpenChange?.(nextOpen, eventDetails);
        if (eventDetails.isCanceled) {
            return;
        }

        const { queryChangedAfterOpen } = this.internal.state;
        const query = this.derived.state.query;
        if (!nextOpen && queryChangedAfterOpen) {
            if (this.single) {
                this.internal.set('closeQuery', query);
                // Avoid a flicker when closing with an empty query.
                if (query === '') {
                    this.internal.set('queryChangedAfterOpen', false);
                }
            } else if (this.multiple) {
                if (store.state.inline || store.state.inputInsidePopup) {
                    this.setIndices({ activeIndex: null });
                } else {
                    // Freeze the query so filtering stays stable while exiting.
                    this.internal.set('closeQuery', query);
                }
                // Clear the input now; filtering is retained through `closeQuery` during exit animations.
                this.setInputValue('', createChangeEventDetails(REASONS.inputClear, eventDetails.event));
            }
        }

        if (this.options.open === undefined) {
            store.set('open', nextOpen);
        }
    };

    setSelectedValue = (nextValue: unknown, eventDetails: ComboboxChangeEventDetails) => {
        const { store } = this;
        this.options.onSelectedValueChange?.(nextValue, eventDetails);
        if (eventDetails.isCanceled) {
            return;
        }
        if (this.options.selectedValue === undefined) {
            store.set('selectedValue', nextValue);
        }

        const { fillInputOnItemPress = true, itemToStringLabel } = this.options;
        const shouldFillInput =
            (this.selectionMode === 'none' && store.state.popupRef.current && fillInputOnItemPress) ||
            (this.single && !store.state.inputInsidePopup);
        if (shouldFillInput) {
            this.setInputValue(
                stringifyAsLabel(nextValue, itemToStringLabel),
                createChangeEventDetails(eventDetails.reason, eventDetails.event)
            );
        }

        if (this.single && nextValue != null && eventDetails.reason !== REASONS.inputChange && this.internal.state.queryChangedAfterOpen) {
            this.internal.set('closeQuery', this.derived.state.query);
        }
    };

    handleSelection = (event: ComboboxSelectionEvent, passedValue?: unknown) => {
        const { store } = this;
        let value = passedValue;
        if (value === undefined) {
            const { activeIndex } = store.state;
            if (activeIndex === null) {
                return;
            }
            value = store.state.valuesRef.current[activeIndex];
        }

        const targetEl = getTarget(event) as HTMLElement | null;
        const overrideEvent = store.state.selectionEventRef.current ?? event;
        store.state.selectionEventRef.current = null;
        const eventDetails = createChangeEventDetails(REASONS.itemPress, overrideEvent);

        // Let links handle the click.
        const href = targetEl?.closest('a')?.getAttribute('href');
        if (href) {
            if (href.startsWith('#')) {
                this.setOpen(false, eventDetails);
            }
            return;
        }

        if (this.multiple) {
            const { selectedValue, isItemEqualToValue } = store.state;
            const currentSelectedValue = Array.isArray(selectedValue) ? selectedValue : [];
            const nextValue = itemIncludes(currentSelectedValue, value, isItemEqualToValue)
                ? removeItem(currentSelectedValue, value, isItemEqualToValue)
                : [...currentSelectedValue, value];
            this.setSelectedValue(nextValue, eventDetails);

            const inputElement = store.state.inputRef.current;
            const wasFiltering = inputElement ? inputElement.value.trim() !== '' : false;
            if (!wasFiltering) {
                return;
            }
            if (store.state.inputInsidePopup) {
                this.setInputValue('', createChangeEventDetails(REASONS.inputClear, eventDetails.event));
            } else {
                this.setOpen(false, eventDetails);
            }
            return;
        }

        this.setSelectedValue(value, eventDetails);
        this.setOpen(false, eventDetails);
    };

    /**
     * Selects an item, then submits the form when `submitOnItemClick` is set.
     */
    commitItemSelection(event: MouseEvent, value: unknown) {
        const select = () => this.handleSelection(event, value);
        if (this.store.state.submitOnItemClick) {
            (this.setup.flushSync ?? ((fn: () => void) => fn()))(select);
            this.requestSubmit();
        } else {
            select();
        }
    }

    forceMount = () => {
        const { items, itemToStringLabel } = this.options;
        if (items) {
            // Typeahead works on a closed list.
            this.store.state.labelsRef.current = this.derived.state.flatFilteredItems.map((item) =>
                stringifyAsLabel(item, itemToStringLabel)
            );
        } else {
            this.store.set('forceMounted', true);
        }
    };

    requestSubmit = () => {
        if (!this.store.state.submitOnItemClick) {
            return;
        }
        const form = this.store.state.inputElement?.form;
        if (form && typeof form.requestSubmit === 'function') {
            form.requestSubmit();
        }
    };

    /**
     * Props of the hidden input holding the serialized value (also handles browser autofill).
     */
    getHiddenInputProps(): Props {
        const { store, field } = this;
        const { selectedValue, inputInsidePopup, triggerElement } = store.state;
        const formValue = this.formValue;
        const name = field.name ?? this.options.name;
        const hasMultipleSelection = this.multiple && Array.isArray(selectedValue) && selectedValue.length > 0;

        return mergeProps(
            field.getInputValidationProps({
                // Move focus when the hidden input is focused.
                onFocus: () => {
                    if (inputInsidePopup) {
                        triggerElement?.focus();
                        return;
                    }
                    (store.state.inputRef.current || triggerElement)?.focus();
                },
                // Browser autofill.
                onChange: (event: Event | { nativeEvent: Event; target: EventTarget | null }) => {
                    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
                    if (nativeEvent.defaultPrevented) {
                        return;
                    }
                    const nextValue = (event.target as HTMLInputElement).value;
                    const details = createChangeEventDetails(REASONS.inputChange, nativeEvent);
                    const handleChange = () => this.handleAutofill(nextValue, details);
                    if (this.options.items) {
                        handleChange();
                    } else {
                        this.forceMount();
                        queueMicrotask(handleChange);
                    }
                }
            }),
            {
                id: this.id,
                name: this.multiple || this.selectionMode === 'none' ? undefined : name,
                disabled: this.disabled,
                required: (this.options.required ?? false) && !hasMultipleSelection,
                readOnly: this.options.readOnly ?? false,
                value: Array.isArray(formValue) ? '' : stringifyAsValue(formValue, this.options.itemToStringValue),
                style: visuallyHidden,
                tabIndex: -1,
                'aria-hidden': true
            }
        );
    }

    /**
     * Extra hidden inputs carrying each value of a multiple combobox (when named).
     */
    getHiddenInputs(): { name: string; value: string }[] {
        const { selectedValue } = this.store.state;
        const name = this.field.name ?? this.options.name;
        if (!this.multiple || !Array.isArray(selectedValue) || !name) {
            return [];
        }
        return selectedValue.map((value) => ({ name, value: stringifyAsValue(value, this.options.itemToStringValue) }));
    }

    setHiddenInputElement = (element: HTMLInputElement | null) => {
        this.field.inputRef.current = element;
    };

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        for (const effect of [
            this.selectedIndexEffect,
            this.valuesEffect,
            this.highlightEffect,
            this.pruneEffect,
            this.emptyListEffect,
            this.propsEffect
        ]) {
            effect.destroy();
        }
        this.click.destroy();
        this.dismiss.destroy();
        this.listNavigation.destroy();
        this.openChangeComplete.destroy();
        this.transitions.destroy();
    }

    private handleAutofill(nextValue: string, details: ComboboxChangeEventDetails) {
        const { field } = this;
        // Browser autofill only writes a single scalar value.
        if (this.multiple) {
            return;
        }
        if (this.selectionMode === 'none') {
            field.setDirty(nextValue !== field.validityData.initialValue);
            this.setInputValue(nextValue, details);
            if (field.shouldValidateOnChange()) {
                field.commit(nextValue);
            }
            return;
        }
        const matchingValue = this.store.state.valuesRef.current.find(
            (candidate) => stringifyAsValue(candidate, this.options.itemToStringValue).toLowerCase() === nextValue.toLowerCase()
        );
        if (matchingValue != null) {
            field.setDirty(matchingValue !== field.validityData.initialValue);
            this.setSelectedValue(matchingValue, details);
            if (field.shouldValidateOnChange()) {
                field.commit(matchingValue);
            }
        }
    }

    private readonly handleUnmount = () => {
        const { store } = this;
        const { itemToStringLabel } = this.options;
        this.transitions.setMounted(false);
        this.options.onOpenChangeComplete?.(false);
        this.internal.update({ queryChangedAfterOpen: false, closeQuery: null });
        this.openMethodStore.set('openMethod', null);

        if (this.selectionMode === 'none') {
            this.setIndices({ activeIndex: null, selectedIndex: null });
        } else {
            this.setIndices({ activeIndex: null });
        }

        const input = store.state.inputRef.current;
        // Multiple: clear an unused filter after the close completes (no mid-exit flicker).
        if (this.multiple && input && input.value !== '' && !this.hadInputClear) {
            this.setInputValue('', createChangeEventDetails(REASONS.inputClear));
        }

        // Single: clear the input inside the popup, or sync the outside input to the selected value.
        if (this.single) {
            if (store.state.inputInsidePopup) {
                if (input && input.value !== '') {
                    this.setInputValue('', createChangeEventDetails(REASONS.inputClear));
                }
            } else {
                const stringVal = stringifyAsLabel(store.state.selectedValue, itemToStringLabel);
                if (input && input.value !== stringVal) {
                    // If no selection was made, treat this as clearing the typed filter.
                    this.setInputValue(stringVal, createChangeEventDetails(stringVal === '' ? REASONS.inputClear : REASONS.none));
                }
            }
        }
    };

    private syncOptions() {
        const { options } = this;
        this.store.update({
            id: this.id,
            items: options.items,
            inline: options.inline ?? false,
            selectionMode: this.selectionMode,
            name: this.field.name ?? options.name,
            disabled: this.disabled,
            readOnly: options.readOnly ?? false,
            required: options.required ?? false,
            grid: options.grid ?? false,
            isGrouped: isGroupedItems(options.items as readonly (unknown | Group<unknown>)[] | undefined),
            virtualized: options.virtualized ?? false,
            onOpenChangeComplete: options.onOpenChangeComplete ?? NOOP,
            openOnInputClick: options.openOnInputClick ?? true,
            itemToStringLabel: options.itemToStringLabel,
            modal: options.modal ?? false,
            autoHighlight: this.autoHighlightMode,
            isItemEqualToValue: options.isItemEqualToValue ?? defaultItemEquality,
            submitOnItemClick: options.submitOnItemClick ?? false,
            hasInputValue: options.inputValue !== undefined || options.defaultInputValue !== undefined
        });
    }

    private getFilter(): ComboboxItemFilter {
        const { filter, itemToStringLabel, locale } = this.options;
        if (filter === null) {
            return () => true;
        }
        if (filter !== undefined) {
            return filter;
        }
        const collatorFilter = createFilter({ locale });
        if (this.single && !this.internal.state.queryChangedAfterOpen) {
            return createSingleSelectionCollatorFilter(collatorFilter, itemToStringLabel, this.store.state.selectedValue);
        }
        return createCollatorItemFilter(collatorFilter, itemToStringLabel);
    }

    /**
     * Derives the query and the filtered items. Replacement for the filtering memos of `AriaCombobox`.
     */
    private deriveItems(): ComboboxDerivedItems {
        const { items, filteredItems: filteredItemsProp, limit = -1, itemToStringLabel, locale } = this.options;
        const { closeQuery, queryChangedAfterOpen } = this.internal.state;
        const inputValue = this.inputValue.state.inputValue;
        const query = closeQuery ?? (inputValue === '' ? '' : inputValue.trim());

        const selectedLabelString = this.single ? stringifyAsLabel(this.store.state.selectedValue, itemToStringLabel) : '';
        const collatorFilter = createFilter({ locale });
        const shouldBypassFiltering =
            this.single &&
            !queryChangedAfterOpen &&
            query !== '' &&
            selectedLabelString !== '' &&
            selectedLabelString.length === query.length &&
            collatorFilter.contains(selectedLabelString, query);
        const filterQuery = shouldBypassFiltering ? '' : query;
        const shouldIgnoreExternalFiltering = items !== undefined && filteredItemsProp !== undefined && shouldBypassFiltering;
        const isGrouped = isGroupedItems(items as readonly (unknown | Group<unknown>)[] | undefined);
        const filter = this.getFilter();

        let filteredItems: readonly unknown[];
        if (filteredItemsProp && !shouldIgnoreExternalFiltering) {
            filteredItems = filteredItemsProp;
        } else if (!items) {
            filteredItems = EMPTY_ARRAY;
        } else if (isGrouped) {
            const groups: Group<unknown>[] = [];
            let currentCount = 0;
            for (const group of items as readonly Group<unknown>[]) {
                if (limit > -1 && currentCount >= limit) {
                    break;
                }
                const candidateItems =
                    filterQuery === '' ? group.items : group.items.filter((item) => filter(item, filterQuery, itemToStringLabel));
                if (candidateItems.length === 0) {
                    continue;
                }
                const itemsToTake = candidateItems.slice(0, limit > -1 ? limit - currentCount : Number.POSITIVE_INFINITY);
                if (itemsToTake.length > 0) {
                    groups.push({ ...group, items: itemsToTake });
                    currentCount += itemsToTake.length;
                }
            }
            filteredItems = groups;
        } else if (filterQuery === '') {
            filteredItems = limit > -1 ? items.slice(0, limit) : items;
        } else {
            const limitedItems: unknown[] = [];
            for (const item of items) {
                if (limit > -1 && limitedItems.length >= limit) {
                    break;
                }
                if (filter(item, filterQuery, itemToStringLabel)) {
                    limitedItems.push(item);
                }
            }
            filteredItems = limitedItems;
        }

        const flatFilteredItems = isGrouped ? (filteredItems as readonly Group<unknown>[]).flatMap((group) => group.items) : filteredItems;
        return { query, filteredItems, flatFilteredItems };
    }

    private get flatItems(): readonly unknown[] {
        const { items } = this.options;
        if (!items) {
            return EMPTY_ARRAY;
        }
        return isGroupedItems(items as readonly (unknown | Group<unknown>)[])
            ? (items as readonly Group<unknown>[]).flatMap((group) => group.items)
            : items;
    }

    private sync() {
        const { store, field } = this;
        const { open, selectedValue, inline, inputInsidePopup, triggerElement, inputElement, positionerElement } = store.state;
        const inputValue = this.inputValue.state.inputValue;

        const derived = this.deriveItems();
        const previousDerived = this.derived.state;
        if (
            derived.query !== previousDerived.query ||
            derived.filteredItems.length !== previousDerived.filteredItems.length ||
            derived.filteredItems.some((item, index) => item !== previousDerived.filteredItems[index])
        ) {
            this.derived.setState(derived);
        }
        if (store.state.query !== derived.query) {
            store.set('query', derived.query);
        }

        this.transitions.setOpen(open);
        this.floatingRoot.update({
            open: inline ? true : open,
            referenceElement: inputInsidePopup ? triggerElement : inputElement,
            domReferenceElement: (inputInsidePopup ? triggerElement : inputElement) ?? this.floatingRoot.state.domReferenceElement,
            floatingElement: positionerElement
        });

        // Register values and labels for programmatic value changes.
        if (selectedValue !== this.initialSelectedValue && !store.state.forceMounted && !this.options.items) {
            this.forceMount();
        }

        if (this.selectionMode === 'none') {
            field.setFilled(inputValue !== '');
        } else {
            field.setFilled(this.multiple ? Array.isArray(selectedValue) && selectedValue.length > 0 : selectedValue != null);
        }

        this.handleValueChanges(derived.query, selectedValue, inputValue);

        const flatFilteredItems = this.derived.state.flatFilteredItems;
        this.selectedIndexEffect.sync([open, selectedValue, this.options.items, this.selectionMode, store.state.isItemEqualToValue]);
        this.valuesEffect.sync([this.options.items, flatFilteredItems]);
        this.highlightEffect.sync([
            store.state.activeIndex,
            this.autoHighlightMode,
            flatFilteredItems,
            inline,
            open,
            this.pendingQueryHighlight
        ]);
        this.pruneEffect.sync([this.options.items, this.selectionMode, selectedValue, store.state.isItemEqualToValue]);
        this.emptyListEffect.sync([this.options.items !== undefined, this.autoHighlightMode, flatFilteredItems.length]);

        this.listNavigation.setOptions(this.getListNavigationOptions());
        if (!this.options.hasActionsRef) {
            this.openChangeComplete.sync(open);
        }

        const rootState = this.floatingRoot.state;
        this.propsEffect.sync([
            rootState.open,
            rootState.domReferenceElement,
            rootState.floatingElement,
            open,
            inputElement,
            store.state.listElement,
            this.disabled,
            this.options.readOnly,
            this.id
        ]);
    }

    /**
     * Replacement for the `useValueChanged` hooks (query, selected value, input value, items).
     */
    private handleValueChanges(query: string, selectedValue: unknown, inputValue: string) {
        const previous = this.previous;
        const items = this.options.items;
        this.previous = { query, selectedValue, inputValue, items };
        if (!previous) {
            return;
        }

        const { store, field } = this;
        const name = field.name ?? this.options.name;
        const { itemToStringLabel } = this.options;
        const hasInputValue = this.options.inputValue !== undefined || this.options.defaultInputValue !== undefined;

        if (query !== previous.query && store.state.open && query !== '' && query !== this.initialDefaultInputValue) {
            this.internal.set('queryChangedAfterOpen', true);
        }

        if (selectedValue !== previous.selectedValue && this.selectionMode !== 'none') {
            field.form.clearErrors(name);
            field.setDirty(selectedValue !== field.validityData.initialValue);
            field.commit(selectedValue, !field.shouldValidateOnChange());

            if (this.multiple && store.state.selectedIndex !== null && (!Array.isArray(selectedValue) || selectedValue.length === 0)) {
                this.setIndices({ activeIndex: null, selectedIndex: null });
            }
            if (this.single && !hasInputValue && !store.state.inputInsidePopup) {
                const nextInputValue = stringifyAsLabel(selectedValue, itemToStringLabel);
                if (inputValue !== nextInputValue) {
                    this.setInputValue(nextInputValue, createChangeEventDetails(REASONS.none));
                }
            }
        }

        if (inputValue !== previous.inputValue && this.selectionMode === 'none') {
            field.form.clearErrors(name);
            field.setDirty(inputValue !== field.validityData.initialValue);
            field.commit(inputValue, !field.shouldValidateOnChange());
        }

        if (
            items !== previous.items &&
            this.single &&
            !hasInputValue &&
            !store.state.inputInsidePopup &&
            !this.internal.state.queryChangedAfterOpen
        ) {
            const nextInputValue = stringifyAsLabel(selectedValue, itemToStringLabel);
            if (inputValue !== nextInputValue) {
                this.setInputValue(nextInputValue, createChangeEventDetails(REASONS.none));
            }
        }
    }

    private syncSelectedIndex() {
        const { store } = this;
        const { open, selectedValue, isItemEqualToValue } = store.state;
        if (open || this.selectionMode === 'none') {
            return;
        }
        const registry = this.options.items ? this.flatItems : store.state.allValuesRef.current;
        if (this.multiple) {
            const currentValue = Array.isArray(selectedValue) ? selectedValue : [];
            const lastIndex = findItemIndex(registry, currentValue[currentValue.length - 1], isItemEqualToValue);
            this.setIndices({ selectedIndex: lastIndex === -1 ? null : lastIndex });
        } else {
            const index = findItemIndex(registry, selectedValue, isItemEqualToValue);
            this.setIndices({ selectedIndex: index === -1 ? null : index });
        }
        return;
    }

    private syncValuesRef() {
        if (this.options.items) {
            const flatFilteredItems = this.derived.state.flatFilteredItems;
            this.store.state.valuesRef.current = flatFilteredItems as unknown[];
            this.store.state.listRef.current.length = flatFilteredItems.length;
        }
        return;
    }

    private syncHighlight() {
        const { store } = this;
        const autoHighlightMode = this.autoHighlightMode;
        const pendingHighlight = this.pendingQueryHighlight;
        if (pendingHighlight) {
            this.pendingQueryHighlight = null;
            if (pendingHighlight.hasQuery ? autoHighlightMode : autoHighlightMode === 'always') {
                store.set('activeIndex', 0);
            }
        }

        if (!store.state.open && !store.state.inline) {
            return;
        }

        const { items, filteredItems } = this.options;
        const candidateItems =
            items !== undefined || filteredItems !== undefined ? this.derived.state.flatFilteredItems : store.state.valuesRef.current;
        const activeIndex = store.state.activeIndex;

        const clearHighlight = () => {
            if (this.lastHighlight !== INITIAL_LAST_HIGHLIGHT) {
                this.lastHighlight = INITIAL_LAST_HIGHLIGHT;
                store.state.onItemHighlighted(undefined, createGenericEventDetails(REASONS.none, undefined, { index: -1 }) as never);
            }
        };

        if (activeIndex == null) {
            if (autoHighlightMode === 'always' && candidateItems.length > 0) {
                store.set('activeIndex', 0);
                return;
            }
            clearHighlight();
            return;
        }

        if (activeIndex >= candidateItems.length) {
            clearHighlight();
            store.set('activeIndex', null);
            return;
        }

        const nextActiveValue = candidateItems[activeIndex];
        const lastHighlightedValue = this.lastHighlight.value;
        const isSameItem =
            lastHighlightedValue !== NO_ACTIVE_VALUE && store.state.isItemEqualToValue(nextActiveValue, lastHighlightedValue);
        if (this.lastHighlight.index !== activeIndex || !isSameItem) {
            this.lastHighlight = { value: nextActiveValue, index: activeIndex };
            store.state.onItemHighlighted(
                nextActiveValue,
                createGenericEventDetails(REASONS.none, undefined, { index: activeIndex }) as never
            );
        }
        return;
    }

    /**
     * Keeps the selection valid when the items change (single: fall back to the default value if listed).
     */
    private pruneSelectedValue() {
        const { store } = this;
        if (!this.options.items || this.selectionMode === 'none') {
            return;
        }
        const registry = this.flatItems;
        const { selectedValue, isItemEqualToValue } = store.state;

        if (this.multiple) {
            const current = Array.isArray(selectedValue) ? selectedValue : EMPTY_ARRAY;
            const next = current.filter((value) => itemIncludes(registry, value, isItemEqualToValue));
            if (next.length !== current.length) {
                store.set('selectedValue', next);
            }
            return;
        }

        if (selectedValue == null || itemIncludes(registry, selectedValue, isItemEqualToValue)) {
            return;
        }

        const { defaultSelectedValue, itemToStringLabel } = this.options;
        const fallback =
            defaultSelectedValue != null && itemIncludes(registry, defaultSelectedValue, isItemEqualToValue) ? defaultSelectedValue : null;
        store.set('selectedValue', fallback);

        // Keep the input text in sync when the input is outside the popup.
        if (!store.state.inputInsidePopup) {
            const stringVal = stringifyAsLabel(fallback, itemToStringLabel);
            const input = store.state.inputRef.current;
            if (input && input.value !== stringVal) {
                this.setInputValue(stringVal, createChangeEventDetails(REASONS.none));
            }
        }
        return;
    }

    /**
     * Avoids an active index of 0 on an empty list (ArrowDown would need two presses).
     */
    private clearHighlightWhenEmpty() {
        if (this.options.items !== undefined && this.autoHighlightMode && this.derived.state.flatFilteredItems.length === 0) {
            this.setIndices({ activeIndex: null });
        }
        return;
    }

    private getClickOptions() {
        const { readOnly = false, openOnInputClick = true } = this.options;
        return {
            enabled: !readOnly && !this.disabled && openOnInputClick,
            event: 'mousedown-only' as const,
            toggle: false,
            // Let the iOS viewport centering settle before opening on touch.
            touchOpenDelay: this.store?.state.inputInsidePopup === false ? 50 : 0
        };
    }

    private getDismissOptions() {
        const { readOnly = false, inline = false } = this.options;
        const store = this.store;
        return {
            enabled: !readOnly && !this.disabled && !inline,
            outsidePressEvent: {
                mouse: 'sloppy' as const,
                // The visual viewport can be small with a software keyboard; let the user scroll.
                touch: 'intentional' as const
            },
            // Without a popup, let Escape bubble to other popups' handlers.
            bubbles: inline ? true : undefined,
            outsidePress: (event: MouseEvent | TouchEvent) => {
                const target = getTarget(event) as Element | null;
                return (
                    !contains(store.state.triggerElement, target) &&
                    !contains(store.state.clearRef.current, target) &&
                    !contains(store.state.chipsContainerRef.current, target)
                );
            }
        };
    }

    private getListNavigationOptions() {
        const { store } = this;
        const { readOnly = false, grid = false, keepHighlight = false, highlightItemOnHover = true } = this.options;
        const autoHighlightMode = this.autoHighlightMode;
        const { queryChangedAfterOpen } = this.internal.state;

        return {
            enabled: !readOnly && !this.disabled,
            id: this.id,
            listRef: store.state.listRef,
            activeIndex: store.state.activeIndex,
            selectedIndex: store.state.selectedIndex,
            virtual: true,
            loopFocus: true,
            allowEscape: !autoHighlightMode,
            focusItemOnOpen: queryChangedAfterOpen || (this.selectionMode === 'none' && !autoHighlightMode) ? false : ('auto' as const),
            focusItemOnHover: highlightItemOnHover,
            // `cols` > 1 enables grid navigation (rows infer the column sizes).
            cols: grid ? 2 : 1,
            orientation: grid ? ('horizontal' as const) : undefined,
            disabledIndices: EMPTY_ARRAY as number[],
            onNavigate: (nextActiveIndex: number | null, event: unknown) => {
                // Retain the highlight while transitioning out or closed.
                if ((!event && !store.state.open) || store.state.transitionStatus === 'ending') {
                    return;
                }
                const nativeEvent = event as Event | undefined;
                if (keepHighlight && nextActiveIndex === null && nativeEvent?.type === 'pointerleave') {
                    return;
                }
                if (event) {
                    this.setIndices({ activeIndex: nextActiveIndex, type: store.state.keyboardActiveRef.current ? 'keyboard' : 'pointer' });
                } else {
                    this.setIndices({ activeIndex: nextActiveIndex });
                }
            }
        };
    }

    private getRoleProps(): InteractionProps {
        const { store } = this;
        const { open, inputElement, listElement } = store.state;
        const { grid = false, inline = false, autoComplete = 'list' } = this.options;
        const isPlainInput = inputElement?.tagName === 'INPUT';
        const reference: Record<string, unknown> = isPlainInput
            ? { autoComplete: 'off', spellCheck: 'false', autoCorrect: 'off', autoCapitalize: 'none' }
            : {};

        if (isPlainInput || open) {
            reference.role = 'combobox';
            reference['aria-expanded'] = inline ? undefined : open ? 'true' : 'false';
            reference['aria-haspopup'] = inline ? undefined : grid ? 'grid' : 'listbox';
            reference['aria-controls'] = open ? listElement?.id : undefined;
            reference['aria-autocomplete'] = autoComplete;
        }

        return { reference, floating: { role: 'presentation' } };
    }

    private getInteractionList(): InteractionProps[] {
        return [this.getRoleProps(), this.click.getProps(), this.dismiss.getProps(), this.listNavigation.getProps()];
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

    private updateSharedProps() {
        const list = this.getInteractionList();
        this.store.update({
            popupProps: mergeInteractionProps(undefined, list, 'floating') as ElementProps,
            inputProps: mergeInteractionProps(undefined, list, 'reference') as ElementProps,
            triggerProps: this.interactionTypeProps as ElementProps
        });
    }
}
