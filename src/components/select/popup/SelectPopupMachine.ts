import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { COMPOSITE_KEYS } from '~@components/composite/utils/compositeKeys';
import { isMouseWithinBounds } from '~@dom/isMouseWithinBounds';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { clamp } from '~@lib/clamp';
import { isWebKit } from '~@lib/detectBrowser';
import { ownerDocument, ownerWindow } from '~@lib/owner';
import { FocusManager } from '~@packages/floating-ui/FocusManager';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { mergeProps } from '~@props/mergeProps';
import { AnimationFrame } from '~@timers/AnimationFrame';
import { Timeout } from '~@timers/Timeout';

import type { Align, Side, Style, TransitionStatus } from '~@lib/types';
import type { FocusTarget } from '~@packages/floating-ui/FocusManager';
import type { Props } from '~@props/mergeProps';

import { LIST_FUNCTIONAL_STYLES, SELECT_DISABLE_SCROLLBAR_CLASS } from '../utils/constants';
import { clearStyles, getMaxPopupHeight, getMaxScrollTop, unsetTransformStyles } from '../utils/popupUtils';

import type { SelectPositionerMachine } from '../positioner/SelectPositionerMachine';
import type { SelectRootMachine } from '../root/SelectRootMachine';

const SCROLL_EPS_PX = 1;

export type SelectPopupState = {
    side: Side | 'none';
    align: Align;
    open: boolean;
    transitionStatus: TransitionStatus;
};

export type SelectPopupOptions = {
    finalFocus?: FocusTarget | undefined;
};

export type SelectPopupSetup = {
    positioner: SelectPositionerMachine;
    /**
     * @default false
     */
    insideToolbar?: boolean | undefined;
    /**
     * `ReactDOM.flushSync` in React.
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

/**
 * State machine of `Select.Popup`: placement of the popup over the trigger (aligning the selected
 * item's text with the trigger's value, growing while scrolling), focus management and the popup's props.
 */
export class SelectPopupMachine {
    readonly focusManager: FocusManager;

    private options: SelectPopupOptions;

    private readonly root: SelectRootMachine;

    private readonly setup: SelectPopupSetup;

    private initialHeight = 0;

    private reachedMaxHeight = false;

    private initialPlaced = false;

    private originalPositionerStyles: Style = {};

    private readonly scrollArrowFrame = new AnimationFrame();

    private readonly highlightTimeout = new Timeout();

    private readonly initialPlacedTimeout = new Timeout();

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly originalStylesEffect = new Effect(() => this.captureOriginalStyles());

    private readonly resetEffect = new Effect(() => this.resetPlacement());

    private readonly placementEffect = new Effect(() => this.placePopup());

    private readonly resizeEffect = new Effect(() => this.closeOnResize());

    private readonly unsubscribers: (() => void)[] = [];

    constructor(root: SelectRootMachine, setup: SelectPopupSetup, options: SelectPopupOptions = {}) {
        this.root = root;
        this.setup = setup;
        this.options = options;
        this.focusManager = new FocusManager(root.floatingRoot, this.getFocusManagerOptions());
        this.openChangeComplete = new OpenChangeComplete(root.refs.popupRef, () => {
            if (root.store.state.open) {
                root.refs.scrollHandlerRef.current = this.handleScroll;
            }
        });
        root.refs.scrollHandlerRef.current = this.handleScroll;
        this.unsubscribers.push(
            root.store.subscribe(() => this.sync()),
            setup.positioner.store.subscribe(() => this.sync())
        );
        this.sync();
    }

    setOptions(options: SelectPopupOptions) {
        this.options = options;
        this.sync();
    }

    setElement = (element: HTMLElement | null) => {
        this.root.refs.popupRef.current = element;
        this.sync();
    };

    getState(): SelectPopupState {
        const positionerState = this.setup.positioner.getState();
        return {
            side: positionerState.side,
            align: positionerState.align,
            open: this.root.store.state.open,
            transitionStatus: this.root.store.state.transitionStatus
        };
    }

    static attrs(state: SelectPopupState) {
        return getStyleHookProps(state, { ...popupStateMapping, ...transitionStatusMapping });
    }

    getPopupProps(elementProps: Props = {}): Props {
        const { root } = this;
        const { store, refs } = root;
        const { listElement, id, popupProps, transitionStatus } = store.state;
        const alignItemWithTriggerActive = this.setup.positioner.alignItemWithTriggerActive;

        const defaultProps: Props = {
            ...(listElement
                ? { role: 'presentation', 'aria-orientation': undefined }
                : { role: 'listbox', 'aria-multiselectable': root.multiple || undefined, id: `${id}-list` }),
            onKeyDown: (event: KeyboardEvent) => {
                refs.keyboardActiveRef.current = true;
                if (this.setup.insideToolbar && COMPOSITE_KEYS.has(event.key)) {
                    event.stopPropagation();
                }
            },
            onMouseMove: () => {
                refs.keyboardActiveRef.current = false;
            },
            onPointerLeave: (event: PointerEvent) => {
                if (!root.highlightItemOnHover || isMouseWithinBounds(event) || event.pointerType === 'touch') {
                    return;
                }
                const popup = event.currentTarget as HTMLElement;
                this.highlightTimeout.start(0, () => {
                    store.set('activeIndex', null);
                    popup.focus({ preventScroll: true });
                });
            },
            onScroll: (event: { currentTarget: EventTarget | null }) => {
                if (!store.state.listElement) {
                    this.handleScroll(event.currentTarget as HTMLElement);
                }
            },
            ...(alignItemWithTriggerActive && { style: listElement ? { height: '100%' } : LIST_FUNCTIONAL_STYLES })
        };

        return mergeProps(
            popupProps,
            defaultProps,
            getDisabledMountTransitionStyles(transitionStatus),
            { className: !listElement && alignItemWithTriggerActive ? SELECT_DISABLE_SCROLLBAR_CLASS : undefined },
            elementProps
        );
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.originalStylesEffect.destroy();
        this.resetEffect.destroy();
        this.placementEffect.destroy();
        this.resizeEffect.destroy();
        this.focusManager.destroy();
        this.openChangeComplete.destroy();
        this.scrollArrowFrame.cancel();
        this.highlightTimeout.clear();
        this.initialPlacedTimeout.clear();
    }

    /**
     * Grows the aligned popup while scrolling and updates the scroll arrows.
     */
    handleScroll = (scroller: HTMLElement) => {
        const { root } = this;
        const positionerElement = root.store.state.positionerElement;
        const popupElement = root.refs.popupRef.current;
        if (!positionerElement || !popupElement || !this.initialPlaced) {
            return;
        }
        if (this.reachedMaxHeight || !this.setup.positioner.alignItemWithTriggerActive) {
            root.handleScrollArrowVisibility();
            return;
        }

        const isTopPositioned = positionerElement.style.top === '0px';
        const isBottomPositioned = positionerElement.style.bottom === '0px';
        const currentHeight = positionerElement.getBoundingClientRect().height;
        const doc = ownerDocument(positionerElement);
        const win = ownerWindow(positionerElement);
        const positionerStyles = win.getComputedStyle(positionerElement);
        const marginTop = Number.parseFloat(positionerStyles.marginTop);
        const marginBottom = Number.parseFloat(positionerStyles.marginBottom);
        const maxPopupHeight = getMaxPopupHeight(win.getComputedStyle(popupElement));
        const maxAvailableHeight = Math.min(doc.documentElement.clientHeight - marginTop - marginBottom, maxPopupHeight);
        const scrollTop = scroller.scrollTop;
        const maxScrollTop = getMaxScrollTop(scroller);

        let nextPositionerHeight = 0;
        let nextScrollTop: number | null = null;
        let setReachedMax = false;
        let scrollToMax = false;

        const setHeight = (height: number) => {
            positionerElement.style.height = `${height}px`;
        };

        const handleSmallDiff = (diff: number, targetScrollTop: number) => {
            const heightDelta = clamp(diff, 0, maxAvailableHeight - currentHeight);
            if (heightDelta > 0) {
                setHeight(currentHeight + heightDelta);
            }
            scroller.scrollTop = targetScrollTop;
            if (maxAvailableHeight - (currentHeight + heightDelta) <= SCROLL_EPS_PX) {
                this.reachedMaxHeight = true;
            }
            root.handleScrollArrowVisibility();
        };

        if (isTopPositioned) {
            const diff = maxScrollTop - scrollTop;
            const nextHeight = Math.min(currentHeight + diff, maxAvailableHeight);
            nextPositionerHeight = nextHeight;
            if (diff <= SCROLL_EPS_PX) {
                handleSmallDiff(diff, maxScrollTop);
                return;
            }
            if (maxAvailableHeight - nextHeight > SCROLL_EPS_PX) {
                scrollToMax = true;
            } else {
                setReachedMax = true;
            }
        } else if (isBottomPositioned) {
            const diff = scrollTop;
            const idealHeight = currentHeight + diff;
            const nextHeight = Math.min(idealHeight, maxAvailableHeight);
            const overshoot = idealHeight - maxAvailableHeight;
            nextPositionerHeight = nextHeight;
            if (diff <= SCROLL_EPS_PX) {
                handleSmallDiff(diff, 0);
                return;
            }
            if (maxAvailableHeight - nextHeight > SCROLL_EPS_PX) {
                nextScrollTop = 0;
            } else {
                setReachedMax = true;
                if (scrollTop < maxScrollTop) {
                    nextScrollTop = scrollTop - (diff - overshoot);
                }
            }
        }

        nextPositionerHeight = Math.ceil(nextPositionerHeight);
        if (nextPositionerHeight !== 0) {
            setHeight(nextPositionerHeight);
        }

        if (scrollToMax || nextScrollTop != null) {
            // Recompute bounds after resizing (clientHeight likely changed).
            const nextMaxScrollTop = getMaxScrollTop(scroller);
            const target = scrollToMax ? nextMaxScrollTop : clamp(nextScrollTop ?? 0, 0, nextMaxScrollTop);
            // Avoid adjustments that re-trigger scroll events forever.
            if (Math.abs(scroller.scrollTop - target) > SCROLL_EPS_PX) {
                scroller.scrollTop = target;
            }
        }

        if (setReachedMax || nextPositionerHeight >= maxAvailableHeight - SCROLL_EPS_PX) {
            this.reachedMaxHeight = true;
        }
        root.handleScrollArrowVisibility();
    };

    private getFocusManagerOptions() {
        return {
            modal: false,
            disabled: !this.root.store.state.mounted,
            returnFocus: this.options.finalFocus,
            restoreFocus: true
        };
    }

    private sync() {
        const { store, refs } = this.root;
        const { open, positionerElement, triggerElement, listElement } = store.state;
        const alignActive = this.setup.positioner.alignItemWithTriggerActive;

        this.focusManager.setOptions(this.getFocusManagerOptions());
        this.openChangeComplete.sync(open);
        this.originalStylesEffect.sync([positionerElement, refs.popupRef.current]);
        this.resetEffect.sync([open, alignActive, positionerElement]);
        this.placementEffect.sync([open, positionerElement, triggerElement, refs.popupRef.current, alignActive, listElement]);
        this.resizeEffect.sync([alignActive, positionerElement, open]);
    }

    private captureOriginalStyles() {
        const positionerElement = this.root.store.state.positionerElement;
        if (!positionerElement || !this.root.refs.popupRef.current || Object.keys(this.originalPositionerStyles).length) {
            return;
        }
        const { style } = positionerElement;
        this.originalPositionerStyles = {
            top: style.top || '0',
            left: style.left || '0',
            right: style.right,
            height: style.height,
            bottom: style.bottom,
            minHeight: style.minHeight,
            maxHeight: style.maxHeight,
            marginTop: style.marginTop,
            marginBottom: style.marginBottom
        };
        return;
    }

    private resetPlacement() {
        if (this.root.store.state.open || this.setup.positioner.alignItemWithTriggerActive) {
            return;
        }
        this.initialPlaced = false;
        this.reachedMaxHeight = false;
        this.initialHeight = 0;
        clearStyles(this.root.store.state.positionerElement, this.originalPositionerStyles);
        return;
    }

    private closeOnResize() {
        const { positionerElement, open } = this.root.store.state;
        if (!this.setup.positioner.alignItemWithTriggerActive || !positionerElement || !open) {
            return;
        }
        const win = ownerWindow(positionerElement);
        const handleResize = (event: UIEvent) => {
            this.root.setOpen(false, createChangeEventDetails(REASONS.windowResize, event));
        };
        win.addEventListener('resize', handleResize);
        return () => win.removeEventListener('resize', handleResize);
    }

    private placePopup() {
        const { root } = this;
        const { store, refs } = root;
        const popupElement = refs.popupRef.current;
        const { open, triggerElement, positionerElement, transitionStatus } = store.state;

        if (!open || !triggerElement || !positionerElement || !popupElement || transitionStatus === 'ending') {
            return;
        }

        if (!this.setup.positioner.alignItemWithTriggerActive) {
            this.initialPlaced = true;
            this.scrollArrowFrame.request(root.handleScrollArrowVisibility);
            popupElement.style.removeProperty('--transform-origin');
            return;
        }

        // Wait for the selected item's text element to be registered.
        queueMicrotask(() => this.alignWithTrigger(popupElement, triggerElement, positionerElement));
        return;
    }

    private alignWithTrigger(popupElement: HTMLElement, triggerElement: HTMLElement, positionerElement: HTMLElement) {
        const { root } = this;
        const { refs, store } = root;
        // Remove transforms that would affect the location of the popup and therefore the calculations.
        const restoreTransformStyles = unsetTransformStyles(popupElement);
        popupElement.style.removeProperty('--transform-origin');

        try {
            const win = ownerWindow(positionerElement);
            const positionerStyles = win.getComputedStyle(positionerElement);
            const popupStyles = win.getComputedStyle(popupElement);
            const doc = ownerDocument(triggerElement);
            const triggerRect = triggerElement.getBoundingClientRect();
            const positionerRect = positionerElement.getBoundingClientRect();
            const triggerX = triggerRect.left;
            const triggerHeight = triggerRect.height;
            const scroller = store.state.listElement || popupElement;
            const scrollHeight = scroller.scrollHeight;
            const borderBottom = Number.parseFloat(popupStyles.borderBottomWidth);
            const marginTop = Number.parseFloat(positionerStyles.marginTop) || 10;
            const marginBottom = Number.parseFloat(positionerStyles.marginBottom) || 10;
            const minHeight = Number.parseFloat(positionerStyles.minHeight) || 100;
            const maxPopupHeight = getMaxPopupHeight(popupStyles);
            const paddingLeft = 5;
            const paddingRight = 5;
            const triggerCollisionThreshold = 20;
            const viewportHeight = doc.documentElement.clientHeight - marginTop - marginBottom;
            const viewportWidth = doc.documentElement.clientWidth;
            const availableSpaceBeneathTrigger = viewportHeight - triggerRect.bottom + triggerHeight;

            const textElement = refs.selectedItemTextRef.current;
            const valueElement = refs.valueRef.current;
            let textRect: DOMRect | undefined;
            let offsetX = 0;
            let offsetY = 0;

            if (textElement && valueElement) {
                const valueRect = valueElement.getBoundingClientRect();
                textRect = textElement.getBoundingClientRect();
                const valueLeftFromTriggerLeft = valueRect.left - triggerX;
                const textLeftFromPositionerLeft = textRect.left - positionerRect.left;
                const valueCenterFromPositionerTop = valueRect.top - triggerRect.top + valueRect.height / 2;
                const textCenterFromTriggerTop = textRect.top - positionerRect.top + textRect.height / 2;
                offsetX = valueLeftFromTriggerLeft - textLeftFromPositionerLeft;
                offsetY = textCenterFromTriggerTop - valueCenterFromPositionerTop;
            }

            const idealHeight = availableSpaceBeneathTrigger + offsetY + marginBottom + borderBottom;
            let height = Math.min(viewportHeight, idealHeight);
            const maxHeight = viewportHeight - marginTop - marginBottom;
            const scrollTop = idealHeight - height;
            const left = Math.max(paddingLeft, triggerX + offsetX);
            const maxRight = viewportWidth - paddingRight;
            const rightOverflow = Math.max(0, left + positionerRect.width - maxRight);

            positionerElement.style.left = `${left - rightOverflow}px`;
            positionerElement.style.height = `${height}px`;
            positionerElement.style.maxHeight = 'auto';
            positionerElement.style.marginTop = `${marginTop}px`;
            positionerElement.style.marginBottom = `${marginBottom}px`;
            popupElement.style.height = '100%';

            const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
            const isTopPositioned = scrollTop >= maxScrollTop;
            if (isTopPositioned) {
                height = Math.min(viewportHeight, positionerRect.height) - (scrollTop - maxScrollTop);
            }

            // Too close to the viewport edges, too short or pinch-zoomed Safari: align the popup to the trigger instead.
            const fallbackToAlignPopupToTrigger =
                triggerRect.top < triggerCollisionThreshold ||
                triggerRect.bottom > viewportHeight - triggerCollisionThreshold ||
                height < Math.min(scrollHeight, minHeight);
            const isPinchZoomed = (win.visualViewport?.scale ?? 1) !== 1 && isWebKit;

            if (fallbackToAlignPopupToTrigger || isPinchZoomed) {
                this.initialPlaced = true;
                clearStyles(positionerElement, this.originalPositionerStyles);
                const flush = this.setup.flushSync ?? ((fn: () => void) => fn());
                flush(() => this.setup.positioner.setControlledAlignItemWithTrigger(false));
                return;
            }

            if (isTopPositioned) {
                const topOffset = Math.max(0, viewportHeight - idealHeight);
                positionerElement.style.top = positionerRect.height >= maxHeight ? '0' : `${topOffset}px`;
                positionerElement.style.height = `${height}px`;
                scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
                this.initialHeight = Math.max(minHeight, height);
            } else {
                positionerElement.style.bottom = '0';
                this.initialHeight = Math.max(minHeight, height);
                scroller.scrollTop = scrollTop;
            }

            if (textRect) {
                const popupTop = positionerRect.top;
                const popupHeight = positionerRect.height;
                const textCenterY = textRect.top + textRect.height / 2;
                const transformOriginY = popupHeight > 0 ? ((textCenterY - popupTop) / popupHeight) * 100 : 50;
                popupElement.style.setProperty('--transform-origin', `50% ${clamp(transformOriginY, 0, 100)}%`);
            }

            if (this.initialHeight === viewportHeight || height >= maxPopupHeight) {
                this.reachedMaxHeight = true;
            }

            root.handleScrollArrowVisibility();
            // Avoid the scroll logic running before the popup is placed.
            this.initialPlacedTimeout.start(0, () => {
                this.initialPlaced = true;
            });
        } finally {
            restoreTransformStyles();
        }
    }
}
