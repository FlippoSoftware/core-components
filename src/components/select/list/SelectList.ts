import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { LIST_FUNCTIONAL_STYLES, SELECT_DISABLE_SCROLLBAR_CLASS } from '../utils/constants';

import type { SelectPositionerMachine } from '../positioner/SelectPositionerMachine';
import type { SelectRootMachine } from '../root/SelectRootMachine';

/**
 * `Select.List`: an optional scrollable list inside the popup.
 */
export const SelectList = {
    getProps(root: SelectRootMachine, positioner: SelectPositionerMachine, elementProps: Props = {}): Props {
        const { id, multiple, hasScrollArrows, openMethod } = root.store.state;
        return mergeProps(
            {
                id: `${id}-list`,
                role: 'listbox',
                'aria-multiselectable': multiple || undefined,
                onScroll: (event: { currentTarget: EventTarget | null }) => {
                    root.refs.scrollHandlerRef.current?.(event.currentTarget as HTMLElement);
                },
                ...(positioner.alignItemWithTriggerActive && { style: LIST_FUNCTIONAL_STYLES }),
                className: hasScrollArrows && openMethod !== 'touch' ? SELECT_DISABLE_SCROLLBAR_CLASS : undefined
            },
            elementProps
        );
    }
};
