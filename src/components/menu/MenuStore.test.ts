import { describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { createMenuHandle, MenuHandle } from './store/MenuHandle';
import { MenuStore } from './store/MenuStore';

import type { MenuParent } from './store/MenuStore';

const menubar = (disabled: boolean): MenuParent => ({
    type: 'menubar',
    context: { disabled, rootId: 'menubar-root', allowMouseUpTriggerRef: { current: true } }
});

describe('MenuStore', () => {
    it('derives disabled and modal from the parent', () => {
        const store = new MenuStore({ parent: menubar(true) });
        expect(store.select('disabled')).toBe(true);
        expect(store.select('modal')).toBe(false);
        expect(store.select('rootId')).toBe('menubar-root');
        expect(store.context.allowMouseUpTriggerRef.current).toBe(true);

        store.set('parent', { type: undefined });
        expect(store.select('disabled')).toBe(false);
        expect(store.select('modal')).toBe(true);

        store.set('parent', { type: 'context-menu', context: { rootId: 'ctx', allowMouseUpTriggerRef: { current: false } } });
        expect(store.select('modal')).toBe(true);
        expect(store.select('rootId')).toBe('ctx');
    });

    it('inherits from a parent menu and re-notifies on its updates', () => {
        const relay = vi.fn();
        const parent = new MenuStore({ rootId: 'root', keyboardEventRelay: relay });
        const child = new MenuStore({ parent: { type: 'menu', store: parent } });

        expect(child.select('rootId')).toBe('root');
        expect(child.select('floatingTreeRoot')).toBe(parent.state.floatingTreeRoot);
        expect(child.select('keyboardEventRelay')).toBe(relay);
        expect(child.context.allowMouseUpTriggerRef).toBe(parent.context.allowMouseUpTriggerRef);

        const listener = vi.fn();
        child.subscribe(listener);
        parent.set('activeIndex', 2);
        expect(listener).toHaveBeenCalledTimes(1);

        child.destroy();
        parent.set('activeIndex', 3);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops listening to the previous parent menu when the parent changes', () => {
        const parent = new MenuStore();
        const child = new MenuStore({ parent: { type: 'menu', store: parent } });
        child.set('parent', { type: undefined });

        const listener = vi.fn();
        child.subscribe(listener);
        parent.set('activeIndex', 1);
        expect(listener).not.toHaveBeenCalled();
        expect(child.select('keyboardEventRelay')).toBeUndefined();
        expect(child.select('rootId')).toBeUndefined();
    });

    it('exposes item and hover state', () => {
        const store = new MenuStore({ activeIndex: 1, closeDelay: 50, itemProps: { role: 'menuitem' } });
        expect(store.select('isActive', 1)).toBe(true);
        expect(store.select('isActive', 2)).toBe(false);
        expect(store.select('activeIndex')).toBe(1);
        expect(store.select('closeDelay')).toBe(50);
        expect(store.select('itemProps')).toEqual({ role: 'menuitem' });
        expect(store.select('hoverEnabled')).toBe(true);
        expect(store.select('allowMouseEnter')).toBe(false);
        expect(store.select('stickIfOpen')).toBe(true);
        expect(store.select('instantType')).toBeUndefined();
        expect(store.select('lastOpenChangeReason')).toBeNull();
        expect(store.select('floatingNodeId')).toBeUndefined();
        expect(store.select('floatingParentNodeId')).toBeNull();
        expect(store.select('parent')).toEqual({ type: undefined });
    });

    it('requests open changes through the floating root events', () => {
        const store = new MenuStore();
        const listener = vi.fn();
        store.state.floatingRootContext.context.events.on('setOpen', listener);

        const details = createChangeEventDetails(REASONS.triggerPress);
        store.setOpen(true, details);
        expect(listener).toHaveBeenCalledWith({ open: true, eventDetails: details });
    });
});

describe('MenuHandle', () => {
    it('opens with a registered trigger and closes', () => {
        const handle = createMenuHandle();
        const listener = vi.fn();
        handle.store.state.floatingRootContext.context.events.on('setOpen', listener);
        const element = document.createElement('button');
        handle.store.context.triggerElements.add('t', element);

        handle.open('t');
        expect(listener).toHaveBeenLastCalledWith({
            open: true,
            eventDetails: expect.objectContaining({ trigger: element, reason: 'imperative-action' })
        });

        handle.close();
        expect(listener).toHaveBeenLastCalledWith({ open: false, eventDetails: expect.objectContaining({ trigger: undefined }) });
        expect(handle.isOpen).toBe(false);
    });

    it('throws for unknown triggers', () => {
        expect(() => new MenuHandle(new MenuStore()).open('missing')).toThrow('No trigger found with id "missing"');
    });
});
