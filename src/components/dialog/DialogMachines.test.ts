import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogBackdrop } from './backdrop/DialogBackdrop';
import { DialogCloseMachine } from './close/DialogCloseMachine';
import { DialogPopupMachine } from './popup/DialogPopupMachine';
import { DialogRootMachine } from './root/DialogRootMachine';
import { DialogTriggerMachine } from './trigger/DialogTriggerMachine';
import { DialogViewport } from './viewport/DialogViewport';

function click(handler: (event: MouseEvent) => void, target: Element) {
    const event = new MouseEvent('click', { detail: 1, bubbles: true });
    Object.defineProperty(event, 'currentTarget', { value: target });
    handler(event);
}

describe('Dialog machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('opens from the trigger, renders the popup props and closes with Close', () => {
        const onOpenChange = vi.fn();
        const root = new DialogRootMachine({ onOpenChange }, { fallbackReferenceId: 'ref' });
        const trigger = new DialogTriggerMachine(root.store, { id: 'trigger' });
        const triggerElement = document.createElement('button');
        triggerElement.id = 'trigger';
        document.body.append(triggerElement);
        trigger.setElement(triggerElement);

        const popup = new DialogPopupMachine(root.store);
        const popupElement = document.createElement('div');
        document.body.append(popupElement);
        popup.setElement(popupElement);

        click(trigger.getTriggerProps().onClick, triggerElement);
        expect(root.store.select('open')).toBe(true);
        expect(onOpenChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: 'trigger-press' }));
        expect(DialogTriggerMachine.attrs(trigger.getState())).toHaveProperty('data-popup-open', '');

        const popupProps = popup.getPopupProps();
        expect(popupProps.role).toBe('dialog');
        expect(popupProps.hidden).toBe(false);
        expect(DialogPopupMachine.attrs(popup.getState())).toHaveProperty('data-open', '');

        expect(DialogBackdrop.shouldRender(root.store)).toBe(true);
        expect(DialogViewport.getProps(root.store).hidden).toBe(false);

        const close = new DialogCloseMachine(root.store);
        click(close.getCloseProps().onClick, triggerElement);
        expect(root.store.select('open')).toBe(false);
        expect(root.store.select('mounted')).toBe(false);

        popup.destroy();
        trigger.destroy();
        root.destroy();
    });

    it('tracks nested open dialogs', () => {
        const parent = new DialogRootMachine({ defaultOpen: true }, { fallbackReferenceId: 'parent' });
        const child = new DialogRootMachine({}, { fallbackReferenceId: 'child', parentStore: parent.store as never });

        expect(child.store.select('nested')).toBe(true);
        expect(DialogBackdrop.shouldRender(child.store as never)).toBe(false);

        child.store.setOpen(true, { reason: 'imperative-action', event: new Event('x') } as never);
        expect(parent.store.select('nestedOpenDialogCount')).toBe(1);

        child.actions.close();
        expect(parent.store.select('nestedOpenDialogCount')).toBe(0);

        child.destroy();
        parent.destroy();
    });
});
