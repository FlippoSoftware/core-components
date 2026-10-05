import { isNode } from '@floating-ui/utils/dom';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { Store } from '~@store/Store';

import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { MutableRef } from '~@lib/types';

import { createAttribute } from './utils/createAttribute';
import { Effect } from './utils/Effect';
import { getNativeEvent } from './utils/event';
import { disableFocusInside, enableFocusInside, getNextTabbable, getPreviousTabbable, isOutsideEvent } from './utils/tabbable';

export const PORTAL_ATTRIBUTE = createAttribute('portal');

export type PortalContainer = HTMLElement | ShadowRoot | null | MutableRef<HTMLElement | ShadowRoot | null>;

/**
 * Resolves the element a portal renders into: the explicit container, the parent portal, or `document.body`.
 * Returns `null` while an explicit `null` container is pending.
 */
export function resolvePortalContainer(
    container: PortalContainer | undefined,
    parentPortalNode: HTMLElement | null | undefined
): HTMLElement | ShadowRoot | null {
    if (container === null) {
        return null;
    }

    return (
        (container &&
            (isNode(container)
                ? (container as HTMLElement | ShadowRoot)
                : (container as MutableRef<HTMLElement | ShadowRoot | null>).current)) ??
        parentPortalNode ??
        document.body
    );
}

/**
 * State the focus manager inside a portal publishes to it.
 */
export type FocusManagerPortalState = null | {
    modal: boolean;
    open: boolean;
    onOpenChange: (open: boolean, data: ChangeEventDetails<string>) => void;
    domReference: Element | null;
    closeOnFocusOut: boolean;
};

type GuardRef = MutableRef<HTMLSpanElement | null>;

/**
 * Focus management of a portal: keeps the portaled content in the tab order right after its
 * reference using “outside” focus guards, and disables tabbing into it until it is focused.
 * Replacement for the logic of `FloatingPortal`; the adapter renders the portal and the guards.
 */
export class FloatingPortalController {
    readonly beforeOutsideRef: GuardRef = { current: null };

    readonly afterOutsideRef: GuardRef = { current: null };

    readonly beforeInsideRef: GuardRef = { current: null };

    readonly afterInsideRef: GuardRef = { current: null };

    /**
     * `focusManagerState` published by a focus manager rendered inside the portal.
     */
    readonly state = new Store<{ portalNode: HTMLElement | null; focusManagerState: FocusManagerPortalState }>({
        portalNode: null,
        focusManagerState: null
    });

    private readonly focusListeners: Effect;

    private readonly unsubscribe: () => void;

    constructor() {
        this.focusListeners = new Effect(() => this.attachFocusListeners());
        this.unsubscribe = this.state.subscribe(() => this.sync());
    }

    get portalNode() {
        return this.state.state.portalNode;
    }

    setPortalNode = (node: HTMLElement | null) => {
        this.state.set('portalNode', node);
    };

    setFocusManagerState = (focusManagerState: FocusManagerPortalState) => {
        this.state.set('focusManagerState', focusManagerState);
    };

    /**
     * Whether the outside focus guards should be rendered.
     */
    shouldRenderGuards(renderGuards?: boolean) {
        const { focusManagerState, portalNode } = this.state.state;
        if (typeof renderGuards === 'boolean') {
            return renderGuards;
        }
        return Boolean(focusManagerState) && !focusManagerState?.modal && Boolean(focusManagerState?.open) && Boolean(portalNode);
    }

    /**
     * Focus handler of the guard before the portal content.
     */
    onBeforeOutsideGuardFocus = (event: FocusEvent) => {
        const portalNode = this.portalNode;
        if (portalNode && isOutsideEvent(event, portalNode)) {
            this.beforeInsideRef.current?.focus();
        } else {
            const domReference = this.state.state.focusManagerState?.domReference ?? null;
            getPreviousTabbable(domReference)?.focus();
        }
    };

    /**
     * Focus handler of the guard after the portal content.
     */
    onAfterOutsideGuardFocus = (event: FocusEvent) => {
        const portalNode = this.portalNode;
        if (portalNode && isOutsideEvent(event, portalNode)) {
            this.afterInsideRef.current?.focus();
        } else {
            const focusManagerState = this.state.state.focusManagerState;
            const domReference = focusManagerState?.domReference ?? null;
            getNextTabbable(domReference)?.focus();

            if (focusManagerState?.closeOnFocusOut) {
                focusManagerState.onOpenChange(false, createChangeEventDetails(REASONS.focusOut, getNativeEvent(event)));
            }
        }
    };

    destroy() {
        this.unsubscribe();
        this.focusListeners.destroy();
    }

    private sync() {
        const { portalNode, focusManagerState } = this.state.state;
        this.focusListeners.sync([portalNode, focusManagerState?.modal]);

        if (portalNode && !focusManagerState?.open) {
            enableFocusInside(portalNode);
        }
    }

    private attachFocusListeners() {
        const { portalNode, focusManagerState } = this.state.state;
        if (!portalNode || focusManagerState?.modal) {
            return;
        }

        // Make sure elements inside the portal element are tabbable only when the
        // portal has already been focused, either by tabbing into a focus trap
        // element outside or using the mouse.
        const onFocus = (event: FocusEvent) => {
            if (isOutsideEvent(event)) {
                const manageFocus = event.type === 'focusin' ? enableFocusInside : disableFocusInside;
                manageFocus(portalNode);
            }
        };

        // Listen to the event on the capture phase so they run before the focus
        // trap elements onFocus prop is called.
        portalNode.addEventListener('focusin', onFocus, true);
        portalNode.addEventListener('focusout', onFocus, true);
        return () => {
            portalNode.removeEventListener('focusin', onFocus, true);
            portalNode.removeEventListener('focusout', onFocus, true);
        };
    }
}
