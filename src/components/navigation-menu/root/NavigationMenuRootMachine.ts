import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { REASONS } from '~@events/reasons';
import { ownerDocument } from '~@lib/owner';
import { FloatingNodeRegistration } from '~@packages/floating-ui/FloatingNodeRegistration';
import { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import { activeElement, contains } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { MutableRef } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { Props } from '~@props/mergeProps';

import { NAVIGATION_MENU_CLOSE_DELAY, NAVIGATION_MENU_OPEN_DELAY } from '../utils/constants';
import { setFixedSize } from '../utils/setFixedSize';

export type NavigationMenuChangeEventReason =
    | typeof REASONS.triggerPress
    | typeof REASONS.triggerHover
    | typeof REASONS.outsidePress
    | typeof REASONS.listNavigation
    | typeof REASONS.focusOut
    | typeof REASONS.escapeKey
    | typeof REASONS.linkPress
    | typeof REASONS.none
    | (string & {});

export type NavigationMenuChangeEventDetails = ChangeEventDetails<NavigationMenuChangeEventReason>;

export type NavigationMenuActivationDirection = 'left' | 'right' | 'up' | 'down' | null;

export type NavigationMenuOrientation = 'horizontal' | 'vertical';

type NavigationMenuInternalState = {
    value: unknown;
    positionerElement: HTMLElement | null;
    popupElement: HTMLElement | null;
    viewportElement: HTMLElement | null;
    viewportTargetElement: HTMLElement | null;
    activationDirection: NavigationMenuActivationDirection;
    /**
     * Floating root of the active trigger.
     */
    floatingRootContext: FloatingRootStore | undefined;
    viewportInert: boolean;
};

export type NavigationMenuRootOptions = {
    value?: unknown;
    /**
     * @default null
     */
    defaultValue?: unknown;
    onValueChange?: ((value: unknown, eventDetails: NavigationMenuChangeEventDetails) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
    /**
     * @default 50
     */
    delay?: number | undefined;
    /**
     * @default 50
     */
    closeDelay?: number | undefined;
    /**
     * @default 'horizontal'
     */
    orientation?: NavigationMenuOrientation | undefined;
    /**
     * Whether an `actionsRef` is used (the adapter then unmounts through `actions.unmount`).
     * @default false
     */
    hasActionsRef?: boolean | undefined;
};

export type NavigationMenuRootSetup = {
    /**
     * Generated ID of the menu's floating tree node.
     */
    nodeId: string;
    /**
     * The parent menu's tree and node (nested navigation menus).
     */
    parent?: { tree: FloatingTreeStore; nodeId: string | undefined } | null | undefined;
};

const blockedReturnFocusReasons = new Set<string>([REASONS.triggerHover, REASONS.outsidePress, REASONS.focusOut]);

/**
 * State machine of `NavigationMenu.Root`: the active item (`value`, open when non-null), mount transitions,
 * the active trigger's floating root, sizes and focus return when closing.
 */
export class NavigationMenuRootMachine {
    readonly store: Store<NavigationMenuInternalState>;

    readonly transitions: TransitionStatusController;

    readonly tree: FloatingTreeStore;

    readonly actions: { unmount: () => void };

    readonly rootRef: MutableRef<HTMLElement | null> = { current: null };

    readonly beforeInsideRef: MutableRef<HTMLElement | null> = { current: null };

    readonly afterInsideRef: MutableRef<HTMLElement | null> = { current: null };

    readonly beforeOutsideRef: MutableRef<HTMLElement | null> = { current: null };

    readonly afterOutsideRef: MutableRef<HTMLElement | null> = { current: null };

    readonly prevTriggerElementRef: MutableRef<Element | null | undefined> = { current: null };

    readonly currentContentRef: MutableRef<HTMLElement | null> = { current: null };

    private options: NavigationMenuRootOptions;

    private readonly setup: NavigationMenuRootSetup;

    private readonly node: FloatingNodeRegistration;

    private closeReason: NavigationMenuChangeEventReason | undefined;

    private previousValue: unknown;

    private readonly popupComplete: OpenChangeComplete;

    private readonly viewportComplete: OpenChangeComplete;

    private readonly unsubscribe: () => void;

    constructor(options: NavigationMenuRootOptions, setup: NavigationMenuRootSetup) {
        this.options = options;
        this.setup = setup;
        const value = options.value !== undefined ? options.value : (options.defaultValue ?? null);
        this.previousValue = value;
        this.tree = setup.parent?.tree ?? new FloatingTreeStore();
        this.node = new FloatingNodeRegistration(this.tree, setup.nodeId, setup.parent?.nodeId ?? null);
        this.transitions = new TransitionStatusController(value != null);
        this.store = new Store<NavigationMenuInternalState>({
            value,
            positionerElement: null,
            popupElement: null,
            viewportElement: null,
            viewportTargetElement: null,
            activationDirection: null,
            floatingRootContext: undefined,
            viewportInert: false
        });

        const store = this.store;
        this.popupComplete = new OpenChangeComplete(
            {
                get current() {
                    return store.state.popupElement;
                },
                set current(_element: HTMLElement | null) {}
            },
            () => this.handleCompleteClose()
        );
        this.viewportComplete = new OpenChangeComplete(
            {
                get current() {
                    return store.state.viewportTargetElement;
                },
                set current(_element: HTMLElement | null) {}
            },
            () => this.handleCompleteClose()
        );
        this.actions = { unmount: this.handleUnmount };

        this.unsubscribe = this.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: NavigationMenuRootOptions) {
        this.options = options;
        if (options.value !== undefined) {
            this.store.set('value', options.value);
        }
        this.sync();
    }

    get open(): boolean {
        return this.store.state.value != null;
    }

    get nested(): boolean {
        return this.setup.parent != null;
    }

    get nodeId(): string {
        return this.setup.nodeId;
    }

    get delay(): number {
        return this.options.delay ?? NAVIGATION_MENU_OPEN_DELAY;
    }

    get closeDelay(): number {
        return this.options.closeDelay ?? NAVIGATION_MENU_CLOSE_DELAY;
    }

    get orientation(): NavigationMenuOrientation {
        return this.options.orientation ?? 'horizontal';
    }

    setValue = (nextValue: unknown, eventDetails: NavigationMenuChangeEventDetails) => {
        const { store } = this;
        if (!nextValue) {
            this.closeReason = eventDetails.reason;
            const { positionerElement, popupElement } = store.state;
            store.update({ activationDirection: null, floatingRootContext: undefined });
            if (positionerElement && popupElement) {
                setFixedSize(popupElement, 'popup');
                setFixedSize(positionerElement, 'positioner');
            }
        }
        if (nextValue !== store.state.value) {
            this.options.onValueChange?.(nextValue, eventDetails);
        }
        if (eventDetails.isCanceled) {
            return;
        }
        if (this.options.value === undefined) {
            store.set('value', nextValue);
        }
    };

    setRootElement = (element: HTMLElement | null) => {
        this.rootRef.current = element;
    };

    getState(): { open: boolean; nested: boolean } {
        return { open: this.open, nested: this.nested };
    }

    getRootProps(elementProps: Props = {}): Props {
        return mergeProps({ 'aria-orientation': this.orientation }, elementProps);
    }

    destroy() {
        this.unsubscribe();
        this.popupComplete.destroy();
        this.viewportComplete.destroy();
        this.transitions.destroy();
        this.node.destroy();
    }

    private handleCompleteClose() {
        if (!this.open) {
            this.handleUnmount();
        }
    }

    private readonly handleUnmount = () => {
        const { popupElement } = this.store.state;
        const activeEl = activeElement(ownerDocument(this.rootRef.current));
        const isReturnFocusBlocked = this.closeReason ? blockedReturnFocusReasons.has(this.closeReason) : false;
        const prevTrigger = this.prevTriggerElementRef.current;

        if (
            !isReturnFocusBlocked &&
            prevTrigger instanceof HTMLElement &&
            popupElement &&
            (activeEl === ownerDocument(popupElement).body || contains(popupElement, activeEl))
        ) {
            prevTrigger.focus({ preventScroll: true });
            this.prevTriggerElementRef.current = undefined;
        }

        this.transitions.setMounted(false);
        this.options.onOpenChangeComplete?.(false);
        this.store.update({ activationDirection: null, floatingRootContext: undefined });
        this.currentContentRef.current = null;
        this.closeReason = undefined;
    };

    private sync() {
        const open = this.open;
        this.transitions.setOpen(open);
        if (this.store.state.value !== this.previousValue) {
            this.previousValue = this.store.state.value;
            this.store.set('viewportInert', false);
        }
        if (!this.options.hasActionsRef) {
            this.popupComplete.sync(open);
            this.viewportComplete.sync(open);
        }
    }
}
