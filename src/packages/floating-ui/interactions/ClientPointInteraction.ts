import { getWindow } from '@floating-ui/utils/dom';

import type { MutableRef } from '~@lib/types';

import { Effect } from '../utils/Effect';
import { contains, getTarget } from '../utils/element';
import { isMouseLikePointerType } from '../utils/event';

import type { FloatingRootStore } from '../FloatingRootStore';
import type { ContextData, InteractionProps } from '../types';

export type ClientPointAxis = 'x' | 'y' | 'both';

function createVirtualElement(
    domElement: Element | null | undefined,
    data: {
        axis: ClientPointAxis;
        dataRef: MutableRef<ContextData>;
        pointerType: string | undefined;
        x: number | null;
        y: number | null;
    }
) {
    let offsetX: number | null = null;
    let offsetY: number | null = null;
    let isAutoUpdateEvent = false;

    return {
        contextElement: domElement || undefined,
        getBoundingClientRect() {
            const domRect = domElement?.getBoundingClientRect() || { width: 0, height: 0, x: 0, y: 0 };

            const isXAxis = data.axis === 'x' || data.axis === 'both';
            const isYAxis = data.axis === 'y' || data.axis === 'both';
            const canTrackCursorOnAutoUpdate =
                ['mouseenter', 'mousemove'].includes(data.dataRef.current.openEvent?.type || '') && data.pointerType !== 'touch';

            let width = domRect.width;
            let height = domRect.height;
            let x = domRect.x;
            let y = domRect.y;

            if (offsetX == null && data.x && isXAxis) {
                offsetX = domRect.x - data.x;
            }

            if (offsetY == null && data.y && isYAxis) {
                offsetY = domRect.y - data.y;
            }

            x -= offsetX || 0;
            y -= offsetY || 0;
            width = 0;
            height = 0;

            if (!isAutoUpdateEvent || canTrackCursorOnAutoUpdate) {
                width = data.axis === 'y' ? domRect.width : 0;
                height = data.axis === 'x' ? domRect.height : 0;
                x = isXAxis && data.x != null ? data.x : x;
                y = isYAxis && data.y != null ? data.y : y;
            } else if (isAutoUpdateEvent && !canTrackCursorOnAutoUpdate) {
                height = data.axis === 'x' ? domRect.height : height;
                width = data.axis === 'y' ? domRect.width : width;
            }

            isAutoUpdateEvent = true;

            return { width, height, x, y, top: y, right: x + width, bottom: y + height, left: x };
        }
    };
}

function isMouseBasedEvent(event: Event | undefined): event is MouseEvent {
    return event != null && (event as MouseEvent).clientX != null;
}

export type ClientPointInteractionOptions = {
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * Restricts the client point to an axis and uses the reference element for the other axis.
     * @default 'both'
     */
    axis?: ClientPointAxis | undefined;
    /**
     * An explicitly defined `x` client coordinate.
     * @default null
     */
    x?: number | null | undefined;
    /**
     * An explicitly defined `y` client coordinate.
     * @default null
     */
    y?: number | null | undefined;
};

/**
 * Positions the floating element relative to a client point (by default it follows the cursor)
 * by setting a virtual `positionReference` on the floating root.
 * Replacement for `useClientPoint`.
 */
export class ClientPointInteraction {
    private options: ClientPointInteractionOptions;

    private readonly store: FloatingRootStore;

    private initial = false;

    private cleanupListener: (() => void) | null = null;

    private pointerType: string | undefined;

    private reactive = 0;

    private readonly listener: Effect;

    private readonly unsubscribe: () => void;

    private readonly reference: Record<string, unknown>;

    private previousFloating: HTMLElement | null = null;

    private previousOpenDisabled = false;

    private previousExplicit: unknown[] | null = null;

    constructor(store: FloatingRootStore, options: ClientPointInteractionOptions = {}) {
        this.store = store;
        this.options = options;
        this.listener = new Effect(() => this.addListener());
        this.reference = {
            onPointerDown: this.setPointerType,
            onPointerEnter: this.setPointerType,
            onMouseMove: this.handleReferenceEnterOrMove,
            onMouseEnter: this.handleReferenceEnterOrMove
        };
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: ClientPointInteractionOptions) {
        this.options = options;
        this.sync();
    }

    getProps(): InteractionProps {
        return this.options.enabled === false ? {} : { reference: this.reference };
    }

    destroy() {
        this.unsubscribe();
        this.listener.destroy();
    }

    private get settings() {
        const { enabled = true, axis = 'both', x = null, y = null } = this.options;
        return { enabled, axis, x, y };
    }

    private sync() {
        const { enabled, x, y, axis } = this.settings;
        const open = this.store.select('open');
        const floating = this.store.select('floatingElement');
        const domReference = this.store.select('domReferenceElement');

        // If the pointer is a mouse-like pointer, we want to continue following the
        // mouse even if the floating element is transitioning out. On touch
        // devices, this is undesirable because the floating element will move to
        // the dismissal touch point.
        const openCheck = isMouseLikePointerType(this.pointerType) ? floating : open;

        const explicit = [enabled, x, y];
        if (!this.previousExplicit || explicit.some((value, index) => !Object.is(value, this.previousExplicit?.[index]))) {
            this.previousExplicit = explicit;
            if (enabled && (x != null || y != null)) {
                this.initial = false;
                this.setReference(x, y);
            }
        }

        this.listener.sync([openCheck, enabled, x, y, floating, domReference, axis, this.pointerType, this.reactive]);

        if (enabled && !floating && floating !== this.previousFloating) {
            this.initial = false;
        }
        this.previousFloating = floating;

        const openDisabled = !enabled && open;
        if (openDisabled && !this.previousOpenDisabled) {
            this.initial = true;
        }
        this.previousOpenDisabled = openDisabled;
    }

    private setReference(newX: number | null, newY: number | null) {
        const dataRef = this.store.context.dataRef;
        if (this.initial) {
            return;
        }

        // Prevent setting if the open event was not a mouse-like one
        // (e.g. focus to open, then hover over the reference element).
        if (dataRef.current.openEvent && !isMouseBasedEvent(dataRef.current.openEvent)) {
            return;
        }

        this.store.set(
            'positionReference',
            createVirtualElement(this.store.select('domReferenceElement'), {
                x: newX,
                y: newY,
                axis: this.settings.axis,
                dataRef,
                pointerType: this.pointerType
            })
        );
    }

    private addListener() {
        const { enabled, x, y } = this.settings;
        const floating = this.store.select('floatingElement');
        const openCheck = isMouseLikePointerType(this.pointerType) ? floating : this.store.select('open');
        const dataRef = this.store.context.dataRef;

        // Explicitly specified `x`/`y` coordinates shouldn't add a listener.
        if (!openCheck || !enabled || x != null || y != null) {
            return;
        }

        const win = getWindow(floating);

        const handleMouseMove = (event: MouseEvent) => {
            const target = getTarget(event) as Element | null;

            if (!contains(floating, target)) {
                this.setReference(event.clientX, event.clientY);
            } else {
                win.removeEventListener('mousemove', handleMouseMove);
                this.cleanupListener = null;
            }
        };

        if (!dataRef.current.openEvent || isMouseBasedEvent(dataRef.current.openEvent)) {
            win.addEventListener('mousemove', handleMouseMove);
            const cleanup = () => {
                win.removeEventListener('mousemove', handleMouseMove);
                this.cleanupListener = null;
            };
            this.cleanupListener = cleanup;
            return cleanup;
        }

        this.store.set('positionReference', this.store.select('domReferenceElement'));
        return;
    }

    private readonly setPointerType = (event: PointerEvent) => {
        if (this.pointerType !== event.pointerType) {
            this.pointerType = event.pointerType;
            this.sync();
        }
    };

    private readonly handleReferenceEnterOrMove = (event: MouseEvent) => {
        const { x, y } = this.settings;
        if (x != null || y != null) {
            return;
        }

        if (!this.store.select('open')) {
            this.setReference(event.clientX, event.clientY);
        } else if (!this.cleanupListener) {
            // If there's no cleanup, there's no listener, but we want to ensure
            // we add the listener if the cursor landed on the floating element and
            // then back on the reference (i.e. it's interactive).
            this.reactive += 1;
            this.sync();
        }
    };
}
