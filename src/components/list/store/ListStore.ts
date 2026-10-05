import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';

import type { MutableRef, Orientation } from '~@lib/types';

export type ListState = {
    /**
     * Determines if the list is nested within a parent list.
     */
    nested: boolean;
    /**
     * Number of nested lists.
     */
    nestedListNumber: number;
    /**
     * Layout orientation.
     */
    orientation: Orientation;
    /**
     * List type.
     */
    type: 'ordered' | 'unordered';
    /**
     * Whether the items are being externally virtualized.
     * When `true`, items should pass their `index` prop explicitly
     * and CompositeList is not used.
     */
    virtualized: boolean;
    /**
     * A ref to the list of HTML elements, ordered by their index.
     */
    elementsRef: MutableRef<(HTMLElement | null)[]>;
};

export const listSelectors = {
    nested: createSelector((state: ListState) => state.nested),
    nestedListNumber: createSelector((state: ListState) => state.nestedListNumber),
    orientation: createSelector((state: ListState) => state.orientation),
    type: createSelector((state: ListState) => state.type),
    virtualized: createSelector((state: ListState) => state.virtualized),
    elementsRef: createSelector((state: ListState) => state.elementsRef)
};

export type ListSelectors = typeof listSelectors;

export class ListStore extends ComponentStore<ListState, undefined, ListSelectors> {
    static create(initialState: ListState) {
        return new ListStore(initialState, undefined, listSelectors);
    }
}
