import { describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { createTooltipHandle, TooltipHandle } from './store/TooltipHandle';
import { selectTooltipMultipleActive, selectTooltipOpen, TooltipMultipleStore } from './store/TooltipMultipleStore';
import { TooltipStore } from './store/TooltipStore';

import type { TooltipChangeEventDetails } from './store/TooltipStore';

const trigger = (id: string) => {
    const element = document.createElement('button');
    element.id = id;
    return element;
};

const details = (reason: Parameters<typeof createChangeEventDetails>[0], extra: Partial<TooltipChangeEventDetails> = {}) =>
    Object.assign(createChangeEventDetails(reason), extra) as TooltipChangeEventDetails;

describe('TooltipStore', () => {
    it('sets the instant type from the reason', () => {
        const store = new TooltipStore();

        store.setOpen(true, createChangeEventDetails(REASONS.triggerFocus));
        expect(store.state.instantType).toBe('focus');

        store.setOpen(false, createChangeEventDetails(REASONS.triggerPress));
        expect(store.state.instantType).toBe('dismiss');

        store.setOpen(true, createChangeEventDetails(REASONS.imperativeAction));
        expect(store.state.instantType).toBe('dismiss');

        store.setOpen(false, createChangeEventDetails(REASONS.escapeKey));
        expect(store.state.instantType).toBe('dismiss');
        expect(store.state.openChangeReason).toBe('escape-key');
    });

    it('flushes hover changes', () => {
        const store = new TooltipStore({ instantType: 'delay' });
        const flushSync = vi.fn((fn: () => void) => fn());
        store.setContextValue('flushSync', flushSync);
        const element = trigger('t');

        store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, undefined, element));
        expect(flushSync).toHaveBeenCalledTimes(1);
        expect(store.state).toMatchObject({ open: true, instantType: undefined, activeTriggerId: 't', activeTriggerElement: element });

        store.setOpen(false, createChangeEventDetails(REASONS.triggerHover));
        expect(store.state).toMatchObject({ open: false, activeTriggerId: 't' });
    });

    it('can be canceled', () => {
        const store = new TooltipStore();
        store.setContextValue('onOpenChange', (_open, eventDetails) => {
            eventDetails.preventUnmountOnClose();
            eventDetails.cancel();
        });
        store.setOpen(true, createChangeEventDetails(REASONS.triggerFocus));
        expect(store.state.open).toBe(false);
        expect(store.state.preventUnmountingOnClose).toBe(true);
    });

    it('exposes tooltip selectors', () => {
        const store = new TooltipStore({
            disabled: true,
            trackCursorAxis: 'x',
            disableHoverablePopup: true,
            closeDelay: 10,
            multipleItemIndex: 1
        });
        expect(store.select('disabled')).toBe(true);
        expect(store.select('trackCursorAxis')).toBe('x');
        expect(store.select('disableHoverablePopup')).toBe(true);
        expect(store.select('closeDelay')).toBe(10);
        expect(store.select('multipleItemIndex')).toBe(1);
        expect(store.select('multipleItemRef')).toBeNull();
        expect(store.select('isInstantPhase')).toBe(true);
        expect(store.select('instantType')).toBeUndefined();
        expect(store.select('lastOpenChangeReason')).toBeNull();
    });
});

describe('TooltipMultipleStore', () => {
    it('overrides setOpen of registered stores and syncs the shared state', () => {
        const group = new TooltipMultipleStore(true);
        const store = new TooltipStore({ primaryTriggerId: 'primary' });
        const primary = trigger('primary');
        store.context.triggerElements.add('primary', primary);
        const originalSetOpen = store.setOpen;

        const cleanup = group.registerStore(store as TooltipStore<unknown>);
        expect(store.setOpen).toBe(group.setOpen);
        expect(store.state).toMatchObject({ open: true, activeTriggerElement: primary });
        expect(group.registerStore(store as TooltipStore<unknown>)).toBeTypeOf('function');

        const onOpenChange = vi.fn();
        group.setContextValue('onOpenChange', onOpenChange);
        store.setOpen(false, details(REASONS.triggerHover, { multipleItemIndex: 0 }));
        expect(group.state).toEqual({ open: false, activeIndex: 0 });
        expect(onOpenChange).toHaveBeenCalledTimes(1);

        store.setOpen(false, details(REASONS.triggerHover));
        expect(onOpenChange).toHaveBeenCalledTimes(1);

        cleanup();
        expect(store.setOpen).toBe(originalSetOpen);
        expect(group.context.stores.size).toBe(0);
    });

    it('does not sync stores that already match', () => {
        const group = new TooltipMultipleStore(false);
        const store = new TooltipStore();
        const onOpenChange = vi.fn();
        store.setContextValue('onOpenChange', onOpenChange);
        group.registerStore(store as TooltipStore<unknown>);
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('can cancel the shared change', () => {
        const group = new TooltipMultipleStore();
        group.setContextValue('onOpenChange', (_open, eventDetails) => eventDetails.cancel());
        group.setOpen(true, details(REASONS.triggerHover));
        expect(group.state.open).toBe(false);
    });

    it('collects triggers and popups of the group', () => {
        const group = new TooltipMultipleStore();
        const a = new TooltipStore();
        const b = new TooltipStore();
        const triggerA = trigger('a');
        const icon = triggerA.appendChild(document.createElement('span'));
        const popup = document.createElement('div');
        const popupChild = popup.appendChild(document.createElement('span'));
        a.context.triggerElements.add('a', triggerA);
        b.set('popupElement', popup);
        group.registerStore(a as TooltipStore<unknown>);
        group.registerStore(b as TooltipStore<unknown>);

        expect(group.getAllTriggerElements()).toEqual([triggerA]);
        expect(group.getAllPopupElements()).toEqual([popup]);
        expect(group.isElementInGroup(triggerA)).toBe(true);
        expect(group.isElementInGroup(icon)).toBe(true);
        expect(group.isElementInGroup(popupChild)).toBe(true);
        expect(group.isElementInGroup(document.createElement('div'))).toBe(false);
        expect(group.isElementInGroup(null)).toBe(false);

        group.registerPopup(popup);
        expect(group.context.popupElements.has(popup)).toBe(true);
        group.unregisterPopup(popup);
        expect(group.context.popupElements.size).toBe(0);

        group.unregisterStore(new TooltipStore() as TooltipStore<unknown>);
        expect(group.context.stores.size).toBe(2);
    });

    it('resolves open and active state through the group', () => {
        const store = new TooltipStore({ open: true, multipleItemIndex: 1 });
        expect(selectTooltipOpen(store as TooltipStore<unknown>, null)).toBe(true);
        expect(selectTooltipMultipleActive(store as TooltipStore<unknown>, null)).toBe(false);

        const group = new TooltipMultipleStore(false);
        group.set('activeIndex', 1);
        expect(selectTooltipOpen(store as TooltipStore<unknown>, group)).toBe(false);
        expect(selectTooltipMultipleActive(store as TooltipStore<unknown>, group)).toBe(true);
    });
});

describe('TooltipHandle', () => {
    it('opens with a registered trigger and closes', () => {
        const handle = createTooltipHandle();
        const element = trigger('detached');
        handle.store.context.triggerElements.add('detached', element);

        handle.open('detached');
        expect(handle.isOpen).toBe(true);
        expect(handle.store.state.activeTriggerElement).toBe(element);

        handle.close();
        expect(handle.isOpen).toBe(false);
    });

    it('throws for unknown triggers', () => {
        expect(() => new TooltipHandle(new TooltipStore()).open('missing')).toThrow('No trigger found with id "missing"');
    });
});
