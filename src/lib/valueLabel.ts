import { serializeValue } from './serializeValue';

/**
 * An item with a value and a label. The label type is up to the adapter (e.g. `React.ReactNode`).
 */
export type LabeledItem<Label = unknown> = {
    value: unknown;
    label: Label;
};

export type Group<Item = unknown> = {
    value: unknown;
    items: Item[];
};

export type ItemRecord<Label = unknown> = Record<string, Label>;

export type ItemsInput<Label = unknown> =
    | ItemRecord<Label>
    | readonly LabeledItem<Label>[]
    | readonly Group<LabeledItem<Label>>[]
    | undefined;

type ToString = (item: unknown) => string;

export function isGroupedItems<Item>(items: ReadonlyArray<Item | Group<Item>> | undefined): items is Group<Item>[] {
    return items != null && items.length > 0 && typeof items[0] === 'object' && items[0] != null && 'items' in (items[0] as object);
}

export function stringifyAsLabel(item: unknown, itemToStringLabel?: ToString): string {
    if (itemToStringLabel && item != null) {
        return itemToStringLabel(item) ?? '';
    }
    if (item && typeof item === 'object') {
        if ('label' in item && item.label != null) {
            return String(item.label);
        }
        if ('value' in item) {
            return String(item.value);
        }
    }
    return serializeValue(item);
}

export function stringifyAsValue(item: unknown, itemToStringValue?: ToString): string {
    if (itemToStringValue && item != null) {
        return itemToStringValue(item) ?? '';
    }
    if (item && typeof item === 'object' && 'value' in item && 'label' in item) {
        return serializeValue(item.value);
    }
    return serializeValue(item);
}

function flattenItems<Label>(items: readonly LabeledItem<Label>[] | readonly Group<LabeledItem<Label>>[]): LabeledItem<Label>[] {
    return isGroupedItems<LabeledItem<Label>>(items)
        ? (items as Group<LabeledItem<Label>>[]).flatMap((group) => group.items)
        : (items as LabeledItem<Label>[]);
}

/**
 * Resolves the label of the selected value from `items`.
 */
export function resolveSelectedLabel<Label>(value: unknown, items: ItemsInput<Label>, itemToStringLabel?: ToString): Label | string {
    if (itemToStringLabel && value != null) {
        return itemToStringLabel(value);
    }

    // Custom object with explicit label takes precedence
    if (value && typeof value === 'object' && 'label' in value && value.label != null) {
        return value.label as Label;
    }

    // Items provided as plain record map
    if (items && !Array.isArray(items)) {
        return (items as ItemRecord<Label>)[value as string] ?? stringifyAsLabel(value, itemToStringLabel);
    }

    // Items provided as array (flat or grouped)
    if (Array.isArray(items)) {
        const flatItems = flattenItems<Label>(items);

        // If no value selected, prefer the null option label when available
        if (value == null) {
            const nullItem = flatItems.find((it) => it.value == null);
            if (nullItem && nullItem.label != null) {
                return nullItem.label;
            }
            return stringifyAsLabel(value, itemToStringLabel);
        }

        // Primitive selected value: map to first matching item's label
        if (typeof value !== 'object') {
            const match = flatItems.find((it) => it && it.value === value);
            if (match && match.label != null) {
                return match.label;
            }
            return stringifyAsLabel(value, itemToStringLabel);
        }

        // Object without explicit label: try matching by its `value` property
        if ('value' in value) {
            const match = flatItems.find((it) => it && it.value === value.value);
            if (match && match.label != null) {
                return match.label;
            }
        }
    }

    return stringifyAsLabel(value, itemToStringLabel);
}

/**
 * Resolves the labels of several selected values (the adapter joins them, e.g. with `', '`).
 */
export function resolveMultipleLabels<Label>(
    values: readonly unknown[],
    items: ItemsInput<Label>,
    itemToStringLabel?: ToString
): (Label | string)[] {
    return values.map((value) => resolveSelectedLabel(value, items, itemToStringLabel));
}

/**
 * Checks if the items array contains an item with a null value that has a non-null label.
 */
export function hasNullItemLabel<Label>(items: ItemsInput<Label>): boolean {
    if (!Array.isArray(items)) {
        return items != null && !('null' in items);
    }

    return flattenItems<Label>(items).some((item) => item && item.value == null && item.label != null);
}
