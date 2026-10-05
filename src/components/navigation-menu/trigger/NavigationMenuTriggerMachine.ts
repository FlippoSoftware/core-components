import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { pressableTriggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { runOnceAnimationsFinish } from '~@dom/animations';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { PATIENT_CLICK_THRESHOLD } from '~@lib/constants';
import { getCssDimensions } from '~@lib/getCssDimensions';
import { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import { ClickInteraction } from '~@packages/floating-ui/interactions/ClickInteraction';
import { HoverInteraction } from '~@packages/floating-ui/interactions/hover/HoverInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { safePolygon } from '~@packages/floating-ui/safePolygon';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { contains } from '~@packages/floating-ui/utils/element';
import { getNativeEvent, stopEvent } from '~@packages/floating-ui/utils/event';
import { getNextTabbable, getPreviousTabbable, isOutsideEvent } from '~@packages/floating-ui/utils/tabbable';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';
import { mergeProps } from '~@props/mergeProps';
import { AnimationFrame } from '~@timers/AnimationFrame';
import { Timeout } from '~@timers/Timeout';

import type { Props } from '~@props/mergeProps';

import { NavigationMenuPopupCssVars } from '../popup/NavigationMenuPopupCssVars';
import { NavigationMenuPositionerCssVars } from '../positioner/NavigationMenuPositionerCssVars';
import { NAVIGATION_MENU_TRIGGER_IDENTIFIER } from '../utils/constants';
import { isOutsideMenuEvent } from '../utils/isOutsideMenuEvent';

import type { NavigationMenuChangeEventDetails, NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

const DEFAULT_SIZE = { width: 0, height: 0 };

type TriggerEvent = (MouseEvent | KeyboardEvent) & { nativeEvent?: Event };

type FocusGuardEvent = FocusEvent | { nativeEvent: FocusEvent; relatedTarget: EventTarget | null };

export type NavigationMenuTriggerOptions = {
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    nativeButton?: boolean | undefined;
};

/**
 * State machine of `NavigationMenu.Trigger`: opens its item's content on hover or click, animates the popup
 * size between contents, keyboard opening and the focus guards around the active trigger.
 */
export class NavigationMenuTriggerMachine {
    readonly button: ButtonMachine;

    readonly floatingRoot: FloatingRootStore;

    private options: NavigationMenuTriggerOptions;

    private readonly root: NavigationMenuRootMachine;

    private readonly itemValue: unknown;

    private readonly hover: HoverInteraction;

    private readonly click: ClickInteraction;

    private triggerElement: HTMLElement | null = null;

    private stickIfOpen = true;

    private pointerType = '';

    private allowFocus = false;

    private prevSize = DEFAULT_SIZE;

    private animationAbortController: AbortController | null = null;

    private readonly stickIfOpenTimeout = new Timeout();

    private readonly focusFrame = new AnimationFrame();

    private readonly sizeFrame1 = new AnimationFrame();

    private readonly sizeFrame2 = new AnimationFrame();

    private readonly animationFrame = new AnimationFrame();

    private readonly handleClose = safePolygon({ blockPointerEvents: true });

    private readonly handleCloseTouch = safePolygon({ blockPointerEvents: false });

    private wasActive = false;

    private readonly resizeObserverEffect = new Effect(() => this.observePopupSize());

    private readonly mutationObserverEffect = new Effect(() => this.observePopupContent());

    private readonly focusEffect = new Effect(() => this.focusAfterKeyboardOpen());

    private readonly activeEffect = new Effect(() => this.registerAsActive());

    private readonly unsubscribers: (() => void)[];

    constructor(root: NavigationMenuRootMachine, itemValue: unknown, options: NavigationMenuTriggerOptions = {}) {
        this.root = root;
        this.itemValue = itemValue;
        this.options = options;
        this.button = new ButtonMachine({ disabled: options.disabled, focusableWhenDisabled: true, native: options.nativeButton });
        this.floatingRoot = new FloatingRootStore({
            open: root.open,
            referenceElement: null,
            floatingElement: null,
            triggerElements: new PopupTriggerMap(),
            floatingId: undefined,
            nested: false,
            noEmit: false,
            onOpenChange: this.handleOpenChange as never
        });
        this.hover = new HoverInteraction(this.floatingRoot, this.getHoverOptions());
        this.click = new ClickInteraction(this.floatingRoot, this.getClickOptions());
        this.unsubscribers = [root.store.subscribe(() => this.sync()), root.transitions.store.subscribe(() => this.sync())];
        this.sync();
    }

    setOptions(options: NavigationMenuTriggerOptions) {
        this.options = options;
        this.button.setOptions({ disabled: options.disabled, focusableWhenDisabled: true, native: options.nativeButton });
    }

    setElement = (element: HTMLElement | null) => {
        this.triggerElement = element;
        this.button.setElement(element);
        this.sync();
    };

    get isActiveItem(): boolean {
        return this.root.open && this.root.store.state.value === this.itemValue;
    }

    getState(): { open: boolean } {
        return { open: this.isActiveItem };
    }

    static attrs(state: { open: boolean }) {
        return getStyleHookProps(state, pressableTriggerOpenStateMapping);
    }

    /**
     * Whether the adapter renders the focus guards (and the `aria-owns` span) after the trigger.
     */
    shouldRenderFocusGuards(): boolean {
        return this.isActiveItem;
    }

    /**
     * Props of the visually hidden span owning the viewport (`aria-owns`).
     */
    getOwnerProps(): Props {
        return { 'aria-owns': this.root.store.state.viewportElement?.id };
    }

    /**
     * @param dismissReferenceProps Reference props of the list's dismiss interaction.
     */
    getTriggerProps(elementProps: Props = {}, dismissReferenceProps?: Props): Props {
        const { root } = this;
        const { popupElement, positionerElement } = root.store.state;
        const isActiveItem = this.isActiveItem;
        const setPointerType = (event: { pointerType: string }) => {
            this.pointerType = event.pointerType;
            this.hover.setOptions(this.getHoverOptions());
        };

        return mergeProps(
            mergeInteractionProps(undefined, [this.hover.getProps(), this.click.getProps()], 'reference'),
            dismissReferenceProps,
            {
                tabIndex: 0,
                onMouseEnter: this.handleOpenEvent,
                onClick: this.handleOpenEvent,
                onPointerEnter: setPointerType,
                onPointerDown: setPointerType,
                'aria-expanded': isActiveItem,
                'aria-controls': isActiveItem ? popupElement?.id : undefined,
                [NAVIGATION_MENU_TRIGGER_IDENTIFIER]: '',
                onFocus: () => {
                    if (isActiveItem) {
                        root.store.set('viewportInert', false);
                    }
                },
                onMouseMove: () => {
                    this.allowFocus = false;
                },
                onKeyDown: (event: KeyboardEvent) => {
                    this.allowFocus = true;
                    // Nested triggers leave arrow keys to the parent content's composite navigation.
                    if (root.nested) {
                        return;
                    }
                    const openHorizontal = root.orientation === 'horizontal' && event.key === 'ArrowDown';
                    const openVertical = root.orientation === 'vertical' && event.key === 'ArrowRight';
                    if (openHorizontal || openVertical) {
                        root.setValue(this.itemValue, createChangeEventDetails(REASONS.listNavigation, getNativeEvent(event)));
                        this.handleOpenEvent(event);
                        stopEvent(event);
                    }
                },
                onBlur: (event: FocusEvent) => {
                    if (
                        positionerElement &&
                        popupElement &&
                        isOutsideMenuEvent(
                            { currentTarget: event.currentTarget as Element | null, relatedTarget: event.relatedTarget as Element | null },
                            { popupElement, rootRef: root.rootRef, tree: root.tree, nodeId: root.nodeId }
                        )
                    ) {
                        root.setValue(null, createChangeEventDetails(REASONS.focusOut, getNativeEvent(event)));
                    }
                }
            },
            elementProps,
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    /**
     * Ref callback of the guard before the active trigger's popup.
     */
    setBeforeOutsideGuard = (element: HTMLElement | null) => {
        this.root.beforeOutsideRef.current = element;
    };

    setAfterOutsideGuard = (element: HTMLElement | null) => {
        this.root.afterOutsideRef.current = element;
    };

    onBeforeOutsideGuardFocus = (event: FocusGuardEvent) => {
        const referenceElement = this.referenceElement;
        if (referenceElement && isOutsideEvent(getNativeEvent(event as FocusEvent), referenceElement)) {
            this.root.beforeInsideRef.current?.focus();
        } else {
            getPreviousTabbable(this.triggerElement)?.focus();
        }
    };

    onAfterOutsideGuardFocus = (event: FocusGuardEvent) => {
        const { root } = this;
        const referenceElement = this.referenceElement;
        const nativeEvent = getNativeEvent(event as FocusEvent);
        if (referenceElement && isOutsideEvent(nativeEvent, referenceElement)) {
            const afterInside = root.afterInsideRef.current;
            const elementToFocus = afterInside && afterInside.tabIndex >= 0 ? afterInside : this.triggerElement;
            elementToFocus?.focus();
            return;
        }
        const nextTabbable = getNextTabbable(this.triggerElement);
        nextTabbable?.focus();
        if (!contains(root.rootRef.current, nextTabbable)) {
            root.setValue(null, createChangeEventDetails(REASONS.focusOut, nativeEvent));
        }
    };

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.hover.destroy();
        this.click.destroy();
        for (const effect of [this.resizeObserverEffect, this.mutationObserverEffect, this.focusEffect, this.activeEffect]) {
            effect.destroy();
        }
        this.stickIfOpenTimeout.clear();
        this.focusFrame.cancel();
        this.sizeFrame1.cancel();
        this.sizeFrame2.cancel();
        this.animationFrame.cancel();
        this.animationAbortController?.abort();
    }

    private get referenceElement() {
        const { positionerElement, viewportElement } = this.root.store.state;
        return positionerElement || viewportElement;
    }

    private get interactionsEnabled() {
        const { positionerElement, value } = this.root.store.state;
        return positionerElement ? true : !value;
    }

    private getHoverOptions() {
        const mounted = this.root.transitions.state.mounted;
        return {
            move: false,
            handleClose: this.pointerType === 'touch' ? this.handleCloseTouch : this.handleClose,
            restMs: mounted && this.root.store.state.positionerElement ? 0 : this.root.delay,
            delay: { close: this.root.closeDelay }
        };
    }

    private getClickOptions() {
        return { enabled: this.interactionsEnabled, stickIfOpen: this.stickIfOpen, toggle: this.isActiveItem };
    }

    private readonly handleOpenChange = (nextOpen: boolean, eventDetails: NavigationMenuChangeEventDetails) => {
        const { root } = this;
        const isHover = eventDetails.reason === REASONS.triggerHover;
        if (!this.interactionsEnabled) {
            return;
        }
        if (this.pointerType === 'touch' && isHover) {
            return;
        }
        if (!nextOpen && root.store.state.value !== this.itemValue) {
            return;
        }

        if (isHover) {
            // Only allow "patient" clicks to close the popup if it's open.
            this.stickIfOpen = true;
            this.stickIfOpenTimeout.clear();
            this.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
                this.stickIfOpen = false;
                this.click.setOptions(this.getClickOptions());
            });
        }

        if (nextOpen) {
            root.setValue(this.itemValue, eventDetails);
        } else {
            root.setValue(null, eventDetails);
            this.pointerType = '';
        }
    };

    private readonly handleOpenEvent = (event: TriggerEvent) => {
        const { popupElement, positionerElement } = this.root.store.state;
        // Nested menus without positioner/popup open without size calculations.
        if (!popupElement || !positionerElement) {
            this.handleActivation(event);
            return;
        }
        const { width, height } = getCssDimensions(popupElement);
        this.handleActivation(event);
        this.handleValueChange(width, height);
    };

    private handleActivation(event: TriggerEvent) {
        const { root } = this;
        const prevTriggerRect = root.prevTriggerElementRef.current?.getBoundingClientRect();
        const triggerElement = this.triggerElement;

        if (root.transitions.state.mounted && prevTriggerRect && triggerElement) {
            const nextTriggerRect = triggerElement.getBoundingClientRect();
            if (root.orientation === 'horizontal' && nextTriggerRect.left !== prevTriggerRect.left) {
                root.store.set('activationDirection', nextTriggerRect.left > prevTriggerRect.left ? 'right' : 'left');
            } else if (root.orientation === 'vertical' && nextTriggerRect.top !== prevTriggerRect.top) {
                root.store.set('activationDirection', nextTriggerRect.top > prevTriggerRect.top ? 'down' : 'up');
            }
        }

        // Reset the open event when the active item changes so a click -> hover elsewhere -> hover back
        // doesn't leave the popup stuck open.
        if (event.type !== 'click') {
            this.floatingRoot.context.dataRef.current.openEvent = undefined;
        }

        if (this.pointerType === 'touch' && event.type !== 'click') {
            return;
        }

        if (root.store.state.value != null) {
            root.setValue(
                this.itemValue,
                createChangeEventDetails(
                    event.type === 'mouseenter' ? REASONS.triggerHover : REASONS.triggerPress,
                    getNativeEvent(event as MouseEvent)
                )
            );
        }
    }

    private setAutoSizes = () => {
        const popupElement = this.root.store.state.popupElement;
        popupElement?.style.setProperty(NavigationMenuPopupCssVars.popupWidth, 'auto');
        popupElement?.style.setProperty(NavigationMenuPopupCssVars.popupHeight, 'auto');
    };

    /**
     * Animates the popup from its current size to the new content's size.
     */
    private handleValueChange(currentWidth: number, currentHeight: number) {
        const { popupElement, positionerElement } = this.root.store.state;
        if (!popupElement || !positionerElement) {
            return;
        }

        popupElement.style.removeProperty(NavigationMenuPopupCssVars.popupWidth);
        popupElement.style.removeProperty(NavigationMenuPopupCssVars.popupHeight);
        positionerElement.style.removeProperty(NavigationMenuPositionerCssVars.positionerWidth);
        positionerElement.style.removeProperty(NavigationMenuPositionerCssVars.positionerHeight);

        const { width, height } = getCssDimensions(popupElement);
        const measuredWidth = width || this.prevSize.width;
        const measuredHeight = height || this.prevSize.height;
        let fromWidth = currentWidth;
        let fromHeight = currentHeight;
        if (fromHeight === 0 || fromWidth === 0) {
            fromWidth = measuredWidth;
            fromHeight = measuredHeight;
        }

        popupElement.style.setProperty(NavigationMenuPopupCssVars.popupWidth, `${fromWidth}px`);
        popupElement.style.setProperty(NavigationMenuPopupCssVars.popupHeight, `${fromHeight}px`);
        positionerElement.style.setProperty(NavigationMenuPositionerCssVars.positionerWidth, `${measuredWidth}px`);
        positionerElement.style.setProperty(NavigationMenuPositionerCssVars.positionerHeight, `${measuredHeight}px`);

        this.sizeFrame1.request(() => {
            popupElement.style.setProperty(NavigationMenuPopupCssVars.popupWidth, `${measuredWidth}px`);
            popupElement.style.setProperty(NavigationMenuPopupCssVars.popupHeight, `${measuredHeight}px`);
            this.sizeFrame2.request(() => {
                this.animationAbortController = new AbortController();
                runOnceAnimationsFinish(popupElement, this.setAutoSizes, {
                    signal: this.animationAbortController.signal,
                    frame: this.animationFrame
                });
            });
        });
    }

    private sync() {
        const { root } = this;
        const { open, store, transitions } = root;
        const { positionerElement, viewportElement, popupElement } = store.state;
        const isActiveItem = this.isActiveItem;

        if (isActiveItem !== this.wasActive) {
            this.wasActive = isActiveItem;
            this.animationAbortController?.abort();
            if (isActiveItem && open && popupElement) {
                this.handleValueChange(0, 0);
            }
        }

        if (!open) {
            this.stickIfOpenTimeout.clear();
            this.sizeFrame1.cancel();
            this.sizeFrame2.cancel();
        }
        if (!transitions.state.mounted) {
            this.prevSize = DEFAULT_SIZE;
        }

        this.floatingRoot.update({
            open,
            referenceElement: this.triggerElement,
            domReferenceElement: this.triggerElement,
            floatingElement: positionerElement || viewportElement
        });
        this.hover.setOptions(this.getHoverOptions());
        this.click.setOptions(this.getClickOptions());

        this.resizeObserverEffect.sync([popupElement]);
        this.mutationObserverEffect.sync([popupElement, positionerElement, isActiveItem]);
        this.focusEffect.sync([isActiveItem, open, popupElement]);
        this.activeEffect.sync([isActiveItem, this.triggerElement]);
    }

    private observePopupSize() {
        const popupElement = this.root.store.state.popupElement;
        if (!popupElement || typeof ResizeObserver !== 'function') {
            return;
        }
        // `getCssDimensions` would cause issues here due to fractional values.
        const resizeObserver = new ResizeObserver(() => {
            this.prevSize = { width: popupElement.offsetWidth, height: popupElement.offsetHeight };
        });
        resizeObserver.observe(popupElement);
        return () => resizeObserver.disconnect();
    }

    private observePopupContent() {
        const popupElement = this.root.store.state.popupElement;
        if (!popupElement || !this.isActiveItem || typeof MutationObserver !== 'function') {
            return;
        }
        const mutationObserver = new MutationObserver(() => {
            this.animationAbortController?.abort();
            this.handleValueChange(this.prevSize.width, this.prevSize.height);
        });
        mutationObserver.observe(popupElement, { childList: true, subtree: true, characterData: true });
        return () => mutationObserver.disconnect();
    }

    /**
     * After opening with the keyboard, move focus into the popup (through the guard before it).
     */
    private focusAfterKeyboardOpen() {
        const { root } = this;
        if (this.isActiveItem && root.open && root.store.state.popupElement && this.allowFocus) {
            this.allowFocus = false;
            this.focusFrame.request(() => {
                root.beforeOutsideRef.current?.focus();
            });
        }
        return () => this.focusFrame.cancel();
    }

    private registerAsActive() {
        if (this.isActiveItem) {
            this.root.store.set('floatingRootContext', this.floatingRoot);
            this.root.prevTriggerElementRef.current = this.triggerElement;
        }
        return;
    }
}
