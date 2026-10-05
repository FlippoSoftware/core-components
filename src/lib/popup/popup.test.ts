import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRef } from '~@lib/ref';
import { ComponentStore } from '~@store/ComponentStore';

import { PopupTransitions } from './PopupTransitions';
import { PopupTriggerMap } from './PopupTriggerMap';
import { createInitialPopupStoreState, popupStoreSelectors } from './popupStoreState';
import { ensureImplicitActiveTrigger, PopupTriggerRegistration, registerTrigger } from './popupTriggers';

import type { PopupStoreContext, PopupStoreState } from './popupStoreState';

type State = PopupStoreState<unknown> & { extra: string };

function createStore(overrides: Partial<State> = {}) {
    const context: PopupStoreContext<never> = {
        triggerElements: new PopupTriggerMap(),
        popupRef: createRef<HTMLElement>(),
        onOpenChange: undefined,
        onOpenChangeComplete: undefined
    };
    return new ComponentStore<State, PopupStoreContext<never>, typeof popupStoreSelectors>(
        { ...createInitialPopupStoreState<unknown>(), extra: '', ...overrides },
        context,
        popupStoreSelectors
    );
}

const button = (id: string) => {
    const element = document.createElement('button');
    element.id = id;
    return element;
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('PopupTriggerMap', () => {
    it('tracks elements by id', () => {
        const map = new PopupTriggerMap();
        const a = button('a');
        const b = button('b');

        map.add('a', a);
        map.add('a', a);
        map.add('b', b);
        expect(map.size).toBe(2);
        expect(map.getById('a')).toBe(a);
        expect(map.hasElement(b)).toBe(true);
        expect(map.hasMatchingElement((el) => el.id === 'b')).toBe(true);
        expect(map.hasMatchingElement((el) => el.id === 'c')).toBe(false);
        expect([...map.elements()]).toEqual([a, b]);
        expect([...map.entries()].map(([id]) => id)).toEqual(['a', 'b']);

        const replacement = button('a2');
        map.add('a', replacement);
        expect(map.hasElement(a)).toBe(false);
        expect(map.getById('a')).toBe(replacement);

        map.delete('a');
        map.delete('missing');
        expect(map.size).toBe(1);
    });

    it('rejects an element registered under two ids', () => {
        const map = new PopupTriggerMap();
        const a = button('a');
        map.add('a', a);
        expect(() => map.add('b', a)).toThrow('multiple IDs');
    });
});

describe('popupStoreSelectors', () => {
    it('prefers external props', () => {
        const store = createStore({ open: false, activeTriggerId: 'inner' });
        expect(store.select('open')).toBe(false);
        expect(store.select('activeTriggerId')).toBe('inner');

        store.update({ openProp: true, triggerIdProp: 'outer' } as Partial<State>);
        expect(store.select('open')).toBe(true);
        expect(store.select('activeTriggerId')).toBe('outer');
        expect(store.select('isTriggerActive', 'outer')).toBe(true);
        expect(store.select('isTriggerActive', undefined)).toBe(false);
    });

    it('derives trigger state', () => {
        const trigger = button('t');
        const store = createStore({ open: true, mounted: true, activeTriggerId: 't', activeTriggerElement: trigger });
        expect(store.select('isOpenedByTrigger', 't')).toBe(true);
        expect(store.select('isMountedByTrigger', 't')).toBe(true);
        expect(store.select('activeTriggerElement')).toBe(trigger);

        store.set('mounted', false);
        expect(store.select('activeTriggerElement')).toBeNull();
        expect(store.select('isMountedByTrigger', 't')).toBe(false);
    });

    it('returns trigger props by activity', () => {
        const active = { 'aria-expanded': true };
        const inactive = { 'aria-expanded': false };
        const store = createStore({ activeTriggerProps: active, inactiveTriggerProps: inactive });
        expect(store.select('triggerProps', true)).toBe(active);
        expect(store.select('triggerProps', false)).toBe(inactive);
        expect(store.select('popupProps')).toEqual({});
        expect(store.select('primaryTriggerId')).toBeNull();
        expect(store.select('payload')).toBeUndefined();
        expect(store.select('transitionStatus')).toBe('idle');
        expect(store.select('preventUnmountingOnClose')).toBe(false);
        expect(store.select('popupElement')).toBeNull();
        expect(store.select('positionerElement')).toBeNull();
        expect(store.select('floatingRootContext').state.open).toBe(false);
    });
});

describe('registerTrigger', () => {
    it('registers and unregisters an element', () => {
        const store = createStore();
        const element = button('a');
        const unregister = registerTrigger(store, 'a', element);
        expect(store.context.triggerElements.getById('a')).toBe(element);
        unregister();
        expect(store.context.triggerElements.size).toBe(0);
    });
});

describe('PopupTriggerRegistration', () => {
    it('registers the element and follows id changes', () => {
        const store = createStore();
        const registration = new PopupTriggerRegistration(store, 'a');
        const element = button('a');

        registration.setElement(element);
        expect(store.context.triggerElements.getById('a')).toBe(element);

        registration.setOptions('b');
        expect(store.context.triggerElements.getById('a')).toBeUndefined();
        expect(store.context.triggerElements.getById('b')).toBe(element);

        registration.setElement(null);
        expect(store.context.triggerElements.size).toBe(0);

        registration.setElement(element);
        registration.destroy();
        expect(store.context.triggerElements.size).toBe(0);
    });

    it('ignores triggers without an id', () => {
        const store = createStore();
        new PopupTriggerRegistration(store, undefined).setElement(button('x'));
        expect(store.context.triggerElements.size).toBe(0);
    });

    it('becomes the active trigger of an open popup without one', () => {
        const store = createStore({ open: true });
        const element = button('a');
        new PopupTriggerRegistration(store, 'a', { extra: 'from-a' }).setElement(element);
        expect(store.state).toMatchObject({ activeTriggerId: 'a', activeTriggerElement: element, extra: 'from-a' });

        const other = button('b');
        new PopupTriggerRegistration(store, 'b', { extra: 'from-b' }).setElement(other);
        expect(store.state.activeTriggerId).toBe('a');
        expect(store.state.extra).toBe('from-a');
    });

    it('updates the element of the already active trigger', () => {
        const store = createStore({ open: true, activeTriggerId: 'a' });
        const element = button('a');
        new PopupTriggerRegistration(store, 'a', { extra: 'x' }).setElement(element);
        expect(store.state.activeTriggerElement).toBe(element);
        expect(store.state.extra).toBe('x');
    });

    it('forwards data while it mounted the popup', () => {
        const store = createStore({ mounted: true, activeTriggerId: 'a' });
        const registration = new PopupTriggerRegistration(store, 'a');
        const element = button('a');
        registration.setElement(element);
        expect(registration.isMountedByThisTrigger()).toBe(true);

        registration.setOptions('a', { extra: 'synced' });
        registration.sync();
        expect(store.state.activeTriggerElement).toBe(element);
        expect(store.state.extra).toBe('synced');

        store.set('mounted', false);
        registration.setOptions('a', { extra: 'ignored' });
        registration.sync();
        expect(store.state.extra).toBe('synced');
    });
});

describe('ensureImplicitActiveTrigger', () => {
    it('does nothing when closed or when a trigger is active', () => {
        const store = createStore();
        store.context.triggerElements.add('a', button('a'));
        ensureImplicitActiveTrigger(store);
        expect(store.state.activeTriggerId).toBeNull();

        store.update({ open: true, activeTriggerId: 'z' });
        ensureImplicitActiveTrigger(store);
        expect(store.state.activeTriggerId).toBe('z');
    });

    it('prefers the primary trigger', () => {
        const store = createStore({ open: true, primaryTriggerId: 'b' });
        const b = button('b');
        store.context.triggerElements.add('a', button('a'));
        store.context.triggerElements.add('b', b);
        ensureImplicitActiveTrigger(store);
        expect(store.state).toMatchObject({ activeTriggerId: 'b', activeTriggerElement: b });
    });

    it('falls back to the only trigger', () => {
        const store = createStore({ primaryTriggerId: 'missing' });
        const a = button('a');
        store.context.triggerElements.add('a', a);
        ensureImplicitActiveTrigger(store, true);
        expect(store.state).toMatchObject({ activeTriggerId: 'a', activeTriggerElement: a });
    });

    it('does not guess between several triggers', () => {
        const store = createStore({ open: true });
        store.context.triggerElements.add('a', button('a'));
        store.context.triggerElements.add('b', button('b'));
        ensureImplicitActiveTrigger(store);
        expect(store.state.activeTriggerId).toBeNull();
    });
});

describe('PopupTransitions', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = undefined;
    });

    it('mounts with a starting status and clears it on the next frame', async () => {
        const store = createStore();
        const transitions = new PopupTransitions(store);
        const stop = transitions.start();

        store.set('open', true);
        expect(store.state).toMatchObject({ mounted: true, transitionStatus: 'starting' });

        await nextFrame();
        await nextFrame();
        expect(store.state.transitionStatus).toBeUndefined();
        stop();
    });

    it('unmounts after exit animations and reports completion', async () => {
        const onOpenChangeComplete = vi.fn();
        const onUnmount = vi.fn();
        const store = createStore({ open: true, mounted: true, activeTriggerId: 't' });
        store.setContextValue('onOpenChangeComplete', onOpenChangeComplete);
        store.context.popupRef.current = document.createElement('div');

        const transitions = new PopupTransitions(store, { onUnmount });
        transitions.start();
        const statuses: unknown[] = [];
        store.subscribe((state) => statuses.push(state.transitionStatus));

        store.set('open', false);
        expect(statuses).toContain('ending');

        await nextFrame();
        await nextFrame();
        expect(store.state).toMatchObject({ mounted: false, activeTriggerId: null, transitionStatus: undefined });
        expect(onUnmount).toHaveBeenCalledTimes(1);
        expect(onOpenChangeComplete).toHaveBeenCalledWith(false);
        transitions.destroy();
    });

    it('keeps the popup mounted when unmounting is prevented', async () => {
        const store = createStore({ open: true, mounted: true, preventUnmountingOnClose: true });
        store.context.popupRef.current = document.createElement('div');
        const transitions = new PopupTransitions(store);
        transitions.start();

        store.set('open', false);
        await nextFrame();
        await nextFrame();
        expect(store.state.mounted).toBe(true);
        expect(store.state.transitionStatus).toBe('ending');

        transitions.forceUnmount();
        expect(store.state.mounted).toBe(false);
    });

    it('clears a stale ending status and follows an external open state', () => {
        const store = createStore({ transitionStatus: 'ending' });
        let externalOpen = false;
        const transitions = new PopupTransitions(store);
        transitions.setOptions({});
        transitions.start(() => externalOpen);
        expect(store.state.transitionStatus).toBeUndefined();

        externalOpen = true;
        store.notifyAll();
        expect(store.state.mounted).toBe(true);
        transitions.destroy();
    });
});
