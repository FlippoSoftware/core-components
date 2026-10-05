import { ownerDocument } from '~@lib/owner';
import { Timeout } from '~@timers/Timeout';

import { TYPEABLE_SELECTOR } from '../../utils/constants';
import { createAttribute } from '../../utils/createAttribute';
import { isMouseLikePointerType } from '../../utils/event';

import type { FloatingRootStore } from '../../FloatingRootStore';
import type { SafePolygonOptions } from '../../safePolygon';
import type { Delay } from '../../types';

export const safePolygonIdentifier = createAttribute('safe-polygon');
const interactiveSelector = `button,a,[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`;

export function isInteractiveElement(element: Element | null) {
    return element ? Boolean(element.closest(interactiveSelector)) : false;
}

/**
 * Hover state shared by the reference and floating halves of a hover interaction.
 * Lives on the floating root's `dataRef`, so every trigger of a popup shares it.
 */
export class HoverInteractionState {
    pointerType: string | undefined = undefined;

    interactedInside = false;

    handler: ((event: MouseEvent) => void) | undefined = undefined;

    blockMouseMove = true;

    performedPointerEventsMutation = false;

    unbindMouseMove: () => void = () => {};

    restTimeoutPending = false;

    readonly openChangeTimeout = new Timeout();

    readonly restTimeout = new Timeout();

    handleCloseOptions: SafePolygonOptions | undefined = undefined;

    static create(): HoverInteractionState {
        return new HoverInteractionState();
    }

    dispose = () => {
        this.openChangeTimeout.clear();
        this.restTimeout.clear();
    };

    disposeEffect = () => {
        return this.dispose;
    };
}

/**
 * Returns the hover state shared through the root's data ref, creating it on first use.
 */
export function getHoverInteractionState(store: FloatingRootStore): HoverInteractionState {
    const data = store.context.dataRef.current;
    let state = data.hoverInteractionState as HoverInteractionState | undefined;
    if (!state) {
        state = new HoverInteractionState();
        data.hoverInteractionState = state;
    }
    return state;
}

export function getDelay(value: Delay | (() => Delay), prop: 'open' | 'close', pointerType?: string) {
    if (pointerType && !isMouseLikePointerType(pointerType)) {
        return 0;
    }

    const resolved = typeof value === 'function' ? value() : value;

    if (typeof resolved === 'number') {
        return resolved;
    }

    return resolved?.[prop];
}

export function getRestMs(value: number | (() => number)) {
    return typeof value === 'function' ? value() : value;
}

/**
 * Whether the popup was opened by a hover (mouse event other than `mousedown`).
 */
export function isHoverOpen(store: FloatingRootStore) {
    const type = store.context.dataRef.current.openEvent?.type;
    return Boolean(type?.includes('mouse') && type !== 'mousedown');
}

const clickLikeEvents = new Set(['click', 'mousedown']);

/**
 * Whether the popup was opened by a click-like event (or the user interacted inside it).
 */
export function isClickLikeOpenEvent(store: FloatingRootStore, state: HoverInteractionState) {
    if (state.interactedInside) {
        return true;
    }

    const openEvent = store.context.dataRef.current.openEvent;
    return openEvent ? clickLikeEvents.has(openEvent.type) : false;
}

/**
 * Restores `pointer-events` changed while a `safePolygon` with `blockPointerEvents` was active.
 */
export function clearPointerEventsMutation(state: HoverInteractionState, element: Element | null) {
    if (state.performedPointerEventsMutation) {
        const body = ownerDocument(element).body;
        body.style.pointerEvents = '';
        body.removeAttribute(safePolygonIdentifier);
        state.performedPointerEventsMutation = false;
    }
}

/**
 * Blocks `pointer-events` of everything except the reference and the floating element while a
 * hover-opened popup uses `safePolygon({ blockPointerEvents: true })`.
 *
 * @returns A cleanup function, or `undefined` when nothing was changed.
 */
export function blockPointerEvents(
    state: HoverInteractionState,
    reference: Element | null,
    floating: HTMLElement | null,
    parentFloating: HTMLElement | null | undefined
): (() => void) | undefined {
    if (!reference || !floating) {
        return undefined;
    }

    state.performedPointerEventsMutation = true;
    const body = ownerDocument(floating).body;
    body.setAttribute(safePolygonIdentifier, '');

    const ref = reference as HTMLElement | SVGSVGElement;

    if (parentFloating) {
        parentFloating.style.pointerEvents = '';
    }

    body.style.pointerEvents = 'none';
    ref.style.pointerEvents = 'auto';
    floating.style.pointerEvents = 'auto';

    return () => {
        body.style.pointerEvents = '';
        ref.style.pointerEvents = '';
        floating.style.pointerEvents = '';
    };
}
