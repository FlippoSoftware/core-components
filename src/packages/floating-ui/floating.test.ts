import { describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';

import { FloatingRootStore } from './FloatingRootStore';
import { FloatingTreeStore } from './FloatingTreeStore';
import { getEmptyRootContext } from './getEmptyRootContext';

function createRoot(overrides: Partial<ConstructorParameters<typeof FloatingRootStore>[0]> = {}) {
    return new FloatingRootStore({
        open: false,
        referenceElement: null,
        floatingElement: null,
        triggerElements: new PopupTriggerMap(),
        floatingId: 'floating',
        nested: false,
        noEmit: false,
        onOpenChange: undefined,
        ...overrides
    });
}

describe('FloatingRootStore', () => {
    it('derives the reference element from the position reference', () => {
        const reference = document.createElement('button');
        const root = createRoot({ referenceElement: reference });
        expect(root.select('referenceElement')).toBe(reference);
        expect(root.select('domReferenceElement')).toBe(reference);

        const virtual = { getBoundingClientRect: () => new DOMRect() };
        root.set('positionReference', virtual);
        expect(root.select('referenceElement')).toBe(virtual);
        expect(root.select('floatingId')).toBe('floating');
        expect(root.select('open')).toBe(false);
        expect(root.select('floatingElement')).toBeNull();
    });

    it('emits openchange and calls onOpenChange', () => {
        const onOpenChange = vi.fn();
        const root = createRoot({ onOpenChange, nested: true });
        const listener = vi.fn();
        root.context.events.on('openchange', listener);

        const trigger = document.createElement('button');
        const event = new MouseEvent('click');
        const details = createChangeEventDetails(REASONS.triggerPress, event, trigger);
        root.setOpen(true, details);

        expect(root.context.dataRef.current.openEvent).toBe(event);
        expect(listener).toHaveBeenCalledWith({
            open: true,
            reason: 'trigger-press',
            nativeEvent: event,
            nested: true,
            triggerElement: trigger
        });
        expect(onOpenChange).toHaveBeenCalledWith(true, details);

        root.setOpen(false, createChangeEventDetails(REASONS.escapeKey));
        expect(root.context.dataRef.current.openEvent).toBeUndefined();
    });

    it('does not emit when noEmit is set', () => {
        const root = createRoot({ noEmit: true });
        const listener = vi.fn();
        root.context.events.on('openchange', listener);
        root.setOpen(true, createChangeEventDetails(REASONS.none));
        expect(listener).not.toHaveBeenCalled();
    });

    it('creates an empty root context', () => {
        const root = getEmptyRootContext();
        expect(root.state.open).toBe(false);
        expect(root.state.floatingId).toBe('');
    });
});

describe('FloatingTreeStore', () => {
    it('adds and removes nodes', () => {
        const tree = new FloatingTreeStore();
        const node = { id: 'a', parentId: null };
        tree.addNode(node);
        tree.addNode({ id: 'b', parentId: 'a' });
        expect(tree.nodesRef.current).toHaveLength(2);

        tree.removeNode(node);
        tree.removeNode(node);
        expect(tree.nodesRef.current.map((n) => n.id)).toEqual(['b']);
    });
});
