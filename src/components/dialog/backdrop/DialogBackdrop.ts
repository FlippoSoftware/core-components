import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { mergeProps } from '~@props/mergeProps';

import type { TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { AnyDialogStore } from '../utils/AnyDialogStore';

import { dialogBackdropStateAttributesMapping } from './dialogBackdropStateAttributesMapping';

export type DialogBackdropState = {
    open: boolean;
    transitionStatus: TransitionStatus;
};

/**
 * `Dialog.Backdrop`: rendered only for the outermost dialog unless `forceRender` is set.
 */
export const DialogBackdrop = {
    getState(store: AnyDialogStore): DialogBackdropState {
        return { open: store.select('open'), transitionStatus: store.select('transitionStatus') };
    },
    attrs(state: DialogBackdropState) {
        return getStyleHookProps(state, dialogBackdropStateAttributesMapping);
    },
    shouldRender(store: AnyDialogStore, forceRender = false) {
        return forceRender || !store.select('nested');
    },
    getProps(store: AnyDialogStore, elementProps: Props = {}): Props {
        return mergeProps(
            { role: 'presentation', hidden: !store.select('mounted'), style: { userSelect: 'none', WebkitUserSelect: 'none' } },
            elementProps
        );
    },
    setElement(store: AnyDialogStore, element: HTMLDivElement | null) {
        store.context.backdropRef.current = element;
    }
};
