import { compareItemEquality } from '~@lib/itemEquality';
import { hasNullItemLabel, stringifyAsValue } from '~@lib/valueLabel';
import { createSelector } from '~@store/createSelector';

import type { ElementProps, Interaction, TransitionStatus } from '~@lib/types';
import type { ItemRecord, LabeledItem } from '~@lib/valueLabel';
import type { Store } from '~@store/Store';

/**
 * @template Label Label type of the adapter (e.g. `React.ReactNode`).
 */
export type SelectState<Label = unknown> = {
    id: string | undefined;
    modal: boolean;
    multiple: boolean;

    items: ItemRecord<Label> | readonly LabeledItem<Label>[] | undefined;
    itemToStringLabel: ((item: unknown) => string) | undefined;
    itemToStringValue: ((item: unknown) => string) | undefined;
    isItemEqualToValue: (itemValue: unknown, selectedValue: unknown) => boolean;

    value: unknown;

    open: boolean;
    mounted: boolean;
    forceMount: boolean;
    transitionStatus: TransitionStatus;
    openMethod: Interaction | null;

    activeIndex: number | null;
    selectedIndex: number | null;

    popupProps: ElementProps;
    triggerProps: ElementProps;
    triggerElement: HTMLElement | null;
    positionerElement: HTMLElement | null;
    listElement: HTMLDivElement | null;

    scrollUpArrowVisible: boolean;
    scrollDownArrowVisible: boolean;

    hasScrollArrows: boolean;
};

export type SelectStore<Label = unknown> = Store<SelectState<Label>>;

type S = SelectState;

export const selectSelectors = {
    id: createSelector((state: S) => state.id),
    modal: createSelector((state: S) => state.modal),
    multiple: createSelector((state: S) => state.multiple),

    items: createSelector((state: S) => state.items),
    itemToStringLabel: createSelector((state: S) => state.itemToStringLabel),
    itemToStringValue: createSelector((state: S) => state.itemToStringValue),
    isItemEqualToValue: createSelector((state: S) => state.isItemEqualToValue),

    value: createSelector((state: S) => state.value),

    hasSelectedValue: createSelector((state: S) => {
        const { value, multiple, itemToStringValue } = state;
        if (value == null) {
            return false;
        }
        if (multiple && Array.isArray(value)) {
            return value.length > 0;
        }

        return stringifyAsValue(value, itemToStringValue) !== '';
    }),

    hasNullItemLabel: createSelector((state: S, enabled: boolean) => {
        return enabled ? hasNullItemLabel(state.items) : false;
    }),

    open: createSelector((state: S) => state.open),
    mounted: createSelector((state: S) => state.mounted),
    forceMount: createSelector((state: S) => state.forceMount),
    transitionStatus: createSelector((state: S) => state.transitionStatus),
    openMethod: createSelector((state: S) => state.openMethod),

    activeIndex: createSelector((state: S) => state.activeIndex),
    selectedIndex: createSelector((state: S) => state.selectedIndex),
    isActive: createSelector((state: S, index: number) => state.activeIndex === index),

    isSelected: createSelector((state: S, index: number, itemValue: unknown) => {
        const comparer = state.isItemEqualToValue;
        const storeValue = state.value;

        if (state.multiple) {
            return Array.isArray(storeValue) && storeValue.some((selectedItem) => compareItemEquality(itemValue, selectedItem, comparer));
        }

        // `selectedIndex` is only updated after the items mount for the first time,
        // the value check avoids a re-render for the initially selected item.
        if (state.selectedIndex === index && state.selectedIndex !== null) {
            return true;
        }

        return compareItemEquality(itemValue, storeValue, comparer);
    }),
    isSelectedByFocus: createSelector((state: S, index: number) => {
        return state.selectedIndex === index;
    }),

    popupProps: createSelector((state: S) => state.popupProps),
    triggerProps: createSelector((state: S) => state.triggerProps),
    triggerElement: createSelector((state: S) => state.triggerElement),
    positionerElement: createSelector((state: S) => state.positionerElement),
    listElement: createSelector((state: S) => state.listElement),

    scrollUpArrowVisible: createSelector((state: S) => state.scrollUpArrowVisible),
    scrollDownArrowVisible: createSelector((state: S) => state.scrollDownArrowVisible),

    hasScrollArrows: createSelector((state: S) => state.hasScrollArrows)
};

export type SelectSelectors = typeof selectSelectors;
