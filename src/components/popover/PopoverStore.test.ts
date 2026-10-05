import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { PATIENT_CLICK_THRESHOLD } from '~@lib/constants';

import { createPopoverHandle, PopoverHandle } from './store/PopoverHandle';
import { PopoverStore } from './store/PopoverStore';

const trigger = (id = 'trigger') => {
    const element = document.createElement('button');
    element.id = id;
    return element;
};

describe('PopoverStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('mounts when created open', () => {
        expect(new PopoverStore({ open: true }).state.mounted).toBe(true);
        expect(new PopoverStore({ open: true, mounted: false }).state.mounted).toBe(false);
    });

    it('opens with the trigger and emits openchange', () => {
        const store = new PopoverStore();
        const onOpenChange = vi.fn();
        const emitted = vi.fn();
        store.setContextValue('onOpenChange', onOpenChange);
        store.state.floatingRootContext.context.events.on('openchange', emitted);

        const element = trigger();
        const event = new MouseEvent('click', { detail: 1 });
        store.setOpen(true, createChangeEventDetails(REASONS.triggerPress, event, element));

        expect(store.state).toMatchObject({
            open: true,
            openChangeReason: 'trigger-press',
            activeTriggerId: 'trigger',
            activeTriggerElement: element,
            instantType: undefined
        });
        expect(onOpenChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: 'trigger-press' }));
        expect(emitted).toHaveBeenCalledWith(
            expect.objectContaining({ open: true, reason: 'trigger-press', triggerElement: element, nested: false })
        );
    });

    it('lets onOpenChange cancel the change and prevent unmounting', () => {
        const store = new PopoverStore();
        store.setContextValue('onOpenChange', (_open, details) => {
            details.preventUnmountOnClose();
            details.cancel();
        });
        store.setOpen(true, createChangeEventDetails(REASONS.triggerPress));
        expect(store.state.open).toBe(false);
        expect(store.state.preventUnmountingOnClose).toBe(true);
    });

    it('keeps the previous trigger when closing without one', () => {
        const element = trigger();
        const store = new PopoverStore({ open: true, activeTriggerId: 'trigger', activeTriggerElement: element });
        store.setOpen(false, createChangeEventDetails(REASONS.outsidePress));
        expect(store.state).toMatchObject({ open: false, activeTriggerId: 'trigger', activeTriggerElement: element });
    });

    it('sets the instant type from the reason', () => {
        const store = new PopoverStore();

        store.setOpen(true, createChangeEventDetails(REASONS.triggerPress, new MouseEvent('click', { detail: 0 })));
        expect(store.state.instantType).toBe('click');

        store.setOpen(false, createChangeEventDetails(REASONS.escapeKey));
        expect(store.state.instantType).toBe('dismiss');

        store.setOpen(false, createChangeEventDetails(REASONS.focusOut));
        expect(store.state.instantType).toBe('focus');

        store.setOpen(true, createChangeEventDetails(REASONS.outsidePress));
        expect(store.state.instantType).toBeUndefined();
    });

    it('flushes hover changes and sticks open for a patient click', () => {
        const store = new PopoverStore();
        const flushSync = vi.fn((fn: () => void) => fn());
        store.setContextValue('flushSync', flushSync);

        store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, new MouseEvent('mouseenter')));
        expect(flushSync).toHaveBeenCalledTimes(1);
        expect(store.state.open).toBe(true);
        expect(store.state.stickIfOpen).toBe(true);

        vi.advanceTimersByTime(PATIENT_CLICK_THRESHOLD);
        expect(store.state.stickIfOpen).toBe(false);
    });

    it('clears the stick timeout on destroy', () => {
        const store = new PopoverStore({ stickIfOpen: false });
        store.setOpen(true, createChangeEventDetails(REASONS.triggerHover));
        store.destroy();
        vi.advanceTimersByTime(PATIENT_CLICK_THRESHOLD);
        expect(store.state.stickIfOpen).toBe(true);
    });

    it('exposes popover selectors', () => {
        const store = new PopoverStore({
            disabled: true,
            modal: 'trap-focus',
            openMethod: 'keyboard',
            titleElementId: 'title',
            descriptionElementId: 'description',
            openOnHover: true,
            closeDelay: 100
        });
        expect(store.select('disabled')).toBe(true);
        expect(store.select('modal')).toBe('trap-focus');
        expect(store.select('openMethod')).toBe('keyboard');
        expect(store.select('titleElementId')).toBe('title');
        expect(store.select('descriptionElementId')).toBe('description');
        expect(store.select('openOnHover')).toBe(true);
        expect(store.select('closeDelay')).toBe(100);
        expect(store.select('stickIfOpen')).toBe(true);
        expect(store.select('instantType')).toBeUndefined();
        expect(store.select('openChangeReason')).toBeNull();
    });
});

describe('PopoverHandle', () => {
    it('opens with a registered trigger and closes', () => {
        const handle = createPopoverHandle();
        const element = trigger('detached');
        handle.store.context.triggerElements.add('detached', element);

        handle.open('detached');
        expect(handle.isOpen).toBe(true);
        expect(handle.store.state.activeTriggerElement).toBe(element);
        expect(handle.store.state.openChangeReason).toBe('imperative-action');

        handle.close();
        expect(handle.isOpen).toBe(false);
    });

    it('throws for unknown triggers', () => {
        expect(() => new PopoverHandle().open('missing')).toThrow('No trigger found with id "missing"');
    });
});
