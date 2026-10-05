import { describe, expect, it, vi } from 'vitest';

import { compareItemEquality, defaultItemEquality, findItemIndex, itemIncludes, removeItem, selectedValueIncludes } from './itemEquality';
import { NOOP } from './noop';
import { createRef } from './ref';
import { serializeValue } from './serializeValue';
import { hasNullItemLabel, isGroupedItems, resolveSelectedLabel, stringifyAsLabel, stringifyAsValue } from './valueLabel';
import { warn } from './warn';

const byId = (a: { id: number } | null, b: { id: number } | null) => a?.id === b?.id;

describe('itemEquality', () => {
    it('compares with nullish guards', () => {
        expect(compareItemEquality(null, null, byId)).toBe(true);
        expect(compareItemEquality({ id: 1 }, null, byId)).toBe(false);
        expect(compareItemEquality({ id: 1 }, { id: 1 }, byId)).toBe(true);
        expect(defaultItemEquality(1, 1)).toBe(true);
    });

    it('searches collections', () => {
        const items = [{ id: 1 }, undefined, { id: 2 }] as { id: number }[];
        expect(itemIncludes(items, { id: 2 }, byId)).toBe(true);
        expect(itemIncludes([], { id: 2 }, byId)).toBe(false);
        expect(findItemIndex(items, { id: 2 }, byId)).toBe(2);
        expect(findItemIndex(null, { id: 2 }, byId)).toBe(-1);
        expect(removeItem([{ id: 1 }, { id: 2 }], { id: 1 }, byId)).toEqual([{ id: 2 }]);
        expect(selectedValueIncludes(items, { id: 1 }, byId)).toBe(true);
        expect(selectedValueIncludes(undefined, { id: 1 }, byId)).toBe(false);
    });
});

describe('valueLabel', () => {
    const items = [
        { value: null, label: 'None' },
        { value: 'a', label: 'Apple' },
        { value: 'b', label: 'Banana' }
    ];

    it('serializes values', () => {
        expect(serializeValue(null)).toBe('');
        expect(serializeValue('x')).toBe('x');
        expect(serializeValue({ a: 1 })).toBe('{"a":1}');
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(serializeValue(circular)).toBe('[object Object]');
    });

    it('stringifies labels and values', () => {
        expect(stringifyAsLabel({ id: 1 }, (item) => `#${(item as { id: number }).id}`)).toBe('#1');
        expect(stringifyAsLabel({ label: 'L', value: 'v' })).toBe('L');
        expect(stringifyAsLabel({ value: 'v' })).toBe('v');
        expect(stringifyAsLabel(5)).toBe('5');
        expect(stringifyAsValue({ label: 'L', value: 'v' })).toBe('v');
        expect(stringifyAsValue('v', (item) => `${item}!`)).toBe('v!');
        expect(stringifyAsValue(3)).toBe('3');
    });

    it('detects grouped items', () => {
        expect(isGroupedItems([{ value: 'g', items: [] }])).toBe(true);
        expect(isGroupedItems(items)).toBe(false);
        expect(isGroupedItems(undefined)).toBe(false);
    });

    it('resolves the selected label', () => {
        expect(resolveSelectedLabel('a', items)).toBe('Apple');
        expect(resolveSelectedLabel(null, items)).toBe('None');
        expect(resolveSelectedLabel(undefined, [{ value: 'a', label: 'A' }])).toBe('');
        expect(resolveSelectedLabel('z', items)).toBe('z');
        expect(resolveSelectedLabel({ value: 'b' }, items)).toBe('Banana');
        expect(resolveSelectedLabel({ value: 'b', label: 'Own' }, items)).toBe('Own');
        expect(resolveSelectedLabel('a', { a: 'From record' })).toBe('From record');
        expect(resolveSelectedLabel('missing', { a: 'From record' })).toBe('missing');
        expect(resolveSelectedLabel('a', items, (item) => `custom ${item}`)).toBe('custom a');
        expect(resolveSelectedLabel('b', [{ value: 'group', items }])).toBe('Banana');
    });

    it('checks for null item labels', () => {
        expect(hasNullItemLabel(items)).toBe(true);
        expect(hasNullItemLabel([{ value: 'a', label: 'A' }])).toBe(false);
        expect(hasNullItemLabel([{ value: 'g', items }])).toBe(true);
        expect(hasNullItemLabel({ a: 'A' })).toBe(true);
        expect(hasNullItemLabel({ null: 'None' })).toBe(false);
        expect(hasNullItemLabel(undefined)).toBe(false);
    });
});

describe('misc', () => {
    it('creates refs', () => {
        expect(createRef().current).toBeNull();
        expect(createRef(1).current).toBe(1);
        expect(NOOP()).toBeUndefined();
    });

    it('warns once per message', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        warn('same', 'message');
        warn('same', 'message');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith('Flippo UI: same message');
        spy.mockRestore();
    });
});
