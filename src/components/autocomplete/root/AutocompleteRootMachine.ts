import { ComboboxRootMachine } from '~@components/combobox/root/ComboboxRootMachine';
import { createFilter } from '~@components/combobox/utils/comboboxFilter';
import { REASONS } from '~@events/reasons';
import { stringifyAsLabel } from '~@lib/valueLabel';
import { Store } from '~@store/Store';

import type { ComboboxItemFilter, ComboboxRootOptions, ComboboxRootSetup } from '~@components/combobox/root/ComboboxRootMachine';
import type { ComboboxChangeEventDetails, ComboboxHighlightEventDetails } from '~@components/combobox/store/ComboboxStore';

export type AutocompleteMode = 'list' | 'both' | 'inline' | 'none';

export type AutocompleteRootOptions = Omit<
    ComboboxRootOptions,
    | 'selectionMode'
    | 'selectedValue'
    | 'defaultSelectedValue'
    | 'onSelectedValueChange'
    | 'fillInputOnItemPress'
    | 'isItemEqualToValue'
    | 'inputValue'
    | 'defaultInputValue'
    | 'onInputValueChange'
    | 'autoComplete'
> & {
    /**
     * @default 'list'
     */
    mode?: AutocompleteMode | undefined;
    value?: string | undefined;
    defaultValue?: string | undefined;
    onValueChange?: ((value: string, eventDetails: ComboboxChangeEventDetails) => void) | undefined;
};

/**
 * State machine of `Autocomplete.Root`: a combobox without selection whose input value is the value,
 * with optional inline completion of the highlighted item (`mode: 'inline' | 'both'`).
 */
export class AutocompleteRootMachine {
    readonly combobox: ComboboxRootMachine;

    private options: AutocompleteRootOptions;

    private readonly internal: Store<{ internalValue: string; inlineInputValue: string }>;

    private previousControlledValue: string | undefined;

    constructor(options: AutocompleteRootOptions, setup: ComboboxRootSetup) {
        this.options = options;
        this.internal = new Store({ internalValue: options.defaultValue ?? '', inlineInputValue: '' });
        this.previousControlledValue = options.value;
        this.combobox = new ComboboxRootMachine(this.getComboboxOptions(), setup);
        this.internal.subscribe(() => this.combobox.setOptions(this.getComboboxOptions()));
    }

    get store() {
        return this.combobox.store;
    }

    setOptions(options: AutocompleteRootOptions) {
        this.options = options;
        if (options.value !== undefined && options.value !== this.previousControlledValue) {
            this.internal.set('inlineInputValue', '');
        }
        this.previousControlledValue = options.value;
        this.combobox.setOptions(this.getComboboxOptions());
    }

    /**
     * The value shown by `Autocomplete.Value`.
     */
    getValue(): string {
        return this.combobox.inputValue.state.inputValue;
    }

    destroy() {
        this.combobox.destroy();
    }

    private get isControlled() {
        return this.options.value !== undefined;
    }

    private getComboboxOptions(): ComboboxRootOptions {
        const { mode = 'list', value, defaultValue, onValueChange, itemToStringValue, openOnInputClick = false, ...other } = this.options;
        const enableInline = mode === 'inline' || mode === 'both';
        const staticItems = mode === 'inline' || mode === 'none';
        const { internalValue, inlineInputValue } = this.internal.state;

        // The inline completion takes precedence over the typed value.
        let resolvedInputValue: string;
        if (enableInline && inlineInputValue !== '') {
            resolvedInputValue = inlineInputValue;
        } else if (this.isControlled) {
            resolvedInputValue = value ?? '';
        } else {
            resolvedInputValue = internalValue;
        }

        const resolvedQuery = String(this.isControlled ? value : internalValue).trim();
        const baseFilter: ComboboxItemFilter =
            other.filter ?? ((item, query, toString) => createFilter().contains(stringifyAsLabel(item, toString), query));

        let resolvedFilter: ComboboxItemFilter | null | undefined;
        if (mode === 'both') {
            // Filter by the typed value only, ignoring the inline completion.
            resolvedFilter = (item, _query, toString) => baseFilter(item, resolvedQuery, toString);
        } else {
            resolvedFilter = staticItems ? null : other.filter;
        }

        return {
            ...other,
            itemToStringLabel: itemToStringValue,
            itemToStringValue,
            openOnInputClick,
            selectionMode: 'none',
            fillInputOnItemPress: true,
            filter: resolvedFilter,
            autoComplete: mode,
            inputValue: resolvedInputValue,
            defaultInputValue: defaultValue,
            onInputValueChange: (nextValue: string, eventDetails: ComboboxChangeEventDetails) => {
                const updates: Partial<{ internalValue: string; inlineInputValue: string }> = { inlineInputValue: '' };
                if (!this.isControlled) {
                    updates.internalValue = nextValue;
                }
                onValueChange?.(nextValue, eventDetails);
                this.internal.update(updates);
            },
            onItemHighlighted: (highlightedValue: unknown, eventDetails: ComboboxHighlightEventDetails) => {
                this.options.onItemHighlighted?.(highlightedValue, eventDetails);
                if (eventDetails.reason === REASONS.pointer) {
                    return;
                }
                const inline = enableInline && highlightedValue != null ? stringifyAsLabel(highlightedValue, itemToStringValue) : '';
                this.internal.set('inlineInputValue', inline);
            }
        };
    }
}
