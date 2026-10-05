import { stringifyAsLabel } from '~@lib/valueLabel';

export type FilterOptions = {
    locale?: Intl.LocalesArgument;
} & Intl.CollatorOptions;

export type Filter = {
    contains: <Item>(item: Item, query: string, itemToString?: (item: Item) => string) => boolean;
    startsWith: <Item>(item: Item, query: string, itemToString?: (item: Item) => string) => boolean;
    endsWith: <Item>(item: Item, query: string, itemToString?: (item: Item) => string) => boolean;
};

const filterCache = new Map<string, Filter>();

function stringifyLocale(locale?: Intl.LocalesArgument): string {
    if (Array.isArray(locale)) {
        return locale.map((value) => stringifyLocale(value)).join(',');
    }
    if (locale == null) {
        return '';
    }
    return String(locale);
}

/**
 * Locale-aware matching (`Intl.Collator`, accent- and case-insensitive by default), cached per options.
 * Replacement for `useCoreFilter`.
 */
export function createFilter(options: FilterOptions = {}): Filter {
    const mergedOptions: Intl.CollatorOptions = {
        usage: 'search',
        sensitivity: 'base',
        ignorePunctuation: true,
        ...options
    };
    const cacheKey = `${stringifyLocale(options.locale)}|${JSON.stringify(mergedOptions)}`;
    const cachedFilter = filterCache.get(cacheKey);
    if (cachedFilter) {
        return cachedFilter;
    }

    const collator = new Intl.Collator(options.locale, mergedOptions);
    const filter: Filter = {
        contains(item, query, itemToString) {
            if (!query) {
                return true;
            }
            const itemString = stringifyAsLabel(item, itemToString as (item: unknown) => string);
            for (let i = 0; i <= itemString.length - query.length; i += 1) {
                if (collator.compare(itemString.slice(i, i + query.length), query) === 0) {
                    return true;
                }
            }
            return false;
        },
        startsWith(item, query, itemToString) {
            if (!query) {
                return true;
            }
            const itemString = stringifyAsLabel(item, itemToString as (item: unknown) => string);
            return collator.compare(itemString.slice(0, query.length), query) === 0;
        },
        endsWith(item, query, itemToString) {
            if (!query) {
                return true;
            }
            const itemString = stringifyAsLabel(item, itemToString as (item: unknown) => string);
            const queryLength = query.length;
            return itemString.length >= queryLength && collator.compare(itemString.slice(itemString.length - queryLength), query) === 0;
        }
    };

    filterCache.set(cacheKey, filter);
    return filter;
}

export function createCollatorItemFilter(collatorFilter: Filter, itemToStringLabel?: (item: unknown) => string) {
    return (item: unknown, query: string) => {
        if (item == null) {
            return false;
        }
        return collatorFilter.contains(stringifyAsLabel(item, itemToStringLabel), query);
    };
}

/**
 * Like {@link createCollatorItemFilter}, but every item matches while the query equals the selected label
 * (so reopening a single-selection combobox shows all items).
 */
export function createSingleSelectionCollatorFilter(
    collatorFilter: Filter,
    itemToStringLabel?: (item: unknown) => string,
    selectedValue?: unknown
) {
    return (item: unknown, query: string) => {
        if (item == null) {
            return false;
        }
        if (!query) {
            return true;
        }
        const itemString = stringifyAsLabel(item, itemToStringLabel);
        const selectedString = selectedValue != null ? stringifyAsLabel(selectedValue, itemToStringLabel) : '';
        if (selectedString && collatorFilter.contains(selectedString, query) && selectedString.length === query.length) {
            return true;
        }
        return collatorFilter.contains(itemString, query);
    };
}

export type ComboboxFilterOptions = {
    multiple?: boolean | undefined;
    value?: unknown;
} & FilterOptions;

/**
 * The filter `Combobox` uses by default, for custom filtering. Replacement for `useComboboxFilter`.
 */
export function createComboboxFilter(options: ComboboxFilterOptions = {}): Filter {
    const { multiple = false, value, ...collatorOptions } = options;
    const coreFilter = createFilter(collatorOptions);
    return {
        contains: (item, query, itemToString) =>
            multiple
                ? createCollatorItemFilter(coreFilter, itemToString as (item: unknown) => string)(item, query)
                : createSingleSelectionCollatorFilter(coreFilter, itemToString as (item: unknown) => string, value)(item, query),
        startsWith: coreFilter.startsWith,
        endsWith: coreFilter.endsWith
    };
}
