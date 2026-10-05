import { isElement } from '@floating-ui/utils/dom';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { Effect } from '../../utils/Effect';
import { getTarget, isTargetInsideEnabledTrigger } from '../../utils/element';
import { isMouseLikePointerType } from '../../utils/event';

import type { FloatingRootStore } from '../../FloatingRootStore';
import type { FloatingTreeStore } from '../../FloatingTreeStore';

import {
    blockPointerEvents,
    clearPointerEventsMutation,
    getHoverInteractionState,
    isClickLikeOpenEvent,
    isHoverOpen,
    isInteractiveElement
} from './HoverInteractionState';

import type { HoverInteractionState } from './HoverInteractionState';

export type HoverFloatingInteractionOptions = {
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * Delay before closing when the cursor leaves the floating element.
     * @default 0
     */
    closeDelay?: number | (() => number) | undefined;
    /**
     * The floating tree (nested popups).
     */
    tree?: FloatingTreeStore | null | undefined;
    /**
     * ID of the parent tree node.
     */
    parentId?: string | null | undefined;
};

function getCloseDelay(value: number | (() => number), pointerType?: string) {
    if (pointerType && !isMouseLikePointerType(pointerType)) {
        return 0;
    }

    return typeof value === 'function' ? value() : value;
}

/**
 * Hover interactions attached to the floating element.
 * Replacement for `useHoverFloatingInteraction`.
 */
export class HoverFloatingInteraction {
    private options: HoverFloatingInteractionOptions;

    private readonly store: FloatingRootStore;

    private readonly instance: HoverInteractionState;

    private readonly listeners: Effect;

    private readonly pointerEventsBlock: Effect;

    private readonly unsubscribe: () => void;

    private previousOpen: boolean;

    constructor(store: FloatingRootStore, options: HoverFloatingInteractionOptions = {}) {
        this.store = store;
        this.options = options;
        this.instance = getHoverInteractionState(store);
        this.previousOpen = store.select('open');
        this.listeners = new Effect(() => this.attachListeners());
        this.pointerEventsBlock = new Effect(() => this.applyPointerEventsBlock());
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: HoverFloatingInteractionOptions) {
        this.options = options;
        this.sync();
    }

    destroy() {
        this.unsubscribe();
        this.listeners.destroy();
        this.pointerEventsBlock.destroy();
        this.cleanupMouseMoveHandler();
        this.clearPointerEvents();
    }

    private get settings() {
        const { enabled = true, closeDelay = 0, tree = null, parentId = null } = this.options;
        return { enabled, closeDelay, tree, parentId };
    }

    private sync() {
        const { enabled, tree, parentId } = this.settings;
        const { open, floatingElement, domReferenceElement } = this.store.state;

        if (!open && this.previousOpen !== open) {
            this.instance.pointerType = undefined;
            this.instance.restTimeoutPending = false;
            this.instance.interactedInside = false;
            this.cleanupMouseMoveHandler();
            this.clearPointerEvents();
        }
        this.previousOpen = open;

        this.pointerEventsBlock.sync([enabled, open, domReferenceElement, floatingElement, tree, parentId]);
        this.listeners.sync([enabled, floatingElement]);
    }

    private applyPointerEventsBlock() {
        const { enabled, tree, parentId } = this.settings;
        const { open, floatingElement, domReferenceElement } = this.store.state;

        if (
            !enabled ||
            !open ||
            !this.instance.handleCloseOptions?.blockPointerEvents ||
            !isHoverOpen(this.store) ||
            !isElement(domReferenceElement)
        ) {
            return;
        }

        const parentFloating = tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.elements.floating;
        return blockPointerEvents(this.instance, domReferenceElement, floatingElement, parentFloating);
    }

    private closeWithDelay(event: MouseEvent, runElseBranch = true) {
        const closeDelay = getCloseDelay(this.settings.closeDelay, this.instance.pointerType);
        if (closeDelay && !this.instance.handler) {
            this.instance.openChangeTimeout.start(closeDelay, () =>
                this.store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event))
            );
        } else if (runElseBranch) {
            this.instance.openChangeTimeout.clear();
            this.store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
        }
    }

    private cleanupMouseMoveHandler() {
        this.instance.unbindMouseMove();
        this.instance.handler = undefined;
    }

    private clearPointerEvents() {
        clearPointerEventsMutation(this.instance, this.store.select('floatingElement'));
    }

    private attachListeners() {
        if (!this.settings.enabled) {
            return;
        }

        const floating = this.store.select('floatingElement');
        if (!floating) {
            return;
        }

        const instance = this.instance;
        const store = this.store;

        // Ensure the floating element closes after scrolling even if the pointer did not move.
        // https://github.com/floating-ui/floating-ui/discussions/1692
        const onScrollMouseLeave = (event: MouseEvent) => {
            if (isClickLikeOpenEvent(store, instance) || !store.context.dataRef.current.floatingContext || !store.select('open')) {
                return;
            }

            if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
                // The cursor moves to another trigger: the popup will be moved, not closed.
                return;
            }

            // If the safePolygon handler is active, let it handle the close logic.
            // The handler checks for open children in the floating tree.
            if (instance.handler) {
                instance.handler(event);
                return;
            }

            this.clearPointerEvents();
            this.cleanupMouseMoveHandler();
            if (!isClickLikeOpenEvent(store, instance)) {
                this.closeWithDelay(event);
            }
        };

        const onFloatingMouseEnter = (event: MouseEvent) => {
            instance.openChangeTimeout.clear();
            this.clearPointerEvents();
            instance.handler?.(event);
        };

        const onFloatingMouseLeave = (event: MouseEvent) => {
            if (!isClickLikeOpenEvent(store, instance)) {
                this.closeWithDelay(event, false);
            }
        };

        const handleInteractInside = (event: PointerEvent) => {
            instance.interactedInside = isInteractiveElement(getTarget(event) as Element | null);
        };

        floating.addEventListener('mouseleave', onScrollMouseLeave);
        floating.addEventListener('mouseenter', onFloatingMouseEnter);
        floating.addEventListener('mouseleave', onFloatingMouseLeave);
        floating.addEventListener('pointerdown', handleInteractInside, true);

        return () => {
            floating.removeEventListener('mouseleave', onScrollMouseLeave);
            floating.removeEventListener('mouseenter', onFloatingMouseEnter);
            floating.removeEventListener('mouseleave', onFloatingMouseLeave);
            floating.removeEventListener('pointerdown', handleInteractInside, true);
        };
    }
}
