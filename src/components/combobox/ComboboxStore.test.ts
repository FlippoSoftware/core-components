import { describe, expect, it, vi } from 'vitest';

import { createRef } from '~@lib/ref';

import { comboboxSelectors as s } from './store/ComboboxStore';

import type { ComboboxState } from './store/ComboboxStore';

const createState = (overrides: Partial<ComboboxState> = {}): ComboboxState => ({
    id: 'combobox',
    query: '',
    filter: () => true,
    items: undefined,
    selectedValue: null,
    open: false,
    mounted: false,
    transitionStatus: undefined,
    forceMounted: false,
    inline: false,
    activeIndex: null,
    selectedIndex: null,
    popupProps: {},
    inputProps: {},
    triggerProps: {},
    positionerElement: null,
    listElement: null,
    triggerElement: null,
    inputElement: null,
    popupSide: null,
    openMethod: null,
    inputInsidePopup: false,
    selectionMode: 'single',
    listRef: { current: [] },
    labelsRef: { current: [] },
    popupRef: createRef<HTMLDivElement>(),
    emptyRef: createRef<HTMLDivElement>(),
    inputRef: createRef<HTMLInputElement>(),
    keyboardActiveRef: { current: false },
    chipsContainerRef: createRef<HTMLDivElement>(),
    clearRef: createRef<HTMLButtonElement>(),
    valuesRef: { current: [] },
    allValuesRef: { current: [] },
    selectionEventRef: { current: null },
    setOpen: vi.fn(),
    setInputValue: vi.fn(),
    setSelectedValue: vi.fn(),
    setIndices: vi.fn(),
    onItemHighlighted: vi.fn(),
    forceMount: vi.fn(),
    handleSelection: vi.fn(),
    getItemProps: vi.fn(() => ({})),
    requestSubmit: vi.fn(),
    name: undefined,
    disabled: false,
    readOnly: false,
    required: false,
    grid: false,
    isGrouped: false,
    virtualized: false,
    onOpenChangeComplete: vi.fn(),
    openOnInputClick: true,
    itemToStringLabel: undefined,
    isItemEqualToValue: Object.is,
    modal: false,
    autoHighlight: false,
    submitOnItemClick: false,
    hasInputValue: false,
    ...overrides
});

describe('combobox selectors', () => {
    it('resolves selection for single and multiple values', () => {
        const byId = (a: unknown, b: unknown) => (a as { id: number }).id === (b as { id: number }).id;
        const single = createState({ selectedValue: { id: 1 }, isItemEqualToValue: byId });
        expect(s.isSelected(single, { id: 1 })).toBe(true);
        expect(s.isSelected(single, { id: 2 })).toBe(false);

        const multiple = createState({ selectedValue: ['a', 'b'] });
        expect(s.isSelected(multiple, 'b')).toBe(true);
        expect(s.isSelected(multiple, 'c')).toBe(false);
        expect(s.isSelected(createState(), null)).toBe(true);
    });

    it('selects plain fields', () => {
        const state = createState({ activeIndex: 1, query: 'ap', popupSide: 'top' });
        expect(s.isActive(state, 1)).toBe(true);
        expect(s.query(state)).toBe('ap');
        expect(s.popupSide(state)).toBe('top');

        const keys = Object.keys(s).filter((key) => !['isActive', 'isSelected'].includes(key)) as (keyof typeof s)[];
        for (const key of keys) {
            const selector = s[key] as (value: ComboboxState) => unknown;
            const field = key in state ? state[key as keyof ComboboxState] : undefined;
            expect(selector(state)).toBe(field);
        }
    });
});
