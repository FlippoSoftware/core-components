import { describe, expect, it, vi } from 'vitest';

import { ComponentStore } from './ComponentStore';
import { createSelector, createSelectorMemoized } from './createSelector';
import { Store } from './Store';

type State = { count: number; label: string; optional: string | undefined };

const initial = (): State => ({ count: 0, label: 'a', optional: undefined });

describe('Store', () => {
    it('notifies listeners on changes only', () => {
        const store = new Store(initial());
        const listener = vi.fn();
        store.subscribe(listener);

        store.set('count', 0);
        store.update({ count: 0 });
        expect(listener).not.toHaveBeenCalled();

        store.set('count', 1);
        store.update({ label: 'b' });
        expect(listener).toHaveBeenCalledTimes(2);
        expect(store.getSnapshot()).toEqual({ count: 1, label: 'b', optional: undefined });
    });

    it('unsubscribes and notifies everyone on notifyAll', () => {
        const store = new Store(initial());
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        const before = store.state;

        store.notifyAll();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(store.state).not.toBe(before);

        unsubscribe();
        store.set('count', 2);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops notifying stale listeners after a recursive update', () => {
        const store = new Store(initial());
        const seen: number[] = [];
        store.subscribe((state) => {
            if (state.count === 1) {
                store.set('count', 2);
            }
        });
        store.subscribe((state) => seen.push(state.count));

        store.set('count', 1);
        expect(seen).toEqual([2]);
    });
});

const selectors = {
    count: createSelector((state: State) => state.count),
    doubled: createSelector(
        (state: State) => state.count,
        (count) => count * 2
    ),
    plus: createSelector((state: State, amount: number) => state.count + amount)
};

describe('ComponentStore', () => {
    const create = () => new ComponentStore<State, { onChange?: (() => void) | undefined }, typeof selectors>(initial(), {}, selectors);

    it('selects with arguments', () => {
        const store = create();
        store.set('count', 3);
        expect(store.select('count')).toBe(3);
        expect(store.select('doubled')).toBe(6);
        expect(store.select('plus', 2)).toBe(5);
        expect(store.getSelector('plus')(store.state, 1)).toBe(4);
    });

    it('throws for unknown selectors', () => {
        const store = new ComponentStore<State>(initial());
        expect(() => store.getSelector('missing' as never)).toThrow('selector "missing"');
    });

    it('observes derived values', () => {
        const store = create();
        const listener = vi.fn();
        const stop = store.observe('doubled', listener);
        expect(listener).toHaveBeenLastCalledWith(0, 0, store);

        store.set('label', 'b');
        expect(listener).toHaveBeenCalledTimes(1);

        store.set('count', 2);
        expect(listener).toHaveBeenLastCalledWith(4, 0, store);

        stop();
        store.set('count', 5);
        expect(listener).toHaveBeenCalledTimes(2);

        const fnListener = vi.fn();
        store.observe((state) => state.label, fnListener);
        store.set('label', 'c');
        expect(fnListener).toHaveBeenLastCalledWith('c', 'b', store);
    });

    it('syncs controlled values and warns when switching modes', () => {
        const store = create();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        store.syncControlledValue('count', undefined);
        expect(store.isControlled('count')).toBe(false);
        store.set('count', 4);
        expect(store.state.count).toBe(4);

        store.syncControlledValue('count', 10);
        expect(store.state.count).toBe(10);
        expect(store.isControlled('count')).toBe(true);
        expect(error).toHaveBeenCalledTimes(1);

        error.mockRestore();
    });

    it('syncs plain values and cleans them up', () => {
        const store = create();
        store.syncValue('label', 'x');
        store.syncValues({ count: 7 });
        expect(store.state).toMatchObject({ label: 'x', count: 7 });

        const cleanup = store.syncValueWithCleanup('optional', 'set');
        expect(store.state.optional).toBe('set');
        cleanup();
        expect(store.state.optional).toBeUndefined();
    });

    it('updates the context and creates setters', () => {
        const store = create();
        const onChange = vi.fn();
        store.setContextValue('onChange', onChange);
        store.context.onChange?.();
        expect(onChange).toHaveBeenCalled();

        store.createSetter('label')('z');
        expect(store.state.label).toBe('z');
    });
});

describe('createSelector', () => {
    it('combines up to six selectors', () => {
        const s = (state: State) => state.count;
        const sum = createSelector(s, s, s, s, s, (a: number, b: number, c: number, d: number, e: number) => a + b + c + d + e);
        const sum4 = createSelector(s, s, s, s, (a: number, b: number, c: number, d: number) => a + b + c + d);
        const sum3 = createSelector(s, s, s, (a: number, b: number, c: number) => a + b + c);
        const sum2 = createSelector(s, s, (a: number, b: number) => a + b);
        const state = { ...initial(), count: 1 };
        expect(sum(state)).toBe(5);
        expect(sum4(state)).toBe(4);
        expect(sum3(state)).toBe(3);
        expect(sum2(state)).toBe(2);
    });

    it('rejects invalid arguments', () => {
        const create = createSelector as unknown as (...args: unknown[]) => unknown;
        const s = () => 1;
        expect(() => create()).toThrow('Missing arguments');
        expect(() => create(s, s, s, s, s, s, s)).toThrow('Unsupported number of selectors');
    });
});

describe('createSelectorMemoized', () => {
    it('recomputes only when inputs change', () => {
        const combiner = vi.fn((count: number, label: string) => ({ count, label }));
        const selector = createSelectorMemoized(
            (state: State) => state.count,
            (state: State) => state.label,
            combiner
        );
        const store = new Store(initial());

        const first = selector(store.state);
        store.set('optional', 'unrelated');
        expect(selector(store.state)).toBe(first);
        expect(combiner).toHaveBeenCalledTimes(1);

        store.set('count', 1);
        expect(selector(store.state)).not.toBe(first);
        expect(combiner).toHaveBeenCalledTimes(2);
    });

    it('memoizes per store and per argument', () => {
        const combiner = vi.fn((count: number, amount: number) => [count + amount]);
        const selector = createSelectorMemoized((state: State) => state.count, combiner);
        const a = new Store(initial());
        const b = new Store({ ...initial(), count: 5 });

        const fromA = selector(a.state, 1);
        const fromB = selector(b.state, 1);
        expect(selector(a.state, 1)).toBe(fromA);
        expect(selector(b.state, 1)).toBe(fromB);
        expect(selector(a.state, 2)).toEqual([2]);
        expect(combiner).toHaveBeenCalledTimes(3);
    });

    it('rejects combiners with more than three extra arguments', () => {
        const create = createSelectorMemoized as unknown as (...args: unknown[]) => unknown;
        expect(() =>
            create(
                (state: State) => state,
                (_s: State, _a: number, _b: number, _c: number, _d: number) => 0
            )
        ).toThrow('Unsupported number of arguments');
    });
});
