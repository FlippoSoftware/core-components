import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { resolveMultipleLabels, resolveSelectedLabel } from '~@lib/valueLabel';

import { selectSelectors } from '../store/SelectStore';

import type { SelectRootMachine } from '../root/SelectRootMachine';

export type SelectValueState = {
    value: unknown;
    placeholder: boolean;
};

/**
 * `Select.Value`: what to display for the current value.
 */
export const SelectValue = {
    getState(root: SelectRootMachine): SelectValueState {
        const { state } = root.store;
        return { value: state.value, placeholder: !selectSelectors.hasSelectedValue(state) };
    },
    attrs(state: SelectValueState) {
        return getStyleHookProps(state, { value: () => null });
    },
    /**
     * Resolves the displayed content: `null` means the adapter renders `children`/`placeholder` itself.
     * Returns `{ placeholder: true }` when the placeholder should be shown, or the label(s) otherwise.
     */
    resolve(
        root: SelectRootMachine,
        options: { hasChildren: boolean; hasPlaceholder: boolean }
    ): { kind: 'children' } | { kind: 'placeholder' } | { kind: 'labels'; labels: unknown[] } | { kind: 'label'; label: unknown } {
        const { state } = root.store;
        if (options.hasChildren) {
            return { kind: 'children' };
        }
        const hasSelectedValue = selectSelectors.hasSelectedValue(state);
        const hasNullLabel = selectSelectors.hasNullItemLabel(state, !hasSelectedValue && options.hasPlaceholder);
        if (!hasSelectedValue && options.hasPlaceholder && !hasNullLabel) {
            return { kind: 'placeholder' };
        }
        if (Array.isArray(state.value)) {
            return { kind: 'labels', labels: resolveMultipleLabels(state.value, state.items, state.itemToStringLabel) };
        }
        return { kind: 'label', label: resolveSelectedLabel(state.value, state.items, state.itemToStringLabel) };
    },
    setElement(root: SelectRootMachine, element: HTMLElement | null) {
        root.refs.valueRef.current = element;
    }
};
