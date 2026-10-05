import { resolveSelectedLabel } from '~@lib/valueLabel';
import { mergeProps } from '~@props/mergeProps';

import type { TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';

/**
 * Small parts of the combobox.
 */
export const ComboboxParts = {
    /**
     * `Combobox.Empty`: its children are shown only when no items match.
     */
    getEmptyProps(root: ComboboxRootMachine, elementProps: Props = {}): Props {
        return mergeProps({ role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, elementProps);
    },
    isEmpty(root: ComboboxRootMachine): boolean {
        return root.derived.state.filteredItems.length === 0;
    },
    setEmptyElement(root: ComboboxRootMachine, element: HTMLDivElement | null) {
        root.store.state.emptyRef.current = element;
    },
    getStatusProps(elementProps: Props = {}): Props {
        return mergeProps({ role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, elementProps);
    },
    /**
     * `Combobox.Value`: the selected value's label.
     */
    getValueLabel(root: ComboboxRootMachine): unknown {
        const { selectedValue, items, itemToStringLabel } = root.store.state;
        return resolveSelectedLabel(selectedValue, items as never, itemToStringLabel);
    },
    getRowProps(elementProps: Props = {}): Props {
        return mergeProps({ role: 'row' }, elementProps);
    },
    getIconProps(elementProps: Props = {}): Props {
        return mergeProps({ 'aria-hidden': true }, elementProps);
    },
    getBackdropState(root: ComboboxRootMachine): { open: boolean; transitionStatus: TransitionStatus } {
        return { open: root.store.state.open, transitionStatus: root.store.state.transitionStatus };
    },
    getBackdropProps(root: ComboboxRootMachine, elementProps: Props = {}): Props {
        return mergeProps(
            { role: 'presentation', hidden: !root.store.state.mounted, style: { userSelect: 'none', WebkitUserSelect: 'none' } },
            elementProps
        );
    }
};
