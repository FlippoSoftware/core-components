import { getOverflowAncestors } from '@floating-ui/dom';
import { getComputedStyle, getParentNode, isElement, isHTMLElement, isLastTraversableNode, isWebKit } from '@floating-ui/utils/dom';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { Timeout } from '~@timers/Timeout';

import { createAttribute } from '../utils/createAttribute';
import { contains, getDocument, getTarget, isEventTargetWithin, isRootElement } from '../utils/element';
import { getNativeEvent } from '../utils/event';
import { getNodeChildren } from '../utils/nodes';

import type { FloatingRootStore } from '../FloatingRootStore';
import type { FloatingTreeStore } from '../FloatingTreeStore';
import type { InteractionProps } from '../types';

type PressType = 'intentional' | 'sloppy';

const bubbleHandlerKeys = {
    intentional: 'onClick',
    sloppy: 'onPointerDown'
} as const;

export function normalizeProp(normalizable?: boolean | { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined }) {
    return {
        escapeKey: typeof normalizable === 'boolean' ? normalizable : (normalizable?.escapeKey ?? false),
        outsidePress: typeof normalizable === 'boolean' ? normalizable : (normalizable?.outsidePress ?? true)
    };
}

export type OutsidePressEvent = PressType | { mouse: PressType; touch: PressType };

export type DismissInteractionOptions = {
    /**
     * Whether the interaction is enabled.
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * Whether to dismiss the floating element upon pressing the `esc` key.
     * @default true
     */
    escapeKey?: boolean | undefined;
    /**
     * Whether to dismiss the floating element upon pressing the reference element.
     * @default false
     */
    referencePress?: boolean | undefined;
    /**
     * The type of event to use to determine a "press" on the reference.
     * @default 'sloppy'
     */
    referencePressEvent?: PressType | undefined;
    /**
     * Whether to dismiss the floating element upon pressing outside of it.
     * A function can guard the check.
     * @default true
     */
    outsidePress?: boolean | ((event: MouseEvent | TouchEvent) => boolean) | undefined;
    /**
     * The type of event to use to determine an outside "press".
     * - `intentional` requires the user to click outside intentionally, firing on `pointerup`
     *    for mouse, and requiring minimal `touchmove`s for touch.
     * - `sloppy` fires on `pointerdown` for mouse, while for touch it fires on `touchend`
     *    (within 1 second) or while scrolling away after `touchstart`.
     * @default 'sloppy'
     */
    outsidePressEvent?: OutsidePressEvent | (() => OutsidePressEvent) | undefined;
    /**
     * Whether to dismiss the floating element upon scrolling an overflow ancestor.
     * @default false
     */
    ancestorScroll?: boolean | undefined;
    /**
     * Determines whether event listeners bubble upwards through a tree of floating elements.
     */
    bubbles?: boolean | { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined } | undefined;
    /**
     * The floating tree (nested popups).
     */
    tree?: FloatingTreeStore | null | undefined;
};

type TouchState = {
    startTime: number;
    startX: number;
    startY: number;
    dismissOnTouchEnd: boolean;
    dismissOnMouseDown: boolean;
};

/**
 * Closes the floating element when a dismissal is requested — by default, when
 * the user presses the `escape` key or outside of the floating element.
 * Replacement for `useDismiss`: document listeners are attached while the element is open.
 */
export class DismissInteraction {
    private options: DismissInteractionOptions;

    private readonly store: FloatingRootStore;

    private endedOrStartedInside = false;

    private touchState: TouchState | null = null;

    private isComposing = false;

    private currentPointerType = '';

    private readonly cancelDismissOnEndTimeout = new Timeout();

    private readonly clearInsideTreeTimeout = new Timeout();

    private readonly compositionTimeout = new Timeout();

    private detach: (() => void) | null = null;

    private attachedKey: unknown[] = [];

    private readonly unsubscribe: () => void;

    private readonly floatingProps: Record<string, unknown>;

    constructor(store: FloatingRootStore, options: DismissInteractionOptions = {}) {
        this.store = store;
        this.options = options;
        this.floatingProps = {
            onKeyDown: this.closeOnEscapeKeyDown,

            // `onMouseDown` may be blocked if `event.preventDefault()` is called in
            // `onPointerDown`, such as with <NumberField.ScrubArea>.
            onPointerDown: this.handlePressedInside,
            onMouseDown: this.handlePressedInside,
            onMouseUp: this.handlePressedInside,

            onClickCapture: this.markInsideTree,
            onMouseDownCapture: this.markInsideTree,
            onPointerDownCapture: this.markInsideTree,
            onMouseUpCapture: this.markInsideTree,
            onTouchEndCapture: this.markInsideTree,
            onTouchMoveCapture: this.markInsideTree
        };
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: DismissInteractionOptions) {
        const outsidePressChanged =
            typeof options.outsidePress !== typeof this.options.outsidePress ||
            (typeof options.outsidePress !== 'function' && options.outsidePress !== this.options.outsidePress);
        this.options = options;
        if (outsidePressChanged) {
            this.clearInsideTree();
        }
        this.sync();
    }

    getProps(): InteractionProps {
        if (this.options.enabled === false) {
            return {};
        }
        const reference = this.getReferenceProps();
        return { reference, floating: this.floatingProps, trigger: reference };
    }

    destroy() {
        this.unsubscribe();
        this.detach?.();
        this.detach = null;
        this.cancelDismissOnEndTimeout.clear();
        this.clearInsideTreeTimeout.clear();
        this.compositionTimeout.clear();
    }

    private get settings() {
        const {
            enabled = true,
            escapeKey = true,
            outsidePress = true,
            outsidePressEvent = 'sloppy',
            referencePress = false,
            referencePressEvent = 'sloppy',
            ancestorScroll = false,
            bubbles,
            tree = null
        } = this.options;
        const { escapeKey: escapeKeyBubbles, outsidePress: outsidePressBubbles } = normalizeProp(bubbles);
        return {
            enabled,
            escapeKey,
            outsidePress,
            outsidePressEvent,
            referencePress,
            referencePressEvent,
            ancestorScroll,
            escapeKeyBubbles,
            outsidePressBubbles,
            tree
        };
    }

    private getReferenceProps(): Record<string, unknown> {
        const { referencePress, referencePressEvent } = this.settings;
        const close = (event: Event) => {
            this.store.setOpen(false, createChangeEventDetails(REASONS.triggerPress, getNativeEvent(event) as MouseEvent));
        };
        return {
            onKeyDown: this.closeOnEscapeKeyDown,
            ...(referencePress && {
                [bubbleHandlerKeys[referencePressEvent]]: close,
                ...(referencePressEvent !== 'intentional' && { onClick: close })
            })
        };
    }

    private sync() {
        const { enabled, escapeKey, outsidePress, ancestorScroll, escapeKeyBubbles, outsidePressBubbles } = this.settings;
        const state = this.store.state;
        const key = [
            state.open && enabled,
            state.floatingElement,
            state.referenceElement,
            state.domReferenceElement,
            escapeKey,
            Boolean(outsidePress),
            ancestorScroll,
            escapeKeyBubbles,
            outsidePressBubbles
        ];

        if (
            this.detach &&
            key.length === this.attachedKey.length &&
            key.every((value, index) => Object.is(value, this.attachedKey[index]))
        ) {
            return;
        }

        this.detach?.();
        this.detach = null;
        this.attachedKey = key;

        if (state.open && enabled) {
            this.detach = this.attach();
        }
    }

    private attach(): () => void {
        const { escapeKey, outsidePress, ancestorScroll, escapeKeyBubbles, outsidePressBubbles } = this.settings;
        const { floatingElement, domReferenceElement, referenceElement } = this.store.state;
        const dataRef = this.store.context.dataRef;

        dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
        dataRef.current.__outsidePressBubbles = outsidePressBubbles;

        const onScroll = (event: Event) => {
            this.store.setOpen(false, createChangeEventDetails(REASONS.none, event));
        };

        const doc = getDocument(floatingElement);

        doc.addEventListener('pointerdown', this.trackPointerType, true);

        if (escapeKey) {
            doc.addEventListener('keydown', this.closeOnEscapeKeyDown);
            doc.addEventListener('compositionstart', this.handleCompositionStart);
            doc.addEventListener('compositionend', this.handleCompositionEnd);
        }

        if (outsidePress) {
            doc.addEventListener('click', this.closeOnPressOutsideCapture, true);
            doc.addEventListener('pointerdown', this.closeOnPressOutsideCapture, true);
            doc.addEventListener('touchstart', this.handleTouchStartCapture, true);
            doc.addEventListener('touchmove', this.handleTouchMoveCapture, true);
            doc.addEventListener('touchend', this.handleTouchEndCapture, true);
            doc.addEventListener('mousedown', this.closeOnPressOutsideCapture, true);
        }

        let ancestors: (Element | Window | VisualViewport)[] = [];

        if (ancestorScroll) {
            if (isElement(domReferenceElement)) {
                ancestors = getOverflowAncestors(domReferenceElement);
            }

            if (isElement(floatingElement)) {
                ancestors = ancestors.concat(getOverflowAncestors(floatingElement));
            }

            if (!isElement(referenceElement) && referenceElement?.contextElement) {
                ancestors = ancestors.concat(getOverflowAncestors(referenceElement.contextElement));
            }
        }

        // Ignore the visual viewport for scrolling dismissal (allow pinch-zoom)
        ancestors = ancestors.filter((ancestor) => ancestor !== doc.defaultView?.visualViewport);

        for (const ancestor of ancestors) {
            ancestor.addEventListener('scroll', onScroll, { passive: true });
        }

        return () => {
            doc.removeEventListener('pointerdown', this.trackPointerType, true);

            if (escapeKey) {
                doc.removeEventListener('keydown', this.closeOnEscapeKeyDown);
                doc.removeEventListener('compositionstart', this.handleCompositionStart);
                doc.removeEventListener('compositionend', this.handleCompositionEnd);
            }

            if (outsidePress) {
                doc.removeEventListener('click', this.closeOnPressOutsideCapture, true);
                doc.removeEventListener('pointerdown', this.closeOnPressOutsideCapture, true);
                doc.removeEventListener('touchstart', this.handleTouchStartCapture, true);
                doc.removeEventListener('touchmove', this.handleTouchMoveCapture, true);
                doc.removeEventListener('touchend', this.handleTouchEndCapture, true);
                doc.removeEventListener('mousedown', this.closeOnPressOutsideCapture, true);
            }

            for (const ancestor of ancestors) {
                ancestor.removeEventListener('scroll', onScroll);
            }

            this.compositionTimeout.clear();
        };
    }

    private readonly handleCompositionStart = () => {
        this.compositionTimeout.clear();
        this.isComposing = true;
    };

    private readonly handleCompositionEnd = () => {
        // Safari fires `compositionend` before `keydown`, so we need to wait
        // until the next tick to set `isComposing` to `false`.
        // https://bugs.webkit.org/show_bug.cgi?id=165004
        this.compositionTimeout.start(
            // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
            isWebKit() ? 5 : 0,
            () => {
                this.isComposing = false;
            }
        );
    };

    private readonly clearInsideTree = () => {
        this.clearInsideTreeTimeout.clear();
        this.store.context.dataRef.current.insideReactTree = false;
    };

    private readonly markInsideTree = () => {
        this.store.context.dataRef.current.insideReactTree = true;
        this.clearInsideTreeTimeout.start(0, this.clearInsideTree);
    };

    private readonly trackPointerType = (event: PointerEvent) => {
        this.currentPointerType = event.pointerType;
    };

    private getOutsidePressEvent(): PressType {
        const { outsidePressEvent } = this.settings;
        const type = this.currentPointerType as 'pen' | 'mouse' | 'touch' | '';
        const computedType = type === 'pen' || !type ? 'mouse' : type;
        const resolved = typeof outsidePressEvent === 'function' ? outsidePressEvent() : outsidePressEvent;
        return typeof resolved === 'string' ? resolved : resolved[computedType];
    }

    private getChildren() {
        const { tree } = this.settings;
        const nodeId = this.store.context.dataRef.current.floatingContext?.nodeId;
        return tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
    }

    private readonly closeOnEscapeKeyDown = (event: KeyboardEvent) => {
        const { enabled, escapeKey, escapeKeyBubbles } = this.settings;
        if (!this.store.select('open') || !enabled || !escapeKey || event.key !== 'Escape') {
            return;
        }

        // Wait until IME is settled. Pressing `Escape` while composing should
        // close the compose menu, but not the floating element.
        if (this.isComposing) {
            return;
        }

        if (!escapeKeyBubbles) {
            const children = this.getChildren();
            if (children.some((child) => child.context?.open && !child.context.dataRef.current.__escapeKeyBubbles)) {
                return;
            }
        }

        const eventDetails = createChangeEventDetails(REASONS.escapeKey, getNativeEvent(event));

        this.store.setOpen(false, eventDetails);

        if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) {
            event.stopPropagation();
        }
    };

    private shouldIgnoreEvent(event: Event) {
        const computedOutsidePressEvent = this.getOutsidePressEvent();
        return (
            (computedOutsidePressEvent === 'intentional' && event.type !== 'click') ||
            (computedOutsidePressEvent === 'sloppy' && event.type === 'click')
        );
    }

    private closeOnPressOutside(event: MouseEvent | PointerEvent | TouchEvent, endedOrStartedInside = false) {
        const dataRef = this.store.context.dataRef;
        const { outsidePress, tree } = this.settings;

        if (this.shouldIgnoreEvent(event)) {
            this.clearInsideTree();
            return;
        }

        if (dataRef.current.insideReactTree) {
            this.clearInsideTree();
            return;
        }

        if (this.getOutsidePressEvent() === 'intentional' && endedOrStartedInside) {
            return;
        }

        if (typeof outsidePress === 'function' && !outsidePress(event)) {
            return;
        }

        const target = getTarget(event);
        const floatingElement = this.store.select('floatingElement');
        const inertSelector = `[${createAttribute('inert')}]`;
        const markers = getDocument(floatingElement).querySelectorAll(inertSelector);

        const triggers = this.store.context.triggerElements;

        // If another trigger is clicked, don't close the floating element.
        if (
            target &&
            (triggers.hasElement(target as Element) || triggers.hasMatchingElement((trigger) => contains(trigger, target as Element)))
        ) {
            return;
        }

        let targetRootAncestor = isElement(target) ? target : null;
        while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
            const nextParent = getParentNode(targetRootAncestor);
            if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
                break;
            }

            targetRootAncestor = nextParent;
        }

        // Check if the click occurred on a third-party element injected after the
        // floating element rendered.
        if (
            markers.length &&
            isElement(target) &&
            !isRootElement(target) &&
            // Clicked on a direct ancestor (e.g. FloatingOverlay).
            !contains(target, floatingElement) &&
            // If the target root element contains none of the markers, then the
            // element was injected after the floating element rendered.
            Array.from(markers).every((marker) => !contains(targetRootAncestor, marker))
        ) {
            return;
        }

        // Check if the click occurred on the scrollbar
        // Skip for touch events: scrollbars don't receive touch events on most platforms
        if (isHTMLElement(target) && !('touches' in event) && this.isScrollbarPress(target, event)) {
            return;
        }

        const nodeId = dataRef.current.floatingContext?.nodeId;
        const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
        const targetIsInsideChildren = children.some((node) => isEventTargetWithin(event, node.context?.elements.floating));

        if (
            isEventTargetWithin(event, floatingElement) ||
            isEventTargetWithin(event, this.store.select('domReferenceElement')) ||
            targetIsInsideChildren
        ) {
            return;
        }

        if (children.some((child) => child.context?.open && !child.context.dataRef.current.__outsidePressBubbles)) {
            return;
        }

        this.store.setOpen(false, createChangeEventDetails(REASONS.outsidePress, event));
        this.clearInsideTree();
    }

    private isScrollbarPress(target: HTMLElement, event: MouseEvent | PointerEvent) {
        const lastTraversableNode = isLastTraversableNode(target);
        const style = getComputedStyle(target);
        const scrollRe = /auto|scroll/;
        const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
        const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);

        const canScrollX = isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
        const canScrollY = isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;

        const isRTL = style.direction === 'rtl';

        // Check click position relative to scrollbar.
        const pressedVerticalScrollbar =
            canScrollY && (isRTL ? event.offsetX <= target.offsetWidth - target.clientWidth : event.offsetX > target.clientWidth);
        const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;

        return pressedVerticalScrollbar || pressedHorizontalScrollbar;
    }

    private isWithinElements(event: Event) {
        return (
            isEventTargetWithin(event, this.store.select('floatingElement')) ||
            isEventTargetWithin(event, this.store.select('domReferenceElement'))
        );
    }

    private handlePointerDown(event: PointerEvent) {
        if (
            this.getOutsidePressEvent() !== 'sloppy' ||
            event.pointerType === 'touch' ||
            !this.store.select('open') ||
            !this.settings.enabled ||
            this.isWithinElements(event)
        ) {
            return;
        }

        this.closeOnPressOutside(event);
    }

    private handleTouchStart(event: TouchEvent) {
        if (
            this.getOutsidePressEvent() !== 'sloppy' ||
            !this.store.select('open') ||
            !this.settings.enabled ||
            this.isWithinElements(event)
        ) {
            return;
        }

        const touch = event.touches[0];
        if (touch) {
            this.touchState = {
                startTime: Date.now(),
                startX: touch.clientX,
                startY: touch.clientY,
                dismissOnTouchEnd: false,
                dismissOnMouseDown: true
            };

            this.cancelDismissOnEndTimeout.start(1000, () => {
                if (this.touchState) {
                    this.touchState.dismissOnTouchEnd = false;
                    this.touchState.dismissOnMouseDown = false;
                }
            });
        }
    }

    private handleTouchMove(event: TouchEvent) {
        if (this.getOutsidePressEvent() !== 'sloppy' || !this.touchState || this.isWithinElements(event)) {
            return;
        }

        const touch = event.touches[0];
        if (!touch) {
            return;
        }

        const deltaX = Math.abs(touch.clientX - this.touchState.startX);
        const deltaY = Math.abs(touch.clientY - this.touchState.startY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance > 5) {
            this.touchState.dismissOnTouchEnd = true;
        }

        if (distance > 10) {
            this.closeOnPressOutside(event);
            this.cancelDismissOnEndTimeout.clear();
            this.touchState = null;
        }
    }

    private handleTouchEnd(event: TouchEvent) {
        if (this.getOutsidePressEvent() !== 'sloppy' || !this.touchState || this.isWithinElements(event)) {
            return;
        }

        if (this.touchState.dismissOnTouchEnd) {
            this.closeOnPressOutside(event);
        }

        this.cancelDismissOnEndTimeout.clear();
        this.touchState = null;
    }

    /**
     * Runs `handler` when the event reaches its target (after the capture phase),
     * so that handlers inside the tree get a chance to mark the event first.
     */
    private onTargetPhase<E extends Event>(event: E, handler: (event: E) => void) {
        const target = getTarget(event);
        const callback = () => {
            handler(event);
            target?.removeEventListener(event.type, callback);
        };
        target?.addEventListener(event.type, callback);
    }

    private readonly handleTouchStartCapture = (event: TouchEvent) => {
        this.onTargetPhase(event, (e) => this.handleTouchStart(e));
    };

    private readonly handleTouchMoveCapture = (event: TouchEvent) => {
        this.onTargetPhase(event, (e) => this.handleTouchMove(e));
    };

    private readonly handleTouchEndCapture = (event: TouchEvent) => {
        this.onTargetPhase(event, (e) => this.handleTouchEnd(e));
    };

    private readonly closeOnPressOutsideCapture = (event: PointerEvent | MouseEvent) => {
        // When click outside is lazy (`up` event), handle dragging.
        // Don't close if:
        // - The click started inside the floating element.
        // - The click ended inside the floating element.
        const endedOrStartedInside = this.endedOrStartedInside;
        this.endedOrStartedInside = false;

        this.cancelDismissOnEndTimeout.clear();

        if (event.type === 'mousedown' && this.touchState && !this.touchState.dismissOnMouseDown) {
            return;
        }

        this.onTargetPhase(event, (e) => {
            if (e.type === 'pointerdown') {
                this.handlePointerDown(e as PointerEvent);
            } else {
                this.closeOnPressOutside(e, endedOrStartedInside);
            }
        });
    };

    private readonly handlePressedInside = (event: MouseEvent) => {
        const target = getTarget(getNativeEvent(event)) as Element | null;
        if (!contains(this.store.select('floatingElement'), target) || event.button !== 0) {
            return;
        }
        this.endedOrStartedInside = true;
    };
}
