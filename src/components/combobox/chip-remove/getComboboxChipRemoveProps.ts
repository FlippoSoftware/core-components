import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { findItemIndex } from '~@lib/itemEquality';
import { getNativeEvent, stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { ButtonMachine } from '~@components/button/root/ButtonMachine';
import type { Props } from '~@props/mergeProps';

import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';
import type { AnyEvent } from '../utils/AnyEvent';

/**
 * Props of `Combobox.ChipRemove` for the chip at `index`.
 */
export function getComboboxChipRemoveProps(
    root: ComboboxRootMachine,
    index: number,
    button: ButtonMachine,
    elementProps: Props = {}
): Props {
    const { store } = root;

    const remove = (event: MouseEvent | KeyboardEvent, stop: () => void) => {
        const { activeIndex, selectedValue, valuesRef, isItemEqualToValue, keyboardActiveRef } = store.state;
        const values = selectedValue as unknown[];
        const eventDetails = createChangeEventDetails(REASONS.chipRemovePress, event);
        // Clear the highlight if the removed chip was the active item (only if it's visible).
        const removedIndex = findItemIndex(valuesRef.current, values[index], isItemEqualToValue);
        if (removedIndex !== -1 && activeIndex === removedIndex) {
            store.state.setIndices({ activeIndex: null, type: keyboardActiveRef.current ? 'pointer' : 'keyboard' });
        }
        store.state.setSelectedValue(
            values.filter((_, i) => i !== index),
            eventDetails
        );
        if (!eventDetails.isPropagationAllowed) {
            stop();
        }
        store.state.inputRef.current?.focus();
    };

    return mergeProps(
        {
            tabIndex: -1,
            disabled: store.state.disabled,
            'aria-readonly': store.state.readOnly || undefined,
            onClick: (event: AnyEvent) => {
                if (store.state.disabled || store.state.readOnly) {
                    return;
                }
                const nativeEvent = getNativeEvent(event as MouseEvent);
                remove(nativeEvent, () => (event as Event).stopPropagation());
            },
            onKeyDown: (event: KeyboardEvent) => {
                if (store.state.disabled || store.state.readOnly || (event.key !== 'Enter' && event.key !== ' ')) {
                    return;
                }
                remove(getNativeEvent(event), () => stopEvent(event));
            }
        },
        elementProps,
        (props: Props) => button.getButtonProps(props)
    );
}
