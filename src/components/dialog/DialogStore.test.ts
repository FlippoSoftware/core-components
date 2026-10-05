import { describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { createDialogHandle, DialogHandle } from './store/DialogHandle';
import { DialogStore } from './store/DialogStore';

const trigger = (id: string) => {
    const element = document.createElement('button');
    element.id = id;
    return element;
};

describe('DialogStore', () => {
    it('has modal defaults and accepts initial state', () => {
        const store = new DialogStore({ role: 'alertdialog', modal: false });
        expect(store.select('role')).toBe('alertdialog');
        expect(store.select('modal')).toBe(false);
        expect(store.select('nested')).toBe(false);
        expect(store.select('nestedOpenDialogCount')).toBe(0);
        expect(store.select('disablePointerDismissal')).toBe(false);
        expect(store.select('openMethod')).toBeNull();
        expect(store.select('titleElementId')).toBeUndefined();
        expect(store.select('descriptionElementId')).toBeUndefined();
        expect(store.select('viewportElement')).toBeNull();
    });

    it('opens with a trigger and passes the old trigger when closing', () => {
        const store = new DialogStore();
        const onOpenChange = vi.fn();
        const emitted = vi.fn();
        store.setContextValue('onOpenChange', onOpenChange);
        store.state.floatingRootContext.context.events.on('openchange', emitted);

        const element = trigger('t');
        store.setOpen(true, createChangeEventDetails(REASONS.triggerPress, undefined, element));
        expect(store.state).toMatchObject({ open: true, activeTriggerId: 't', activeTriggerElement: element });
        expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ open: true, nested: false }));

        store.setOpen(false, createChangeEventDetails(REASONS.closePress));
        expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ trigger: element }));
        expect(store.state).toMatchObject({ open: false, activeTriggerId: 't', activeTriggerElement: element });
    });

    it('can be canceled', () => {
        const store = new DialogStore();
        store.setContextValue('onOpenChange', (_open, details) => {
            details.preventUnmountOnClose();
            details.cancel();
        });
        store.setOpen(true, createChangeEventDetails(REASONS.imperativeAction));
        expect(store.state.open).toBe(false);
        expect(store.state.preventUnmountingOnClose).toBe(true);
    });
});

describe('DialogHandle', () => {
    it('opens with and without a trigger', () => {
        const handle = createDialogHandle<{ id: number }>();
        const element = trigger('detached');
        handle.store.context.triggerElements.add('detached', element);

        handle.open('detached');
        expect(handle.isOpen).toBe(true);
        expect(handle.store.state.activeTriggerElement).toBe(element);

        handle.close();
        expect(handle.isOpen).toBe(false);

        handle.open(null);
        expect(handle.isOpen).toBe(true);
    });

    it('warns about unknown triggers but still opens', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const handle = new DialogHandle(new DialogStore());
        handle.open('missing');
        expect(handle.isOpen).toBe(true);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('No trigger found with id "missing"'));
        warn.mockRestore();
    });

    it('opens with a payload', () => {
        const handle = new DialogHandle<string>();
        handle.openWithPayload('data');
        expect(handle.store.state.payload).toBe('data');
        expect(handle.isOpen).toBe(true);
    });
});
