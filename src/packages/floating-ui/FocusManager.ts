import { getComputedStyle, getNodeName, isHTMLElement } from '@floating-ui/utils/dom';
import { focusable, isTabbable, tabbable } from 'tabbable';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { CLICK_TRIGGER_IDENTIFIER } from '~@lib/constants';
import { NOOP } from '~@lib/noop';
import { ownerWindow } from '~@lib/owner';
import { applyStyle, visuallyHidden } from '~@lib/visuallyHidden';
import { AnimationFrame } from '~@timers/AnimationFrame';
import { Timeout } from '~@timers/Timeout';

import type { FloatingOpenChangeDetails } from '~@events/changeEventDetails';
import type { Interaction, MutableRef } from '~@lib/types';

import { createAttribute } from './utils/createAttribute';
import { Effect } from './utils/Effect';
import { activeElement, contains, getDocument, getFloatingFocusElement, getTarget, isTypeableCombobox } from './utils/element';
import { enqueueFocus } from './utils/enqueueFocus';
import { isVirtualClick, isVirtualPointerEvent, stopEvent } from './utils/event';
import { markOthers } from './utils/markOthers';
import { getNodeAncestors, getNodeChildren } from './utils/nodes';
import { getNextTabbable, getPreviousTabbable, getTabbableOptions, isOutsideEvent } from './utils/tabbable';

import type { FloatingPortalController } from './FloatingPortalController';
import type { FloatingRootStore } from './FloatingRootStore';
import type { FloatingTreeStore } from './FloatingTreeStore';
import type { EffectCallback } from './utils/Effect';
import type { FocusableElement } from './utils/tabbable';

type ElementOrRef<T extends Element> = T | MutableRef<T | null> | null | undefined;

function resolveRef<T extends Element>(value: ElementOrRef<T>): T | null {
    if (value == null) {
        return null;
    }
    return 'current' in value ? value.current : value;
}

function getEventType(event: Event, lastInteractionType?: Interaction): Interaction {
    const win = ownerWindow(event.target as Element | null);
    if (event instanceof win.KeyboardEvent) {
        return 'keyboard';
    }
    if (event instanceof win.FocusEvent) {
        // Focus events can be caused by a preceding pointer interaction (e.g., focusout on outside press).
        // Prefer the last known pointer type if provided, else treat as keyboard.
        return lastInteractionType || 'keyboard';
    }
    if ('pointerType' in event) {
        return ((event as PointerEvent).pointerType as Interaction) || 'keyboard';
    }
    if ('touches' in event) {
        return 'touch';
    }
    if (event instanceof win.MouseEvent) {
        // onClick events may not contain pointer events, and will fall through to here
        return lastInteractionType || (event.detail === 0 ? 'keyboard' : 'mouse');
    }
    return '';
}

const LIST_LIMIT = 20;
let previouslyFocusedElements: Element[] = [];

function clearDisconnectedPreviouslyFocusedElements() {
    previouslyFocusedElements = previouslyFocusedElements.filter((el) => el.isConnected);
}

function addPreviouslyFocusedElement(element: Element | null) {
    clearDisconnectedPreviouslyFocusedElements();
    if (element && getNodeName(element) !== 'body') {
        previouslyFocusedElements.push(element);
        if (previouslyFocusedElements.length > LIST_LIMIT) {
            previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
        }
    }
}

function getPreviouslyFocusedElement() {
    clearDisconnectedPreviouslyFocusedElements();
    return previouslyFocusedElements.at(-1);
}

function getFirstTabbableElement(container: Element | null) {
    if (!container) {
        return null;
    }

    const tabbableOptions = getTabbableOptions();
    if (isTabbable(container, tabbableOptions)) {
        return container;
    }

    return tabbable(container, tabbableOptions)[0] || container;
}

function isFocusable(element: Element | null) {
    if (!element?.isConnected) {
        return false;
    }

    if (typeof element.checkVisibility === 'function') {
        return element.checkVisibility();
    }

    return getComputedStyle(element).display !== 'none';
}

export type FocusOrder = ('reference' | 'floating' | 'content')[];

function handleTabIndex(floatingFocusElement: HTMLElement, order: FocusOrder) {
    if (!order.includes('floating') && !floatingFocusElement.getAttribute('role')?.includes('dialog')) {
        return;
    }

    const options = getTabbableOptions();
    const focusableElements = focusable(floatingFocusElement, options);
    const tabbableContent = focusableElements.filter((element) => {
        const dataTabIndex = element.getAttribute('data-tabindex') || '';
        return isTabbable(element, options) || (element.hasAttribute('data-tabindex') && !dataTabIndex.startsWith('-'));
    });
    const tabIndex = floatingFocusElement.getAttribute('tabindex');

    if (order.includes('floating') || tabbableContent.length === 0) {
        if (tabIndex !== '0') {
            floatingFocusElement.setAttribute('tabindex', '0');
        }
    } else if (
        tabIndex !== '-1' ||
        (floatingFocusElement.hasAttribute('data-tabindex') && floatingFocusElement.getAttribute('data-tabindex') !== '-1')
    ) {
        floatingFocusElement.setAttribute('tabindex', '-1');
        floatingFocusElement.setAttribute('data-tabindex', '-1');
    }
}

export type FocusTarget =
    | boolean
    | MutableRef<HTMLElement | null>
    | ((interactionType: Interaction) => boolean | HTMLElement | null | undefined);

export type FocusManagerOptions = {
    /**
     * The interaction type used to open the floating element.
     */
    openInteractionType?: Interaction | null | undefined;
    /**
     * Disables focus management (e.g. until a transition completes).
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * The order in which focus cycles.
     * @default ['content']
     */
    order?: FocusOrder | undefined;
    /**
     * The element to focus when the floating element opens:
     * `false` — don't move focus, `true` — first tabbable or the floating element,
     * a ref — that element, a function — called with the interaction type.
     * @default true
     */
    initialFocus?: FocusTarget | undefined;
    /**
     * The element to focus when the floating element closes (same forms as `initialFocus`).
     * @default true
     */
    returnFocus?: FocusTarget | undefined;
    /**
     * Where focus is restored if the focused element inside is removed.
     * @default false
     */
    restoreFocus?: boolean | 'popup' | undefined;
    /**
     * Whether focus is trapped and outside content is hidden from assistive technology.
     * @default true
     */
    modal?: boolean | undefined;
    /**
     * Whether moving focus outside closes the floating element (non-modal).
     * @default true
     */
    closeOnFocusOut?: boolean | undefined;
    /**
     * Elements that should be considered part of the floating element.
     */
    getInsideElements?: (() => Element[]) | undefined;
    /**
     * Overrides the element to focus when tabbing forward out of the floating element.
     */
    nextFocusableElement?: ElementOrRef<HTMLElement> | undefined;
    /**
     * Overrides the element to focus when tabbing backward out of the floating element.
     */
    previousFocusableElement?: ElementOrRef<HTMLElement> | undefined;
    /**
     * Ref that also receives the focus guard preceding the content.
     */
    beforeContentFocusGuardRef?: MutableRef<HTMLSpanElement | null> | undefined;
    /**
     * The floating tree (nested popups).
     */
    tree?: FloatingTreeStore | null | undefined;
    /**
     * The portal the floating element is rendered into.
     */
    portal?: FloatingPortalController | null | undefined;
};

const DEFAULT_ORDER: FocusOrder = ['content'];
const DEFAULT_GET_INSIDE_ELEMENTS = () => [];

/**
 * Focus management of a floating element: initial focus, return focus, focus trap,
 * hiding outside content (`aria-hidden`/`inert`), focus restoration and focus guards.
 * Replacement for `FloatingFocusManager`; the adapter renders the focus guards using
 * {@link FocusManager.shouldRenderGuards} and the guard handlers.
 */
export class FocusManager {
    private options: FocusManagerOptions;

    private readonly store: FloatingRootStore;

    private readonly startDismissButtonRef: MutableRef<HTMLButtonElement | null> = { current: null };

    private readonly endDismissButtonRef: MutableRef<HTMLButtonElement | null> = { current: null };

    private beforeGuard: HTMLSpanElement | null = null;

    private afterGuard: HTMLSpanElement | null = null;

    private preventReturnFocus = false;

    private tabbableIndex = -1;

    private closeType: Interaction = '';

    private lastInteractionType: Interaction = '';

    private readonly blurTimeout = new Timeout();

    private readonly pointerDownTimeout = new Timeout();

    private readonly restoreFocusFrame = new AnimationFrame();

    private readonly effects: { name: string; effect: Effect; deps: () => unknown[] }[];

    private readonly unsubscribe: () => void;

    constructor(store: FloatingRootStore, options: FocusManagerOptions = {}) {
        this.store = store;
        this.options = options;

        const effect = (name: string, run: EffectCallback, deps: () => unknown[]) => ({ name, effect: new Effect(run), deps });
        const s = () => this.settings;
        const state = () => this.store.state;

        // Layout effects first (they run before passive effects), each group in source order.
        this.effects = [
            effect(
                'initialFocus',
                () => this.initialFocusEffect(),
                () => [s().disabled, state().open, this.floatingFocusElement, s().initialFocus === false]
            ),
            effect(
                'returnFocus',
                () => this.returnFocusEffect(),
                () => [
                    s().disabled,
                    state().floatingElement,
                    this.floatingFocusElement,
                    s().tree,
                    this.isInsidePortal,
                    state().domReferenceElement
                ]
            ),
            effect(
                'portalState',
                () => this.portalStateEffect(),
                () => [s().disabled, s().portal, s().modal, state().open, s().closeOnFocusOut, state().domReferenceElement]
            ),
            effect(
                'tabIndex',
                () => this.tabIndexEffect(),
                () => [s().disabled, this.floatingFocusElement]
            ),
            effect(
                'modalTab',
                () => this.modalTabEffect(),
                () => [s().disabled, state().domReferenceElement, this.floatingFocusElement, s().modal, this.isUntrappedTypeableCombobox]
            ),
            effect(
                'focusIn',
                () => this.focusInEffect(),
                () => [s().disabled, state().floatingElement]
            ),
            effect(
                'interactionType',
                () => this.interactionTypeEffect(),
                () => [s().disabled, state().floatingElement, state().domReferenceElement, this.floatingFocusElement, state().open]
            ),
            effect(
                'focusOut',
                () => this.focusOutEffect(),
                () => [
                    s().disabled,
                    state().domReferenceElement,
                    state().floatingElement,
                    this.floatingFocusElement,
                    s().modal,
                    s().tree,
                    s().portal,
                    s().closeOnFocusOut,
                    s().restoreFocus,
                    this.isUntrappedTypeableCombobox
                ]
            ),
            effect(
                'markOthers',
                () => this.markOthersEffect(),
                () => [
                    state().open,
                    s().disabled,
                    state().domReferenceElement,
                    state().floatingElement,
                    s().modal,
                    s().portal,
                    this.isUntrappedTypeableCombobox,
                    s().tree,
                    s().nextFocusableElement,
                    s().previousFocusableElement,
                    this.beforeGuard,
                    this.afterGuard
                ]
            ),
            effect(
                'resetPreventReturnFocus',
                () => this.resetPreventReturnFocusEffect(),
                () => [s().disabled]
            ),
            effect(
                'clickTrigger',
                () => this.clickTriggerEffect(),
                () => [s().disabled, state().open, this.floatingFocusElement]
            )
        ];

        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: FocusManagerOptions) {
        this.options = options;
        this.sync();
    }

    destroy() {
        this.unsubscribe();
        for (const { effect } of this.effects) {
            effect.destroy();
        }
        this.blurTimeout.clear();
        this.pointerDownTimeout.clear();
        this.restoreFocusFrame.cancel();
    }

    /**
     * Whether the adapter should render the inside focus guards around the content.
     */
    shouldRenderGuards() {
        const { disabled, modal } = this.settings;
        return !disabled && (modal ? !this.isUntrappedTypeableCombobox : true) && (this.isInsidePortal || modal);
    }

    /**
     * Ref callback for the guard before the content.
     */
    setBeforeGuard = (element: HTMLSpanElement | null) => {
        this.beforeGuard = element;
        const { beforeContentFocusGuardRef, portal } = this.settings;
        if (beforeContentFocusGuardRef) {
            beforeContentFocusGuardRef.current = element;
        }
        if (portal) {
            portal.beforeInsideRef.current = element;
        }
        this.sync();
    };

    /**
     * Ref callback for the guard after the content.
     */
    setAfterGuard = (element: HTMLSpanElement | null) => {
        this.afterGuard = element;
        if (this.settings.portal) {
            this.settings.portal.afterInsideRef.current = element;
        }
        this.sync();
    };

    /**
     * Focus handler of the guard before the content.
     */
    onBeforeGuardFocus = (event: FocusEvent) => {
        const { modal, portal, previousFocusableElement } = this.settings;
        const portalNode = portal?.portalNode;
        if (modal) {
            const els = this.getTabbableElements();
            enqueueFocus(els.at(-1) ?? null);
        } else if (portal && portalNode) {
            this.preventReturnFocus = false;
            if (isOutsideEvent(event, portalNode)) {
                getNextTabbable(this.store.select('domReferenceElement'))?.focus();
            } else {
                (resolveRef(previousFocusableElement) ?? portal.beforeOutsideRef.current)?.focus();
            }
        }
    };

    /**
     * Focus handler of the guard after the content.
     */
    onAfterGuardFocus = (event: FocusEvent) => {
        const { modal, portal, nextFocusableElement, closeOnFocusOut } = this.settings;
        const portalNode = portal?.portalNode;
        if (modal) {
            enqueueFocus(this.getTabbableElements()[0] ?? null);
        } else if (portal && portalNode) {
            if (closeOnFocusOut) {
                this.preventReturnFocus = true;
            }

            if (isOutsideEvent(event, portalNode)) {
                getPreviousTabbable(this.store.select('domReferenceElement'))?.focus();
            } else {
                (resolveRef(nextFocusableElement) ?? portal.afterOutsideRef.current)?.focus();
            }
        }
    };

    private get settings() {
        const {
            disabled = false,
            order = DEFAULT_ORDER,
            initialFocus = true,
            returnFocus = true,
            restoreFocus = false,
            modal = true,
            closeOnFocusOut = true,
            openInteractionType = '',
            getInsideElements = DEFAULT_GET_INSIDE_ELEMENTS,
            nextFocusableElement,
            previousFocusableElement,
            beforeContentFocusGuardRef,
            tree = null,
            portal = null
        } = this.options;
        return {
            disabled,
            order,
            initialFocus,
            returnFocus,
            restoreFocus,
            modal,
            closeOnFocusOut,
            openInteractionType,
            getInsideElements,
            nextFocusableElement,
            previousFocusableElement,
            beforeContentFocusGuardRef,
            tree,
            portal
        };
    }

    private get floatingFocusElement() {
        return getFloatingFocusElement(this.store.select('floatingElement'));
    }

    private get isInsidePortal() {
        return this.settings.portal != null;
    }

    /**
     * If the reference is a typeable combobox (e.g. input), there are different focus semantics:
     * the guards are not rendered, but outside content is still hidden.
     */
    private get isUntrappedTypeableCombobox() {
        return isTypeableCombobox(this.store.select('domReferenceElement')) && this.settings.initialFocus === false;
    }

    private getNodeId() {
        return this.store.context.dataRef.current.floatingContext?.nodeId;
    }

    private getTabbableContent(container: Element | null = this.floatingFocusElement) {
        return container ? tabbable(container, getTabbableOptions()) : [];
    }

    private getTabbableElements(container?: Element) {
        const content = this.getTabbableContent(container);
        return this.settings.order
            .map(() => content)
            .filter(Boolean)
            .flat() as FocusableElement[];
    }

    private sync() {
        for (const { effect, deps } of this.effects) {
            effect.sync(deps());
        }
    }

    private modalTabEffect() {
        const { disabled, modal } = this.settings;
        if (disabled || !modal) {
            return;
        }

        const floatingFocusElement = this.floatingFocusElement;
        const isUntrapped = this.isUntrappedTypeableCombobox;

        const onKeyDown = (event: KeyboardEvent) => {
            // The focus guards have nothing to focus, so we need to stop the event.
            if (
                event.key === 'Tab' &&
                contains(floatingFocusElement, activeElement(getDocument(floatingFocusElement))) &&
                this.getTabbableContent().length === 0 &&
                !isUntrapped
            ) {
                stopEvent(event);
            }
        };

        const doc = getDocument(floatingFocusElement);
        doc.addEventListener('keydown', onKeyDown);
        return () => {
            doc.removeEventListener('keydown', onKeyDown);
        };
    }

    private focusInEffect() {
        const floating = this.store.select('floatingElement');
        if (this.settings.disabled || !floating) {
            return;
        }

        const handleFocusIn = (event: FocusEvent) => {
            const target = getTarget(event) as Element | null;
            const tabbableIndex = (this.getTabbableContent() as (Element | null)[]).indexOf(target);
            if (tabbableIndex !== -1) {
                this.tabbableIndex = tabbableIndex;
            }
        };

        floating.addEventListener('focusin', handleFocusIn);
        return () => {
            floating.removeEventListener('focusin', handleFocusIn);
        };
    }

    // Track the last interaction type at the document level to disambiguate focus events
    private interactionTypeEffect() {
        if (this.settings.disabled || !this.store.select('open')) {
            return;
        }

        const doc = getDocument(this.floatingFocusElement);

        const onPointerDown = (event: PointerEvent) => {
            this.lastInteractionType = (event.pointerType as Interaction) || 'keyboard';
        };

        const onKeyDown = () => {
            this.lastInteractionType = 'keyboard';
        };

        doc.addEventListener('pointerdown', onPointerDown, true);
        doc.addEventListener('keydown', onKeyDown, true);
        return () => {
            doc.removeEventListener('pointerdown', onPointerDown, true);
            doc.removeEventListener('keydown', onKeyDown, true);
        };
    }

    private focusOutEffect() {
        const { disabled, closeOnFocusOut, tree, portal, restoreFocus, modal } = this.settings;
        if (disabled || !closeOnFocusOut) {
            return;
        }

        const store = this.store;
        const dataRef = store.context.dataRef;
        const domReference = store.select('domReferenceElement');
        const floating = store.select('floatingElement');
        const floatingFocusElement = this.floatingFocusElement;
        const isUntrapped = this.isUntrappedTypeableCombobox;

        // In Safari, buttons lose focus when pressing them.
        const handlePointerDown = () => {
            this.pointerDownTimeout.start(0, NOOP);
        };

        const handleFocusOutside = (event: FocusEvent) => {
            const relatedTarget = event.relatedTarget as HTMLElement | null;
            const currentTarget = event.currentTarget;
            const target = getTarget(event) as HTMLElement | null;

            queueMicrotask(() => {
                const nodeId = this.getNodeId();
                const triggers = store.context.triggerElements;
                const movedToUnrelatedNode = !(
                    contains(domReference, relatedTarget) ||
                    contains(floating, relatedTarget) ||
                    contains(relatedTarget, floating) ||
                    contains(portal?.portalNode, relatedTarget) ||
                    (relatedTarget != null && triggers.hasElement(relatedTarget)) ||
                    triggers.hasMatchingElement((trigger) => contains(trigger, relatedTarget)) ||
                    relatedTarget?.hasAttribute(createAttribute('focus-guard')) ||
                    (tree &&
                        (getNodeChildren(tree.nodesRef.current, nodeId).find(
                            (node) =>
                                contains(node.context?.elements.floating, relatedTarget) ||
                                contains(node.context?.elements.domReference, relatedTarget)
                        ) ||
                            getNodeAncestors(tree.nodesRef.current, nodeId).find(
                                (node) =>
                                    [node.context?.elements.floating, getFloatingFocusElement(node.context?.elements.floating)].includes(
                                        relatedTarget
                                    ) || node.context?.elements.domReference === relatedTarget
                            )))
                );

                if (currentTarget === domReference && floatingFocusElement) {
                    handleTabIndex(floatingFocusElement, this.settings.order);
                }

                // Restore focus to the previous tabbable element index to prevent
                // focus from being lost outside the floating tree.
                if (
                    restoreFocus &&
                    currentTarget !== domReference &&
                    !isFocusable(target) &&
                    activeElement(getDocument(floatingFocusElement)) === getDocument(floatingFocusElement).body
                ) {
                    // Let the portal know that focus is still inside the floating tree.
                    if (isHTMLElement(floatingFocusElement)) {
                        floatingFocusElement.focus();
                        // If explicitly requested to restore focus to the popup container, do not search
                        // for the next/previous tabbable element.
                        if (restoreFocus === 'popup') {
                            // If the element is removed on pointerdown, focus needs to be moved asynchronously.
                            this.restoreFocusFrame.request(() => {
                                floatingFocusElement.focus();
                            });
                            return;
                        }
                    }

                    const tabbableContent = this.getTabbableContent() as (Element | null)[];
                    const nodeToFocus = tabbableContent[this.tabbableIndex] || tabbableContent.at(-1) || floatingFocusElement;

                    if (isHTMLElement(nodeToFocus)) {
                        nodeToFocus.focus();
                    }
                }

                // https://github.com/floating-ui/floating-ui/issues/3060
                if (dataRef.current.insideReactTree) {
                    dataRef.current.insideReactTree = false;
                    return;
                }

                // Focus did not move inside the floating tree, and there are no tabbable
                // portal guards to handle closing.
                if (
                    (isUntrapped ? true : !modal) &&
                    relatedTarget &&
                    movedToUnrelatedNode &&
                    // An "untrapped" typeable combobox closes when tabbing out even if the
                    // previously focused element is focused again.
                    (isUntrapped || relatedTarget !== getPreviouslyFocusedElement())
                ) {
                    this.preventReturnFocus = true;
                    store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));
                }
            });
        };

        const markInsideTree = () => {
            dataRef.current.insideReactTree = true;
            this.blurTimeout.start(0, () => {
                dataRef.current.insideReactTree = false;
            });
        };

        const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
        const cleanups: (() => void)[] = [];

        if (!floating && !domReferenceElement) {
            return;
        }

        if (domReferenceElement) {
            domReferenceElement.addEventListener('focusout', handleFocusOutside);
            domReferenceElement.addEventListener('pointerdown', handlePointerDown);
            cleanups.push(() => {
                domReferenceElement.removeEventListener('focusout', handleFocusOutside);
                domReferenceElement.removeEventListener('pointerdown', handlePointerDown);
            });
        }

        if (floating) {
            floating.addEventListener('focusout', handleFocusOutside);

            if (portal) {
                floating.addEventListener('focusout', markInsideTree, true);
                cleanups.push(() => {
                    floating.removeEventListener('focusout', markInsideTree, true);
                });
            }

            cleanups.push(() => {
                floating.removeEventListener('focusout', handleFocusOutside);
            });
        }

        return () => {
            for (const cleanup of cleanups) {
                cleanup();
            }
        };
    }

    private markOthersEffect() {
        const { disabled, portal, tree, getInsideElements, previousFocusableElement, nextFocusableElement, modal } = this.settings;
        const floating = this.store.select('floatingElement');
        if (disabled || !floating || !this.store.select('open')) {
            return;
        }

        // Don't hide portals nested within the parent portal.
        const portalNodes = Array.from(portal?.portalNode?.querySelectorAll(`[${createAttribute('portal')}]`) || []);

        const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, this.getNodeId()) : [];
        const rootAncestorComboboxDomReference = ancestors.find((node) => isTypeableCombobox(node.context?.elements.domReference || null))
            ?.context?.elements.domReference;

        const isUntrapped = this.isUntrappedTypeableCombobox;
        const insideElements = [
            floating,
            rootAncestorComboboxDomReference,
            ...portalNodes,
            ...getInsideElements(),
            this.startDismissButtonRef.current,
            this.endDismissButtonRef.current,
            this.beforeGuard,
            this.afterGuard,
            portal?.beforeOutsideRef.current,
            portal?.afterOutsideRef.current,
            resolveRef(previousFocusableElement),
            resolveRef(nextFocusableElement),
            isUntrapped ? this.store.select('domReferenceElement') : null
        ].filter((x): x is Element => x != null);

        return markOthers(insideElements, modal || isUntrapped);
    }

    private initialFocusEffect() {
        const floatingFocusElement = this.floatingFocusElement;
        if (!this.store.select('open') || this.settings.disabled || !isHTMLElement(floatingFocusElement)) {
            return;
        }

        const doc = getDocument(floatingFocusElement);
        const previouslyFocusedElement = activeElement(doc);

        // Wait for any layout effect state setters to execute to set `tabIndex`.
        queueMicrotask(() => {
            const { initialFocus, openInteractionType } = this.settings;
            const focusableElements = this.getTabbableElements(floatingFocusElement);
            const resolvedInitialFocus = typeof initialFocus === 'function' ? initialFocus(openInteractionType || '') : initialFocus;

            // `null` should fallback to default behavior in case of an empty ref.
            if (resolvedInitialFocus === undefined || resolvedInitialFocus === false) {
                return;
            }

            let elToFocus: FocusableElement | null | undefined;
            if (resolvedInitialFocus === true || resolvedInitialFocus === null) {
                elToFocus = focusableElements[0] || floatingFocusElement;
            } else {
                elToFocus = resolveRef(resolvedInitialFocus);
            }
            elToFocus = elToFocus || focusableElements[0] || floatingFocusElement;

            if (contains(floatingFocusElement, previouslyFocusedElement)) {
                return;
            }

            enqueueFocus(elToFocus, { preventScroll: elToFocus === floatingFocusElement });
        });
    }

    private returnFocusEffect() {
        const floatingFocusElement = this.floatingFocusElement;
        if (this.settings.disabled || !floatingFocusElement) {
            return;
        }

        const { events } = this.store.context;
        const { tree } = this.settings;
        const floating = this.store.select('floatingElement');
        const domReference = this.store.select('domReferenceElement');
        const doc = getDocument(floatingFocusElement);
        const previouslyFocusedElement = activeElement(doc);

        addPreviouslyFocusedElement(previouslyFocusedElement);

        // Dismissing via outside press should always ignore `returnFocus` to
        // prevent unwanted scrolling.
        const onOpenChangeLocal = (details: FloatingOpenChangeDetails) => {
            if (!details.open) {
                this.closeType = getEventType(details.nativeEvent, this.lastInteractionType);
            }

            if (details.reason === REASONS.triggerHover && details.nativeEvent.type === 'mouseleave') {
                this.preventReturnFocus = true;
            }

            if (details.reason !== REASONS.outsidePress) {
                return;
            }

            if (
                details.nested ||
                isVirtualClick(details.nativeEvent as MouseEvent) ||
                isVirtualPointerEvent(details.nativeEvent as PointerEvent)
            ) {
                this.preventReturnFocus = false;
            } else {
                let isPreventScrollSupported = false;
                document.createElement('div').focus({
                    get preventScroll() {
                        isPreventScrollSupported = true;
                        return false;
                    }
                });

                this.preventReturnFocus = !isPreventScrollSupported;
            }
        };

        events.on('openchange', onOpenChangeLocal);

        const fallbackEl = doc.createElement('span');
        fallbackEl.setAttribute('tabindex', '-1');
        fallbackEl.setAttribute('aria-hidden', 'true');
        applyStyle(fallbackEl, visuallyHidden);

        if (this.isInsidePortal && domReference) {
            domReference.insertAdjacentElement('afterend', fallbackEl);
        }

        const getReturnElement = () => {
            const { returnFocus } = this.settings;
            let resolvedReturnFocusValue = typeof returnFocus === 'function' ? returnFocus(this.closeType) : returnFocus;

            // `null` should fallback to default behavior in case of an empty ref.
            if (resolvedReturnFocusValue === undefined || resolvedReturnFocusValue === false) {
                return null;
            }

            if (resolvedReturnFocusValue === null) {
                resolvedReturnFocusValue = true;
            }

            if (typeof resolvedReturnFocusValue === 'boolean') {
                const el = domReference || getPreviouslyFocusedElement();
                return el?.isConnected ? el : fallbackEl;
            }

            const fallback = domReference || getPreviouslyFocusedElement() || fallbackEl;

            return resolveRef(resolvedReturnFocusValue) || fallback;
        };

        return () => {
            events.off('openchange', onOpenChangeLocal);

            const activeEl = activeElement(doc);
            const isFocusInsideFloatingTree =
                contains(floating, activeEl) ||
                (tree &&
                    getNodeChildren(tree.nodesRef.current, this.getNodeId(), false).some((node) =>
                        contains(node.context?.elements.floating, activeEl)
                    ));

            const returnElement = getReturnElement();
            const { returnFocus } = this.settings;

            queueMicrotask(() => {
                // This is `returnElement`, if it's tabbable, or its first tabbable child.
                const tabbableReturnElement = getFirstTabbableElement(returnElement);
                const hasExplicitReturnFocus = typeof returnFocus !== 'boolean';

                if (
                    returnFocus &&
                    !this.preventReturnFocus &&
                    isHTMLElement(tabbableReturnElement) &&
                    // If the focus moved somewhere else after mount, avoid returning focus
                    // since it likely entered a different element which should be
                    // respected: https://github.com/floating-ui/floating-ui/issues/2607
                    (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body
                        ? isFocusInsideFloatingTree
                        : true)
                ) {
                    tabbableReturnElement.focus({ preventScroll: true });
                }

                fallbackEl.remove();
            });
        };
    }

    private resetPreventReturnFocusEffect() {
        // The `returnFocus` cleanup behavior is inside a microtask; ensure we
        // wait for it to complete before resetting the flag.
        queueMicrotask(() => {
            this.preventReturnFocus = false;
        });
    }

    private clickTriggerEffect() {
        if (this.settings.disabled || !this.store.select('open')) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            const target = getTarget(event) as Element | null;
            if (target?.closest(`[${CLICK_TRIGGER_IDENTIFIER}]`)) {
                this.pointerDownTimeout.start(0, NOOP);
            }
        };

        const doc = getDocument(this.floatingFocusElement);
        doc.addEventListener('pointerdown', handlePointerDown, true);
        return () => {
            doc.removeEventListener('pointerdown', handlePointerDown, true);
        };
    }

    // Synchronize the `modal` value to the portal. It decides whether it needs to render its own guards.
    private portalStateEffect() {
        const { disabled, portal, modal, closeOnFocusOut } = this.settings;
        if (disabled || !portal) {
            return;
        }

        portal.setFocusManagerState({
            modal,
            closeOnFocusOut,
            open: this.store.select('open'),
            onOpenChange: (open, details) => this.store.setOpen(open, details),
            domReference: this.store.select('domReferenceElement')
        });

        return () => {
            portal.setFocusManagerState(null);
        };
    }

    private tabIndexEffect() {
        const floatingFocusElement = this.floatingFocusElement;
        if (this.settings.disabled || !floatingFocusElement) {
            return;
        }
        handleTabIndex(floatingFocusElement, this.settings.order);
        return () => {
            queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
        };
    }
}
