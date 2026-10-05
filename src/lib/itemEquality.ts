export type ItemEqualityComparer<Item = unknown, Value = Item> = (item: Item, value: Value) => boolean;

export const defaultItemEquality: ItemEqualityComparer = (item, value) => Object.is(item, value);

export function compareItemEquality<Item, Value>(item: Item, value: Value, comparer: ItemEqualityComparer<Item, Value>): boolean {
    if (item == null || value == null) {
        return Object.is(item, value);
    }
    return comparer(item, value);
}

export function itemIncludes<Item, Value>(
    collection: readonly Item[] | undefined | null,
    value: Value,
    comparer: ItemEqualityComparer<Item, Value>
): boolean {
    if (!collection || collection.length === 0) {
        return false;
    }
    return collection.some((item) => {
        if (item === undefined) {
            return false;
        }
        return compareItemEquality(item, value, comparer);
    });
}

export function findItemIndex<Item, Value>(
    collection: readonly Item[] | undefined | null,
    value: Value,
    comparer: ItemEqualityComparer<Item, Value>
): number {
    if (!collection || collection.length === 0) {
        return -1;
    }
    return collection.findIndex((item) => {
        if (item === undefined) {
            return false;
        }
        return compareItemEquality(item, value, comparer);
    });
}

export function removeItem<Item, Value>(collection: readonly Item[], value: Value, comparer: ItemEqualityComparer<Item, Value>): Item[] {
    return collection.filter((item) => !compareItemEquality(item, value, comparer));
}

export function selectedValueIncludes<Item, Value>(
    selectedValues: readonly Item[] | undefined | null,
    itemValue: Value,
    comparer: ItemEqualityComparer<Value, Item>
): boolean {
    if (!selectedValues || selectedValues.length === 0) {
        return false;
    }
    return selectedValues.some((selectedValue) => {
        if (selectedValue === undefined) {
            return false;
        }
        return compareItemEquality(itemValue, selectedValue, comparer);
    });
}
