import { describe, expect, it } from 'vitest';

import { Store } from '~@store/Store';

import { selectSelectors as s } from './store/SelectStore';

import type { SelectState } from './store/SelectStore';

const createState = (overrides: Partial<SelectState> = {}): SelectState => ({
    id: 'select',
    modal: true,
    multiple: false,
    items: undefined,
    itemToStringLabel: undefined,
    itemToStringValue: undefined,
    isItemEqualToValue: Object.is,
    value: null,
    open: false,
    mounted: false,
    forceMount: false,
    transitionStatus: undefined,
    openMethod: null,
    activeIndex: null,
    selectedIndex: null,
    popupProps: {},
    triggerProps: {},
    triggerElement: null,
    positionerElement: null,
    listElement: null,
    scrollUpArrowVisible: false,
    scrollDownArrowVisible: false,
    hasScrollArrows: false,
    ...overrides
});

describe('select selectors', () => {
    it('detects a selected value', () => {
        expect(s.hasSelectedValue(createState())).toBe(false);
        expect(s.hasSelectedValue(createState({ value: '' }))).toBe(false);
        expect(s.hasSelectedValue(createState({ value: 'a' }))).toBe(true);
        expect(s.hasSelectedValue(createState({ multiple: true, value: [] }))).toBe(false);
        expect(s.hasSelectedValue(createState({ multiple: true, value: ['a'] }))).toBe(true);
        expect(s.hasSelectedValue(createState({ value: { id: 1 }, itemToStringValue: () => 'one' }))).toBe(true);
    });

    it('checks for a null item label only when enabled', () => {
        const items = [{ value: null, label: 'None' }];
        expect(s.hasNullItemLabel(createState({ items }), true)).toBe(true);
        expect(s.hasNullItemLabel(createState({ items }), false)).toBe(false);
    });

    it('resolves selection for single and multiple modes', () => {
        const state = createState({ value: 'b', selectedIndex: 3 });
        expect(s.isSelected(state, 3, 'x')).toBe(true);
        expect(s.isSelected(state, 1, 'b')).toBe(true);
        expect(s.isSelected(state, 1, 'a')).toBe(false);
        expect(s.isSelectedByFocus(state, 3)).toBe(true);

        const multiple = createState({ multiple: true, value: ['a', 'c'] });
        expect(s.isSelected(multiple, 0, 'c')).toBe(true);
        expect(s.isSelected(multiple, 0, 'b')).toBe(false);
        expect(s.isSelected(createState({ multiple: true, value: 'a' }), 0, 'a')).toBe(false);
    });

    it('selects plain fields', () => {
        const trigger = document.createElement('button');
        const store = new Store(createState({ activeIndex: 2, triggerElement: trigger, open: true, hasScrollArrows: true }));
        const { state } = store;
        expect(s.isActive(state, 2)).toBe(true);
        expect(s.activeIndex(state)).toBe(2);
        expect(s.triggerElement(state)).toBe(trigger);
        expect(s.open(state)).toBe(true);
        expect(s.hasScrollArrows(state)).toBe(true);
        expect(
            [
                s.id,
                s.modal,
                s.multiple,
                s.items,
                s.itemToStringLabel,
                s.itemToStringValue,
                s.isItemEqualToValue,
                s.value,
                s.mounted,
                s.forceMount,
                s.transitionStatus,
                s.openMethod,
                s.selectedIndex,
                s.popupProps,
                s.triggerProps,
                s.positionerElement,
                s.listElement,
                s.scrollUpArrowVisible,
                s.scrollDownArrowVisible
            ].map((selector) => selector(state))
        ).toEqual([
            'select',
            true,
            false,
            undefined,
            undefined,
            undefined,
            Object.is,
            null,
            false,
            false,
            undefined,
            null,
            null,
            {},
            {},
            null,
            null,
            false,
            false
        ]);
    });
});
