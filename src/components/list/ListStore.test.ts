import { describe, expect, it } from 'vitest';

import { ListStore } from './store/ListStore';

describe('ListStore', () => {
    it('exposes list state', () => {
        const elementsRef = { current: [] };
        const store = ListStore.create({
            nested: false,
            nestedListNumber: 0,
            orientation: 'vertical',
            type: 'unordered',
            virtualized: false,
            elementsRef
        });

        store.update({ nested: true, nestedListNumber: 2 });
        expect(store.select('nested')).toBe(true);
        expect(store.select('nestedListNumber')).toBe(2);
        expect(store.select('orientation')).toBe('vertical');
        expect(store.select('type')).toBe('unordered');
        expect(store.select('virtualized')).toBe(false);
        expect(store.select('elementsRef')).toBe(elementsRef);
    });
});
