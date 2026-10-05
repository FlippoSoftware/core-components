import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { triggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import type { SelectRootMachine } from '../root/SelectRootMachine';

/**
 * `Select.Icon`.
 */
export const SelectIcon = {
    getState(root: SelectRootMachine): { open: boolean } {
        return { open: root.store.state.open };
    },
    attrs(state: { open: boolean }) {
        return getStyleHookProps(state, triggerOpenStateMapping);
    },
    getProps(elementProps: Props = {}): Props {
        return mergeProps({ 'aria-hidden': true }, elementProps);
    }
};
