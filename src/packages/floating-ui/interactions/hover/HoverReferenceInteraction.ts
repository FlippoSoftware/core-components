import { isElement } from '@floating-ui/utils/dom';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { ownerDocument } from '~@lib/owner';

import type { FloatingOpenChangeDetails } from '~@events/changeEventDetails';

import { Effect } from '../../utils/Effect';
import { contains, isTargetInsideEnabledTrigger } from '../../utils/element';
import { getNativeEvent, isMouseLikePointerType } from '../../utils/event';

import type { FloatingRootStore } from '../../FloatingRootStore';
import type { FloatingTreeStore } from '../../FloatingTreeStore';
import type { HandleClose } from '../../safePolygon';
import type { Delay, InteractionElementProps } from '../../types';

import { clearPointerEventsMutation, getDelay, getHoverInteractionState, getRestMs, isClickLikeOpenEvent } from './HoverInteractionState';

import type { HoverInteractionState } from './HoverInteractionState';

export type HoverReferenceInteractionOptions = {
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * Ignore non-mouse pointers.
     * @default false
     */
    mouseOnly?: boolean | undefined;
    /**
     * Handler that decides when the floating element closes once the cursor leaves the reference
     * (e.g. `safePolygon()`).
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
     * Whether moving the cursor over the reference opens it without a regular hover event.
     * @default true
     */
    move?: boolean | undefined;
    /**
     * Whether this interaction controls the active trigger. When `false`, the props
     * are meant for inactive triggers.
     * @default true
     */
    isActiveTrigger?: boolean | undefined;
    /**
     * The trigger element this interaction is attached to. Defaults to the active DOM reference.
     */
    triggerElement?: Element | null | undefined;
    /**
     * The floating tree (nested popups).
     */
    tree?: FloatingTreeStore | null | undefined;
    /**
     * Runs a state change synchronously in the adapter's renderer (`ReactDOM.flushSync`).
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

const runImmediately = (fn: () => void) => fn();

/**
 * Hover interactions attached to a reference/trigger element.
 * Replacement for `useHoverReferenceInteraction`.
 */
export class HoverReferenceInteraction {
    private options: HoverReferenceInteractionOptions;

    private readonly store: FloatingRootStore;

    private readonly instance: HoverInteractionState;

    private readonly listeners: Effect;

    private readonly openChangeListener: Effect;

    private readonly unsubscribe: () => void;

    private readonly props: InteractionElementProps;

    constructor(store: FloatingRootStore, options: HoverReferenceInteractionOptions = {}) {
        this.store = store;
        this.options = options;
        this.instance = getHoverInteractionState(store);
        this.listeners = new Effect(() => this.attachListeners());
        this.openChangeListener = new Effect(() => this.attachOpenChangeListener());
        this.props = {
            onPointerDown: this.setPointerType,
            onPointerEnter: this.setPointerType,
            onMouseMove: this.onMouseMove
        };
        this.unsubscribe = store.subscribe(() => this.sync());
        this.applyHandleCloseOptions();
        this.sync();
    }

    setOptions(options: HoverReferenceInteractionOptions) {
        this.options = options;
        this.applyHandleCloseOptions();
        this.sync();
    }

    /**
     * Props for the trigger element, or `undefined` when disabled.
     */
    getProps(): InteractionElementProps | undefined {
        return this.settings.enabled ? this.props : undefined;
    }

    destroy() {
        this.unsubscribe();
        this.listeners.destroy();
        this.openChangeListener.destroy();
    }

    private get settings() {
        const {
            enabled = true,
            delay = 0,
            handleClose = null,
            mouseOnly = false,
            restMs = 0,
            move = true,
            isActiveTrigger = true,
            triggerElement = null,
            tree = null,
            flushSync = runImmediately
        } = this.options;
        return { enabled, delay, handleClose, mouseOnly, restMs, move, isActiveTrigger, triggerElement, tree, flushSync };
    }

    private applyHandleCloseOptions() {
        const { isActiveTrigger, handleClose } = this.settings;
        if (isActiveTrigger) {
            this.instance.handleCloseOptions = handleClose?.__options;
        }
    }

    private getTrigger(): HTMLElement | null {
        const { triggerElement, isActiveTrigger } = this.settings;
        return (
            (triggerElement as HTMLElement | null) ??
            (isActiveTrigger ? (this.store.select('domReferenceElement') as HTMLElement | null) : null)
        );
    }

    private sync() {
        const { enabled, mouseOnly, move, isActiveTrigger } = this.settings;
        this.openChangeListener.sync([enabled]);
        this.listeners.sync([enabled, this.getTrigger(), mouseOnly, move, isActiveTrigger]);
    }

    private attachOpenChangeListener() {
        if (!this.settings.enabled) {
            return;
        }

        const { events } = this.store.context;
        // When closing before opening, clear the delay timeouts to cancel it from showing.
        const onOpenChangeLocal = (details: FloatingOpenChangeDetails) => {
            if (!details.open) {
                this.instance.openChangeTimeout.clear();
                this.instance.restTimeout.clear();
                this.instance.blockMouseMove = true;
                this.instance.restTimeoutPending = false;
            }
        };

        events.on('openchange', onOpenChangeLocal);
        return () => {
            events.off('openchange', onOpenChangeLocal);
        };
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
        clearPointerEventsMutation(this.instance, this.store.select('domReferenceElement'));
    }

    private isOverInactiveTrigger(target: EventTarget | null) {
        const currentDomReference = this.store.select('domReferenceElement');
        const allTriggers = this.store.context.triggerElements;
        return (
            (allTriggers.hasElement(target as Element) || allTriggers.hasMatchingElement((t) => contains(t, target as Element))) &&
            (!currentDomReference || !contains(currentDomReference, target as Element))
        );
    }

    private handleScrollMouseLeave(event: MouseEvent) {
        const { dataRef } = this.store.context;
        const { handleClose, tree } = this.settings;
        const floatingContext = dataRef.current.floatingContext;

        if (isClickLikeOpenEvent(this.store, this.instance) || !floatingContext) {
            return;
        }

        if (isTargetInsideEnabledTrigger(event.relatedTarget, this.store.context.triggerElements)) {
            return;
        }

        const currentTrigger = this.settings.triggerElement;

        handleClose?.({
            ...floatingContext,
            tree,
            x: event.clientX,
            y: event.clientY,
            onClose: () => {
                this.clearPointerEvents();
                this.cleanupMouseMoveHandler();
                if (!isClickLikeOpenEvent(this.store, this.instance) && currentTrigger === this.store.select('domReferenceElement')) {
                    this.closeWithDelay(event);
                }
            }
        })(event);
    }

    private attachListeners() {
        const { enabled, mouseOnly, move } = this.settings;
        if (!enabled) {
            return;
        }

        const trigger = this.getTrigger();
        if (!isElement(trigger)) {
            return;
        }

        const instance = this.instance;
        const store = this.store;

        const onMouseEnter = (event: MouseEvent) => {
            const { delay, restMs } = this.settings;
            instance.openChangeTimeout.clear();
            instance.blockMouseMove = false;

            if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) {
                return;
            }

            // Only rest delay is set; there's no fallback delay.
            // This will be handled by `onMouseMove`.
            if (getRestMs(restMs) > 0 && !getDelay(delay, 'open')) {
                return;
            }

            const openDelay = getDelay(delay, 'open', instance.pointerType);
            const isOverInactiveTrigger = this.isOverInactiveTrigger(event.target);
            const triggerNode = (event.currentTarget as HTMLElement) ?? null;

            const isOpen = store.select('open');
            const shouldOpen = !isOpen || isOverInactiveTrigger;

            // When moving between triggers while already open, open immediately without delay
            if (isOverInactiveTrigger && isOpen) {
                store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerNode ?? undefined));
            } else if (openDelay) {
                instance.openChangeTimeout.start(openDelay, () => {
                    if (shouldOpen) {
                        store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerNode ?? undefined));
                    }
                });
            } else if (shouldOpen) {
                store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerNode ?? undefined));
            }
        };

        const onMouseLeave = (event: MouseEvent) => {
            const { handleClose, tree } = this.settings;

            if (isClickLikeOpenEvent(store, instance)) {
                this.clearPointerEvents();
                return;
            }

            instance.unbindMouseMove();

            const doc = ownerDocument(store.select('domReferenceElement'));
            instance.restTimeout.clear();
            instance.restTimeoutPending = false;

            if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
                return;
            }

            const floatingContext = store.context.dataRef.current.floatingContext;

            if (handleClose && floatingContext) {
                if (!store.select('open')) {
                    instance.openChangeTimeout.clear();
                }

                const currentTrigger = this.settings.triggerElement;

                const handler = handleClose({
                    ...floatingContext,
                    tree,
                    x: event.clientX,
                    y: event.clientY,
                    onClose: () => {
                        this.clearPointerEvents();
                        this.cleanupMouseMoveHandler();
                        if (
                            this.settings.enabled &&
                            !isClickLikeOpenEvent(store, instance) &&
                            currentTrigger === store.select('domReferenceElement')
                        ) {
                            this.closeWithDelay(event, true);
                        }
                    }
                });
                instance.handler = handler;

                handler(event);

                doc.addEventListener('mousemove', handler);
                instance.unbindMouseMove = () => {
                    doc.removeEventListener('mousemove', handler);
                };

                return;
            }

            const shouldClose =
                instance.pointerType === 'touch' ? !contains(store.select('floatingElement'), event.relatedTarget as Element | null) : true;

            if (shouldClose) {
                this.closeWithDelay(event);
            }
        };

        const onScrollMouseLeave = (event: MouseEvent) => {
            this.handleScrollMouseLeave(event);
        };

        if (store.select('open')) {
            trigger.addEventListener('mouseleave', onScrollMouseLeave);
        }

        if (move) {
            trigger.addEventListener('mousemove', onMouseEnter, { once: true });
        }

        trigger.addEventListener('mouseenter', onMouseEnter);
        trigger.addEventListener('mouseleave', onMouseLeave);

        return () => {
            trigger.removeEventListener('mouseleave', onScrollMouseLeave);

            if (move) {
                trigger.removeEventListener('mousemove', onMouseEnter);
            }

            trigger.removeEventListener('mouseenter', onMouseEnter);
            trigger.removeEventListener('mouseleave', onMouseLeave);
        };
    }

    private readonly setPointerType = (event: PointerEvent) => {
        this.instance.pointerType = event.pointerType;
    };

    private readonly onMouseMove = (event: MouseEvent) => {
        const { mouseOnly, restMs, flushSync } = this.settings;
        const instance = this.instance;
        const store = this.store;
        const nativeEvent = getNativeEvent(event);
        const trigger = event.currentTarget as HTMLElement;

        const currentOpen = store.select('open');
        const isOverInactiveTrigger = this.isOverInactiveTrigger(event.target);

        if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) {
            return;
        }

        if ((currentOpen && !isOverInactiveTrigger) || getRestMs(restMs) === 0) {
            return;
        }

        if (!isOverInactiveTrigger && instance.restTimeoutPending && event.movementX ** 2 + event.movementY ** 2 < 2) {
            return;
        }

        instance.restTimeout.clear();

        const handleMouseMove = () => {
            instance.restTimeoutPending = false;

            // A delayed hover open should not override a click-like open that happened
            // while the hover delay was pending.
            if (isClickLikeOpenEvent(store, instance)) {
                return;
            }

            const latestOpen = store.select('open');

            if (!instance.blockMouseMove && (!latestOpen || isOverInactiveTrigger)) {
                store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, nativeEvent, trigger));
            }
        };

        if (instance.pointerType === 'touch') {
            flushSync(handleMouseMove);
        } else if (isOverInactiveTrigger && currentOpen) {
            handleMouseMove();
        } else {
            instance.restTimeoutPending = true;
            instance.restTimeout.start(getRestMs(restMs), handleMouseMove);
        }
    };
}
