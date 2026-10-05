import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { SelectItemMachine } from './item/SelectItemMachine';
import { SelectPopupMachine } from './popup/SelectPopupMachine';
import { SelectPositionerMachine } from './positioner/SelectPositionerMachine';
import { SelectRootMachine } from './root/SelectRootMachine';
import { SelectScrollArrowMachine } from './scroll-arrow/SelectScrollArrowMachine';
import { SelectTriggerMachine } from './trigger/SelectTriggerMachine';
import { SelectValue } from './value/SelectValue';

function click(handler: (event: MouseEvent) => void, target: Element) {
    const event = new MouseEvent('click', { detail: 1, bubbles: true });
    Object.defineProperty(event, 'currentTarget', { value: target });
    handler(event);
}

function setup(options: ConstructorParameters<typeof SelectRootMachine>[0] = {}) {
    const root = new SelectRootMachine(options, { defaultId: 'select' });
    const trigger = new SelectTriggerMachine(root);
    const triggerElement = document.createElement('button');
    document.body.append(triggerElement);
    trigger.setElement(triggerElement);

    const positioner = new SelectPositionerMachine(root, { alignItemWithTrigger: false });
    const popup = new SelectPopupMachine(root, { positioner });
    const positionerElement = document.createElement('div');
    const popupElement = document.createElement('div');
    positionerElement.append(popupElement);
    document.body.append(positionerElement);
    positioner.setElement(positionerElement);
    popup.setElement(popupElement);

    const items = ['apple', 'banana'].map((value) => {
        const item = new SelectItemMachine(root, positioner.items, { value, label: value });
        const element = document.createElement('div');
        popupElement.append(element);
        item.setElement(element);
        return { item, element };
    });

    const destroy = () => {
        for (const { item } of items) {
            item.destroy();
        }
        popup.destroy();
        positioner.destroy();
        trigger.destroy();
        root.destroy();
    };

    return { root, trigger, triggerElement, positioner, popup, items, destroy };
}

describe('Select machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('selects an item and closes', async () => {
        const onValueChange = vi.fn();
        const { root, trigger, items, destroy } = setup({ onValueChange, defaultOpen: true, items: { apple: 'Apple', banana: 'Banana' } });
        await Promise.resolve();

        expect(trigger.getTriggerProps().role).toBe('combobox');
        expect(trigger.getTriggerProps()['aria-expanded']).toBe('true');
        expect(SelectTriggerMachine.attrs(trigger.getState())).toHaveProperty('data-placeholder', '');

        const banana = items[1];
        if (!banana) {
            throw new Error('missing item');
        }
        root.store.set('activeIndex', banana.item.index.state.index);
        click(banana.item.getItemProps().onClick, banana.element);

        expect(onValueChange).toHaveBeenCalledWith('banana', expect.objectContaining({ reason: REASONS.itemPress }));
        expect(root.store.state.value).toBe('banana');
        expect(root.store.state.open).toBe(false);
        expect(SelectValue.resolve(root, { hasChildren: false, hasPlaceholder: true })).toEqual({ kind: 'label', label: 'Banana' });
        expect(root.getHiddenInputProps().value).toBe('banana');

        destroy();
    });

    it('supports multiple selection', () => {
        const { root, items, destroy } = setup({ multiple: true, name: 'fruits', defaultOpen: true });
        for (const { item, element } of items) {
            root.store.set('activeIndex', item.index.state.index);
            click(item.getItemProps().onClick, element);
        }
        expect(root.store.state.value).toEqual(['apple', 'banana']);
        expect(root.store.state.open).toBe(true);
        expect(root.getHiddenInputs()).toEqual([
            { name: 'fruits', value: 'apple' },
            { name: 'fruits', value: 'banana' }
        ]);
        expect(items[0]?.item.getState().selected).toBe(true);
        destroy();
    });

    it('respects controlled open and cancellation', () => {
        const onOpenChange = vi.fn((_open: boolean, details: { cancel: () => void }) => details.cancel());
        const { root, positioner, destroy } = setup({ onOpenChange });
        root.setOpen(true, createChangeEventDetails(REASONS.triggerPress));
        expect(root.store.state.open).toBe(false);

        root.setOptions({ open: true });
        expect(root.store.state.open).toBe(true);
        expect(positioner.getPositionerProps().hidden).toBe(false);
        expect(positioner.shouldRenderInternalBackdrop()).toBe(true);

        const arrow = new SelectScrollArrowMachine(root, positioner, 'down');
        expect(root.store.state.hasScrollArrows).toBe(true);
        expect(arrow.shouldRender()).toBe(false);
        arrow.destroy();
        expect(root.store.state.hasScrollArrows).toBe(false);

        destroy();
    });
});
