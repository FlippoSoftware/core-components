import { isElement } from '@floating-ui/utils/dom';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { ownerDocument } from '~@lib/owner';

import type { FloatingOpenChangeDetails } from '~@events/changeEventDetails';

import { Effect } from '../../utils/Effect';
import { contains, getTarget } from '../../utils/element';
import { getNativeEvent } from '../../utils/event';

import type { FloatingRootStore } from '../../FloatingRootStore';
import type { FloatingTreeStore } from '../../FloatingTreeStore';
import type { HandleClose } from '../../safePolygon';
import type { Delay, InteractionProps } from '../../types';

import {
    blockPointerEvents,
    clearPointerEventsMutation,
    getDelay,
    getRestMs,
    HoverInteractionState,
    isClickLikeOpenEvent,
    isHoverOpen,
    isInteractiveElement
} from './HoverInteractionState';

export type HoverInteractionOptions = {
    /**
     * Handler that decides when the floating element closes once the cursor leaves the reference.
     * @default null
     */
    handleClose?: HandleClose | null | undefined;
    /**
     * Waits until the cursor is at “rest” over the reference before opening.
     * @default 0
     */
    restMs?: number | (() => number) | undefined;
    /**
     * Delay before opening/closing.
     * @default 0
     */
    delay?: Delay | (() => Delay) | undefined;
    /**
     * Whether moving the cursor over the floating element opens it without a regular hover event.
     * @default true
     */
    move?: boolean | undefined;
    /**
     * The floating tree (nested popups).
     */
    tree?: FloatingTreeStore | null | undefined;
    /**
     * ID of the parent tree node.
     */
    parentId?: string | null | undefined;
};

/**
 * Opens the floating element while hovering over the reference element, like CSS `:hover`.
 * Replacement for `useHover` (reference and floating listeners in one object).
 */
export class HoverInteraction {
    private options: HoverInteractionOptions;

    private readonly store: FloatingRootStore;

    private readonly instance = new HoverInteractionState();

    private readonly openChangeListener: Effect;

    private readonly documentLeaveListener: Effect;

    private readonly elementListeners: Effect;

    private readonly pointerEventsBlock: Effect;

    private readonly unsubscribe: () => void;

    private readonly reference: Record<string, unknown>;

    private previousOpen: boolean;

    private previousDomReference: Element | null;

    constructor(store: FloatingRootStore, options: HoverInteractionOptions = {}) {
        this.store = store;
        this.options = options;
        this.previousOpen = store.select('open');
        this.previousDomReference = store.select('domReferenceElement');
        this.openChangeListener = new Effect(() => this.attachOpenChangeListener());
        this.documentLeaveListener = new Effect(() => this.attachDocumentLeaveListener());
        this.elementListeners = new Effect(() => this.attachElementListeners());
        this.pointerEventsBlock = new Effect(() => this.applyPointerEventsBlock());
        this.reference = {
            onPointerDown: this.setPointerType,
            onPointerEnter: this.setPointerType,
            onMouseMove: this.onMouseMove
        };
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: HoverInteractionOptions) {
        this.options = options;
        this.sync();
    }

    getProps(): InteractionProps {
        return { reference: this.reference };
    }

    destroy() {
        this.unsubscribe();
        this.openChangeListener.destroy();
        this.documentLeaveListener.destroy();
        this.elementListeners.destroy();
        this.pointerEventsBlock.destroy();
        this.cleanupMouseMoveHandler();
        this.instance.dispose();
        this.instance.interactedInside = false;
        this.clearPointerEvents();
    }

    private get settings() {
        const { delay = 0, handleClose = null, restMs = 0, move = true, tree = null, parentId = null } = this.options;
        return { delay, handleClose, restMs, move, tree, parentId };
    }

    private sync() {
        const { move, tree, parentId, handleClose } = this.settings;
        const { open, floatingElement, domReferenceElement } = this.store.state;

        if (!open && this.previousOpen !== open) {
            this.instance.pointerType = undefined;
            this.instance.restTimeoutPending = false;
            this.instance.interactedInside = false;
            this.cleanupMouseMoveHandler();
            this.clearPointerEvents();
        }
        this.previousOpen = open;

        if (domReferenceElement !== this.previousDomReference) {
            this.previousDomReference = domReferenceElement;
            this.cleanupMouseMoveHandler();
            this.instance.dispose();
            this.instance.interactedInside = false;
        }

        this.openChangeListener.sync([]);
        this.documentLeaveListener.sync([open, floatingElement, Boolean(handleClose)]);
        this.pointerEventsBlock.sync([open, domReferenceElement, floatingElement, tree, parentId, handleClose]);
        this.elementListeners.sync([move, domReferenceElement, floatingElement, open, tree, handleClose]);
    }

    private attachOpenChangeListener() {
        const { events } = this.store.context;
        // When closing before opening, clear the delay timeouts to cancel it from showing.
        const onOpenChangeLocal = (details: FloatingOpenChangeDetails) => {
            if (!details.open) {
                this.instance.dispose();
                this.instance.blockMouseMove = true;
                this.instance.restTimeoutPending = false;
            }
        };

        events.on('openchange', onOpenChangeLocal);
        return () => {
            events.off('openchange', onOpenChangeLocal);
        };
    }

    private attachDocumentLeaveListener() {
        const { open, floatingElement } = this.store.state;
        if (!this.settings.handleClose || !open) {
            return;
        }

        const onLeave = (event: MouseEvent) => {
            if (isClickLikeOpenEvent(this.store, this.instance)) {
                return;
            }

            if (isHoverOpen(this.store)) {
                this.store.setOpen(
                    false,
                    createChangeEventDetails(REASONS.triggerHover, event, (event.currentTarget as HTMLElement) ?? undefined)
                );
            }
        };

        const html = ownerDocument(floatingElement).documentElement;
        html.addEventListener('mouseleave', onLeave);
        return () => {
            html.removeEventListener('mouseleave', onLeave);
        };
    }

    private applyPointerEventsBlock() {
        const { handleClose, tree, parentId } = this.settings;
        const { open, floatingElement, domReferenceElement } = this.store.state;

        if (!open || !handleClose?.__options?.blockPointerEvents || !isHoverOpen(this.store) || !isElement(domReferenceElement)) {
            return;
        }

        const parentFloating = tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.elements.floating;
        return blockPointerEvents(this.instance, domReferenceElement, floatingElement, parentFloating);
    }

    private closeWithDelay(event: MouseEvent, runElseBranch = true) {
        const closeDelay = getDelay(this.settings.delay, 'close', this.instance.pointerType);
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

    private attachElementListeners() {
        const { move } = this.settings;
        const { open, floatingElement, domReferenceElement } = this.store.state;
        const instance = this.instance;
        const store = this.store;

        const createHandlerContext = (event: MouseEvent, onClose: () => void) => {
            const floatingContext = store.context.dataRef.current.floatingContext;
            if (!floatingContext) {
                return null;
            }
            return { ...floatingContext, tree: this.settings.tree, x: event.clientX, y: event.clientY, onClose };
        };

        const onReferenceMouseEnter = (event: MouseEvent) => {
            const { delay, restMs } = this.settings;
            instance.openChangeTimeout.clear();
            instance.blockMouseMove = false;

            if (getRestMs(restMs) > 0 && !getDelay(delay, 'open')) {
                return;
            }

            const openDelay = getDelay(delay, 'open', instance.pointerType);
            const trigger = (event.currentTarget as HTMLElement) ?? undefined;
            const domReference = store.select('domReferenceElement');
            const isOverInactiveTrigger = domReference && trigger && !contains(domReference, trigger);

            if (openDelay) {
                instance.openChangeTimeout.start(openDelay, () => {
                    if (!store.select('open')) {
                        store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, trigger));
                    }
                });
            } else if (!open || isOverInactiveTrigger) {
                store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, trigger));
            }
        };

        const onReferenceMouseLeave = (event: MouseEvent) => {
            const { handleClose } = this.settings;
            if (isClickLikeOpenEvent(store, instance)) {
                this.clearPointerEvents();
                return;
            }

            instance.unbindMouseMove();

            const doc = ownerDocument(floatingElement);
            instance.restTimeout.clear();
            instance.restTimeoutPending = false;

            if (event.relatedTarget && store.context.triggerElements.hasElement(event.relatedTarget as Element)) {
                // The cursor moves to another trigger: the popup will be moved, not closed.
                return;
            }

            const context = createHandlerContext(event, () => {
                this.clearPointerEvents();
                this.cleanupMouseMoveHandler();
                if (!isClickLikeOpenEvent(store, instance)) {
                    this.closeWithDelay(event, true);
                }
            });

            if (handleClose && context) {
                // Prevent clearing `onScrollMouseLeave` timeout.
                if (!open) {
                    instance.openChangeTimeout.clear();
                }

                const handler = handleClose(context);
                instance.handler = handler;

                doc.addEventListener('mousemove', handler);
                instance.unbindMouseMove = () => {
                    doc.removeEventListener('mousemove', handler);
                };

                return;
            }

            // Allow interactivity without `safePolygon` on touch devices. With a
            // pointer, a short close delay is an alternative, so it should work consistently.
            const shouldClose = instance.pointerType === 'touch' ? !contains(floatingElement, event.relatedTarget as Element | null) : true;
            if (shouldClose) {
                this.closeWithDelay(event);
            }
        };

        // Ensure the floating element closes after scrolling even if the pointer did not move.
        const onScrollMouseLeave = (event: MouseEvent) => {
            if (isClickLikeOpenEvent(store, instance) || !store.context.dataRef.current.floatingContext || !store.select('open')) {
                return;
            }

            if (event.relatedTarget && store.context.triggerElements.hasElement(event.relatedTarget as Element)) {
                return;
            }

            const context = createHandlerContext(event, () => {
                this.clearPointerEvents();
                this.cleanupMouseMoveHandler();
                if (!isClickLikeOpenEvent(store, instance)) {
                    this.closeWithDelay(event);
                }
            });

            if (context) {
                this.settings.handleClose?.(context)(event);
            }
        };

        const onFloatingMouseEnter = () => {
            instance.openChangeTimeout.clear();
            this.clearPointerEvents();
        };

        const onFloatingMouseLeave = (event: MouseEvent) => {
            if (!isClickLikeOpenEvent(store, instance)) {
                this.closeWithDelay(event, false);
            }
        };

        const handleInteractInside = (event: PointerEvent) => {
            instance.interactedInside = isInteractiveElement(getTarget(event) as Element | null);
        };

        const trigger = domReferenceElement as HTMLElement | null;

        if (!isElement(trigger)) {
            return;
        }

        const floating = floatingElement;

        if (open) {
            trigger.addEventListener('mouseleave', onScrollMouseLeave);
        }

        if (move) {
            trigger.addEventListener('mousemove', onReferenceMouseEnter, { once: true });
        }

        trigger.addEventListener('mouseenter', onReferenceMouseEnter);
        trigger.addEventListener('mouseleave', onReferenceMouseLeave);

        if (floating) {
            floating.addEventListener('mouseleave', onScrollMouseLeave);
            floating.addEventListener('mouseenter', onFloatingMouseEnter);
            floating.addEventListener('mouseleave', onFloatingMouseLeave);
            floating.addEventListener('pointerdown', handleInteractInside, true);
        }

        return () => {
            if (open) {
                trigger.removeEventListener('mouseleave', onScrollMouseLeave);
            }

            if (move) {
                trigger.removeEventListener('mousemove', onReferenceMouseEnter);
            }

            trigger.removeEventListener('mouseenter', onReferenceMouseEnter);
            trigger.removeEventListener('mouseleave', onReferenceMouseLeave);

            if (floating) {
                floating.removeEventListener('mouseleave', onScrollMouseLeave);
                floating.removeEventListener('mouseenter', onFloatingMouseEnter);
                floating.removeEventListener('mouseleave', onFloatingMouseLeave);
                floating.removeEventListener('pointerdown', handleInteractInside, true);
            }
        };
    }

    private readonly setPointerType = (event: PointerEvent) => {
        this.instance.pointerType = event.pointerType;
    };

    private readonly onMouseMove = (event: MouseEvent) => {
        const { restMs } = this.settings;
        const instance = this.instance;
        const store = this.store;
        const nativeEvent = getNativeEvent(event);
        const trigger = event.currentTarget as HTMLElement;

        // `true` when there are multiple triggers per floating element and the user hovers over the one
        // that wasn't used to open the floating element.
        const domReference = store.select('domReferenceElement');
        const isOverInactiveTrigger = domReference && !contains(domReference, event.target as Element);

        const handleMouseMove = () => {
            if (!instance.blockMouseMove && (!store.select('open') || isOverInactiveTrigger)) {
                store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, nativeEvent, trigger));
            }
        };

        if ((store.select('open') && !isOverInactiveTrigger) || getRestMs(restMs) === 0) {
            return;
        }

        // Ignore insignificant movements to account for tremors.
        if (!isOverInactiveTrigger && instance.restTimeoutPending && event.movementX ** 2 + event.movementY ** 2 < 2) {
            return;
        }

        instance.restTimeout.clear();

        if (instance.pointerType === 'touch' || isOverInactiveTrigger) {
            handleMouseMove();
        } else {
            instance.restTimeoutPending = true;
            instance.restTimeout.start(getRestMs(restMs), handleMouseMove);
        }
    };
}
