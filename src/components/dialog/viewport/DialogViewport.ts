import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { getDialogState } from '../utils/getDialogState';

import type { DialogPopupState } from '../popup/DialogPopupMachine';
import type { AnyDialogStore } from '../utils/AnyDialogStore';

import { dialogViewportStateAttributesMapping } from './dialogViewportStateAttributesMapping';

export type DialogViewportState = DialogPopupState;

/**
 * `Dialog.Viewport`: a container for the popup, rendered while mounted (or kept mounted by the portal).
 */
export const DialogViewport = {
    getState(store: AnyDialogStore): DialogViewportState {
        return getDialogState(store);
    },
    attrs(state: DialogViewportState) {
        return getStyleHookProps(state, dialogViewportStateAttributesMapping);
    },
    shouldRender(store: AnyDialogStore, keepMounted: boolean) {
        return keepMounted || store.select('mounted');
    },
    getProps(store: AnyDialogStore, elementProps: Props = {}): Props {
        return mergeProps({ role: 'presentation', hidden: !store.select('mounted') }, elementProps);
    },
    setElement(store: AnyDialogStore, element: HTMLElement | null) {
        store.set('viewportElement', element);
    }
};
