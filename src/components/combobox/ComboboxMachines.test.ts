import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutocompleteRootMachine } from '~@components/autocomplete/root/AutocompleteRootMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { ComboboxClearMachine } from './clear/ComboboxClearMachine';
import { ComboboxInputMachine } from './input/ComboboxInputMachine';
import { ComboboxItemMachine } from './item/ComboboxItemMachine';
import { ComboboxListMachine } from './list/ComboboxListMachine';
import { ComboboxParts } from './parts/ComboboxParts';
import { ComboboxRootMachine } from './root/ComboboxRootMachine';
import { createComboboxFilter, createFilter } from './utils/comboboxFilter';

const fruits = ['Apple', 'Banana', 'Cherry', 'Ãpricot'];

function typeInto(input: ComboboxInputMachine, element: HTMLInputElement, value: string) {
    element.value = value;
    const event = new Event('input');
    Object.defineProperty(event, 'currentTarget', { value: element });
    input.getInputProps().onChange(event);
}

function setup(options: ConstructorParameters<typeof ComboboxRootMachine>[0]) {
    const root = new ComboboxRootMachine(options, { defaultId: 'cb' });
    const input = new ComboboxInputMachine(root, { id: 'cb-input' });
    const inputElement = document.createElement('input');
    document.body.append(inputElement);
    input.setElement(inputElement);
    return { root, input, inputElement };
}

describe('Combobox machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('filters with the locale-aware collator', () => {
        const filter = createFilter();
        expect(filter.contains('Ãpricot', 'apr')).toBe(true);
        expect(filter.startsWith('Banana', 'ban')).toBe(true);
        expect(filter.endsWith('Banana', 'NA')).toBe(true);
        expect(createComboboxFilter({ value: 'Apple' }).contains('Banana', 'Apple')).toBe(true);
    });

    it('opens while typing and derives the filtered items', () => {
        const onInputValueChange = vi.fn();
        const { root, input, inputElement } = setup({ items: fruits, selectionMode: 'single', onInputValueChange });

        typeInto(input, inputElement, 'ap');
        expect(onInputValueChange).toHaveBeenCalledWith('ap', expect.objectContaining({ reason: REASONS.inputChange }));
        expect(root.store.state.open).toBe(true);
        expect(root.derived.state.flatFilteredItems).toEqual(['Apple', 'Ãpricot']);
        expect(ComboboxInputMachine.attrs(input.getState())).toHaveProperty('data-popup-open', '');
        expect(input.getInputProps().role).toBe('combobox');

        root.destroy();
    });

    it('selects an item, fills the input and closes', () => {
        const onSelectedValueChange = vi.fn();
        const { root } = setup({ items: fruits, selectionMode: 'single', onSelectedValueChange, defaultOpen: true });
        const list = new ComboboxListMachine(root, false);
        const listElement = document.createElement('div');
        document.body.append(listElement);
        list.setElement(listElement);

        const item = new ComboboxItemMachine(root, { value: 'Banana', index: 1 }, { registry: null });
        const itemElement = document.createElement('div');
        listElement.append(itemElement);
        item.setElement(itemElement);

        const click = new MouseEvent('click');
        Object.defineProperty(click, 'currentTarget', { value: itemElement });
        item.getItemProps().onClick(click);

        expect(onSelectedValueChange).toHaveBeenCalledWith('Banana', expect.objectContaining({ reason: REASONS.itemPress }));
        expect(root.store.state.selectedValue).toBe('Banana');
        expect(root.store.state.open).toBe(false);
        expect(root.inputValue.state.inputValue).toBe('Banana');
        expect(item.getState().selected).toBe(true);
        expect(ComboboxParts.getValueLabel(root)).toBe('Banana');
        expect(root.getHiddenInputProps().value).toBe('Banana');

        item.destroy();
        list.destroy();
        root.destroy();
    });

    it('supports multiple selection and clearing', () => {
        const { root } = setup({ items: fruits, selectionMode: 'multiple', name: 'fruits' });
        root.handleSelection(new MouseEvent('click'), 'Apple');
        root.handleSelection(new MouseEvent('click'), 'Cherry');
        expect(root.store.state.selectedValue).toEqual(['Apple', 'Cherry']);
        expect(root.getHiddenInputs()).toHaveLength(2);

        const clear = new ComboboxClearMachine(root);
        expect(clear.visible).toBe(true);
        clear.getClearProps().onClick(new MouseEvent('click'));
        expect(root.store.state.selectedValue).toEqual([]);
        expect(clear.visible).toBe(false);

        clear.destroy();
        root.destroy();
    });

    it('cancels opening through onOpenChange', () => {
        const { root } = setup({
            items: fruits,
            onOpenChange: (_open, details) => details.cancel()
        });
        root.setOpen(true, createChangeEventDetails(REASONS.triggerPress));
        expect(root.store.state.open).toBe(false);
        root.destroy();
    });

    it('autocomplete keeps the typed value as its value', () => {
        const onValueChange = vi.fn();
        const autocomplete = new AutocompleteRootMachine({ items: fruits, onValueChange }, { defaultId: 'ac' });
        autocomplete.combobox.setInputValue('ch', createChangeEventDetails(REASONS.inputChange));
        expect(onValueChange).toHaveBeenCalledWith('ch', expect.anything());
        expect(autocomplete.getValue()).toBe('ch');
        expect(autocomplete.combobox.derived.state.flatFilteredItems).toEqual(['Cherry']);
        autocomplete.destroy();
    });
});
