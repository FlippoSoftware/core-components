import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { mergeProps } from '~@props/mergeProps';

import type { TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { SelectRootMachine } from '../root/SelectRootMachine';

export type SelectBackdropState = {
    open: boolean;
    transitionStatus: TransitionStatus;
};

/**
 * `Select.Backdrop`.
 */
export const SelectBackdrop = {
    getState(root: SelectRootMachine): SelectBackdropState {
        return { open: root.store.state.open, transitionStatus: root.store.state.transitionStatus };
    },
    attrs(state: SelectBackdropState) {
        return getStyleHookProps(state, { ...popupStateMapping, ...transitionStatusMapping });
    },
    getProps(root: SelectRootMachine, elementProps: Props = {}): Props {
        return mergeProps(
            { role: 'presentation', hidden: !root.store.state.mounted, style: { userSelect: 'none', WebkitUserSelect: 'none' } },
            elementProps
        );
    }
};
