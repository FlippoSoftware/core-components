import { compareItemEquality } from '~@lib/itemEquality';
import { createSelector } from '~@store/createSelector';

import type { ChangeEventDetails, GenericEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { ElementProps, Interaction, MutableRef, Side, TransitionStatus } from '~@lib/types';
import type { Store } from '~@store/Store';

export type ComboboxChangeEventReason =
    | typeof REASONS.triggerPress
    | typeof REASONS.outsidePress
    | typeof REASONS.itemPress
    | typeof REASONS.escapeKey
    | typeof REASONS.listNavigation
    | typeof REASONS.focusOut
    | typeof REASONS.inputChange
    | typeof REASONS.inputClear
    | typeof REASONS.clearPress
    | typeof REASONS.chipRemovePress
    | typeof REASONS.none
    | (string & {});

export type ComboboxChangeEventDetails = ChangeEventDetails<ComboboxChangeEventReason>;

export type ComboboxHighlightEventReason = 'keyboard' | 'pointer' | 'none';

export type ComboboxHighlightEventDetails = GenericEventDetails<ComboboxHighlightEventReason, { index: number }>;

export type ComboboxSelectionEvent = MouseEvent | PointerEvent | KeyboardEvent;

export type ComboboxState = {
    id: string | undefined;

    query: string;

    filter: (item: unknown, query: string) => boolean;

    items: readonly unknown[] | undefined;

    selectedValue: unknown;

    open: boolean;
    mounted: boolean;
    transitionStatus: TransitionStatus;
    forceMounted: boolean;

    inline: boolean;

    activeIndex: number | null;
    selectedIndex: number | null;

    popupProps: ElementProps;
    inputProps: ElementProps;
    triggerProps: ElementProps;

    positionerElement: HTMLElement | null;
    listElement: HTMLElement | null;
    triggerElement: HTMLElement | null;
    inputElement: HTMLInputElement | null;
    popupSide: Side | null;

    openMethod: Interaction | null;

    inputInsidePopup: boolean;

    selectionMode: 'single' | 'multiple' | 'none';

    listRef: MutableRef<(HTMLElement | null)[]>;
    labelsRef: MutableRef<(string | null)[]>;
    popupRef: MutableRef<HTMLDivElement | null>;
    emptyRef: MutableRef<HTMLDivElement | null>;
    inputRef: MutableRef<HTMLInputElement | null>;
    keyboardActiveRef: MutableRef<boolean>;
    chipsContainerRef: MutableRef<HTMLDivElement | null>;
    clearRef: MutableRef<HTMLButtonElement | null>;
    valuesRef: MutableRef<unknown[]>;
    allValuesRef: MutableRef<unknown[]>;
    selectionEventRef: MutableRef<ComboboxSelectionEvent | null>;

    setOpen: (open: boolean, eventDetails: ComboboxChangeEventDetails) => void;
    setInputValue: (value: string, eventDetails: ComboboxChangeEventDetails) => void;
    setSelectedValue: (value: unknown, eventDetails: ComboboxChangeEventDetails) => void;
    setIndices: (indices: { activeIndex?: number | null; selectedIndex?: number | null; type?: 'keyboard' | 'pointer' | 'none' }) => void;
    onItemHighlighted: (item: unknown, eventDetails: ComboboxHighlightEventDetails) => void;
    forceMount: () => void;
    handleSelection: (event: ComboboxSelectionEvent, passedValue?: unknown) => void;
    getItemProps: (props?: ElementProps & { active?: boolean; selected?: boolean }) => Record<string, unknown>;
    requestSubmit: () => void;

    name: string | undefined;
    disabled: boolean;
    readOnly: boolean;
    required: boolean;
    grid: boolean;
    isGrouped: boolean;
    virtualized: boolean;
    onOpenChangeComplete: (open: boolean) => void;
    openOnInputClick: boolean;
    itemToStringLabel?: ((item: unknown) => string) | undefined;
    isItemEqualToValue: (item: unknown, value: unknown) => boolean;
    modal: boolean;
    autoHighlight: false | 'always' | 'input-change';
    submitOnItemClick: boolean;
    hasInputValue: boolean;
};

export type ComboboxStore = Store<ComboboxState>;

type S = ComboboxState;

export const comboboxSelectors = {
    id: createSelector((state: S) => state.id),

    query: createSelector((state: S) => state.query),

    items: createSelector((state: S) => state.items),

    selectedValue: createSelector((state: S) => state.selectedValue),

    open: createSelector((state: S) => state.open),
    mounted: createSelector((state: S) => state.mounted),
    forceMounted: createSelector((state: S) => state.forceMounted),

    inline: createSelector((state: S) => state.inline),

    activeIndex: createSelector((state: S) => state.activeIndex),
    selectedIndex: createSelector((state: S) => state.selectedIndex),
    isActive: createSelector((state: S, index: number) => state.activeIndex === index),
    isSelected: createSelector((state: S, candidate: unknown) => {
        const comparer = state.isItemEqualToValue;
        const selectedValue = state.selectedValue;
        if (Array.isArray(selectedValue)) {
            return selectedValue.some((value) => compareItemEquality(value, candidate, comparer));
        }
        return compareItemEquality(selectedValue, candidate, comparer);
    }),

    transitionStatus: createSelector((state: S) => state.transitionStatus),

    popupProps: createSelector((state: S) => state.popupProps),
    inputProps: createSelector((state: S) => state.inputProps),
    triggerProps: createSelector((state: S) => state.triggerProps),
    getItemProps: createSelector((state: S) => state.getItemProps),

    positionerElement: createSelector((state: S) => state.positionerElement),
    listElement: createSelector((state: S) => state.listElement),
    triggerElement: createSelector((state: S) => state.triggerElement),
    inputElement: createSelector((state: S) => state.inputElement),
    popupSide: createSelector((state: S) => state.popupSide),

    openMethod: createSelector((state: S) => state.openMethod),

    inputInsidePopup: createSelector((state: S) => state.inputInsidePopup),

    selectionMode: createSelector((state: S) => state.selectionMode),
    listRef: createSelector((state: S) => state.listRef),
    labelsRef: createSelector((state: S) => state.labelsRef),
    popupRef: createSelector((state: S) => state.popupRef),
    emptyRef: createSelector((state: S) => state.emptyRef),
    inputRef: createSelector((state: S) => state.inputRef),
    keyboardActiveRef: createSelector((state: S) => state.keyboardActiveRef),
    chipsContainerRef: createSelector((state: S) => state.chipsContainerRef),
    clearRef: createSelector((state: S) => state.clearRef),
    valuesRef: createSelector((state: S) => state.valuesRef),
    allValuesRef: createSelector((state: S) => state.allValuesRef),

    name: createSelector((state: S) => state.name),
    disabled: createSelector((state: S) => state.disabled),
    readOnly: createSelector((state: S) => state.readOnly),
    required: createSelector((state: S) => state.required),
    grid: createSelector((state: S) => state.grid),
    isGrouped: createSelector((state: S) => state.isGrouped),
    virtualized: createSelector((state: S) => state.virtualized),
    onOpenChangeComplete: createSelector((state: S) => state.onOpenChangeComplete),
    openOnInputClick: createSelector((state: S) => state.openOnInputClick),
    itemToStringLabel: createSelector((state: S) => state.itemToStringLabel),
    isItemEqualToValue: createSelector((state: S) => state.isItemEqualToValue),
    modal: createSelector((state: S) => state.modal),
    autoHighlight: createSelector((state: S) => state.autoHighlight),
    submitOnItemClick: createSelector((state: S) => state.submitOnItemClick)
};

export type ComboboxSelectors = typeof comboboxSelectors;
