import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { PopupAutoResize } from '~@dom/PopupAutoResize';
import { HoverFloatingInteraction } from '~@packages/floating-ui/interactions/hover/HoverFloatingInteraction';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Side, TransitionStatus } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import type { Props } from '~@props/mergeProps';

import type { TooltipMultipleMachine } from '../multiple/TooltipMultipleMachine';
import type { TooltipPositionerMachine } from '../positioner/TooltipPositionerMachine';
import type { TooltipRootMachine } from '../root/TooltipRootMachine';
import type { TooltipStore } from '../store/TooltipStore';

import { tooltipPopupStateAttributesMapping } from './tooltipPopupStateAttributesMapping';

export type TooltipPopupState = {
    multipleActive: boolean;
    open: boolean;
    side: Side;
    align: Align;
    instant: 'delay' | 'focus' | 'dismiss' | undefined;
    transitionStatus: TransitionStatus;
};

export type TooltipPopupSetup = {
    positioner: TooltipPositionerMachine<unknown> | null;
    multiple?: TooltipMultipleMachine | null | undefined;
    tree?: FloatingTreeStore | null | undefined;
};

/**
 * State machine of `Tooltip.Popup`: hover close, auto-resize between triggers and
 * `Tooltip.Multiple` popup registration.
 */
export class TooltipPopupMachine<Payload = unknown> {
    private readonly root: TooltipRootMachine<Payload>;

    private readonly setup: TooltipPopupSetup;

    private floatingRoot: FloatingRootStore | null = null;

    private hover: HoverFloatingInteraction | null = null;

    private readonly autoResize: PopupAutoResize;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly multipleEffect = new Effect(() => this.registerInMultiple());

    private readonly unsubscribe: () => void;

    constructor(root: TooltipRootMachine<Payload>, setup: TooltipPopupSetup) {
        this.root = root;
        this.setup = setup;
        const { store } = root;
        this.openChangeComplete = new OpenChangeComplete(store.context.popupRef, () => {
            if (root.getOpenState()) {
                store.context.onOpenChangeComplete?.(true);
            }
        });
        this.autoResize = new PopupAutoResize(this.getAutoResizeOptions());
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    private get store(): TooltipStore<Payload> {
        return this.root.store;
    }

    setElement = (element: HTMLElement | null) => {
        this.store.context.popupRef.current = element;
        this.store.set('popupElement', element);
    };

    static attrs(state: TooltipPopupState) {
        return getStyleHookProps(state, tooltipPopupStateAttributesMapping);
    }

    getState(): TooltipPopupState {
        const positionerState = this.setup.positioner?.getState();
        return {
            open: this.root.getOpenState(),
            side: positionerState?.side ?? 'top',
            align: positionerState?.align ?? 'center',
            instant: this.store.select('instantType'),
            transitionStatus: this.store.select('transitionStatus'),
            multipleActive: this.root.isMultipleActive()
        };
    }

    getPopupProps(elementProps: Props = {}): Props {
        // Hide from screen readers when not active in multiple mode.
        const isHiddenFromScreenReader = this.setup.multiple != null && !this.root.isMultipleActive();
        return mergeProps(
            this.store.select('popupProps'),
            getDisabledMountTransitionStyles(this.store.select('transitionStatus')),
            isHiddenFromScreenReader ? { 'aria-hidden': true } : undefined,
            elementProps
        );
    }

    destroy() {
        this.unsubscribe();
        this.hover?.destroy();
        this.hover = null;
        this.multipleEffect.destroy();
        this.autoResize.destroy();
        this.openChangeComplete.destroy();
    }

    private registerInMultiple() {
        const multiple = this.setup.multiple;
        const popupElement = this.store.select('popupElement');
        if (!multiple || !popupElement) {
            return;
        }
        multiple.store.registerPopup(popupElement);
        return () => {
            multiple.store.unregisterPopup(popupElement);
        };
    }

    private getHoverOptions() {
        const closeDelay = this.store.select('closeDelay');
        return {
            enabled: !this.store.select('disabled'),
            // For Multiple: use a larger close delay to allow mouse movement between elements.
            closeDelay: this.setup.multiple ? Math.max(closeDelay, 150) : closeDelay,
            tree: this.setup.tree
        };
    }

    private getAutoResizeOptions() {
        const { store } = this;
        return {
            popupElement: store.select('popupElement'),
            positionerElement: store.select('positionerElement'),
            mounted: store.select('mounted'),
            content: store.select('payload'),
            // If there's just one trigger, the popup is always anchored to the same position.
            enabled: () => store.context.triggerElements.size > 1,
            onMeasureLayout: () => {
                this.floatingRoot?.context.events.emit('measure-layout');
            },
            onMeasureLayoutComplete: (previousDimensions: unknown, nextDimensions: unknown) => {
                this.floatingRoot?.context.events.emit('measure-layout-complete', { previousDimensions, nextDimensions });
            }
        };
    }

    private sync() {
        const floatingRoot = this.store.select('floatingRootContext');
        if (floatingRoot !== this.floatingRoot) {
            this.hover?.destroy();
            this.floatingRoot = floatingRoot;
            this.hover = new HoverFloatingInteraction(floatingRoot, this.getHoverOptions());
        } else {
            this.hover?.setOptions(this.getHoverOptions());
        }

        this.multipleEffect.sync([this.store.select('popupElement')]);
        this.autoResize.setOptions(this.getAutoResizeOptions());
        this.openChangeComplete.sync(this.root.getOpenState());
    }
}
