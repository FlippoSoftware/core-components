import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { REASONS } from '~@events/reasons';
import { mergeProps } from '~@props/mergeProps';

import type { Style, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { PopoverStore } from '../store/PopoverStore';

import { popoverBackdropStateAttributesMapping } from './popoverBackdropStateAttributesMapping';

export type PopoverBackdropState = {
    open: boolean;
    transitionStatus: TransitionStatus;
};

/**
 * `Popover.Backdrop`.
 */
export const PopoverBackdrop = {
    getState(store: PopoverStore<unknown>): PopoverBackdropState {
        return { open: store.select('open'), transitionStatus: store.select('transitionStatus') };
    },
    attrs(state: PopoverBackdropState) {
        return getStyleHookProps(state, popoverBackdropStateAttributesMapping);
    },
    getProps(store: PopoverStore<unknown>, elementProps: Props = {}): Props {
        const style: Style = {
            pointerEvents: store.select('openChangeReason') === REASONS.triggerHover ? 'none' : undefined,
            userSelect: 'none',
            WebkitUserSelect: 'none'
        };
        return mergeProps({ role: 'presentation', hidden: !store.select('mounted'), style }, elementProps);
    },
    setElement(store: PopoverStore<unknown>, element: HTMLDivElement | null) {
        store.context.backdropRef.current = element;
    }
};
