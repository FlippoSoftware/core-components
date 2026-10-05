import { describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails, createGenericEventDetails } from './changeEventDetails';
import { createEventEmitter, EventEmitter } from './EventEmitter';
import { REASONS } from './reasons';

describe('createChangeEventDetails', () => {
    it('creates cancelable details', () => {
        const trigger = document.createElement('button');
        const event = new MouseEvent('click');
        const details = createChangeEventDetails(REASONS.triggerPress, event, trigger, { extra: 1 });

        expect(details).toMatchObject({ reason: 'trigger-press', event, trigger, extra: 1 });
        expect(details.isCanceled).toBe(false);
        expect(details.isPropagationAllowed).toBe(false);

        details.cancel();
        details.allowPropagation();
        expect(details.isCanceled).toBe(true);
        expect(details.isPropagationAllowed).toBe(true);
    });

    it('creates a placeholder event when none is given', () => {
        const details = createChangeEventDetails(REASONS.none);
        expect(details.event).toBeInstanceOf(Event);
        expect(details.event.type).toBe('base-ui');
        expect(details.trigger).toBeUndefined();
    });

    it('creates generic details', () => {
        const details = createGenericEventDetails('keyboard', undefined, { index: 2 });
        expect(details).toMatchObject({ reason: 'keyboard', index: 2 });
        expect(details.event.type).toBe('base-ui');
        expect(createGenericEventDetails(REASONS.none).reason).toBe('none');
    });
});

describe('EventEmitter', () => {
    it('emits to listeners until they are removed', () => {
        const emitter = new EventEmitter<{ change: number; other: string }>();
        const listener = vi.fn();
        const off = emitter.on('change', listener);

        emitter.emit('change', 1);
        off();
        emitter.emit('change', 2);
        emitter.emit('other', 'nobody listens');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(1);
    });

    it('supports once and removeAllListeners', () => {
        const emitter = new EventEmitter<{ a: number; b: number }>();
        const once = vi.fn();
        const a = vi.fn();
        const b = vi.fn();

        emitter.once('a', once);
        emitter.emit('a', 1);
        emitter.emit('a', 2);
        expect(once).toHaveBeenCalledTimes(1);

        emitter.on('a', a);
        emitter.on('b', b);
        emitter.removeAllListeners('a');
        emitter.emit('a', 3);
        emitter.emit('b', 3);
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledTimes(1);

        emitter.removeAllListeners();
        emitter.emit('b', 4);
        expect(b).toHaveBeenCalledTimes(1);
    });
});

describe('createEventEmitter', () => {
    it('emits loosely typed floating events', () => {
        const events = createEventEmitter();
        const listener = vi.fn();
        events.on('openchange', listener);
        events.on('openchange', listener);
        events.emit('openchange', { open: true });
        events.emit('unknown');
        events.off('openchange', listener);
        events.emit('openchange', { open: false });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ open: true });
    });
});
