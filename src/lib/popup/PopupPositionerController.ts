import type { Middleware } from '@floating-ui/dom';

import { runOnceAnimationsFinish } from '~@dom/animations';
import { POPUP_COLLISION_AVOIDANCE } from '~@lib/constants';
import { FloatingNodeRegistration } from '~@packages/floating-ui/FloatingNodeRegistration';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { AnchorPositioner } from '~@positioning/AnchorPositioner';
import { AnimationFrame } from '~@timers/AnimationFrame';

import type { Align, Side, Style } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import type { AnchorPositionerOptions, AnchorPositioningSharedOptions, CollisionAvoidance } from '~@positioning/AnchorPositioner';

import type { PopupStoreState } from './popupStoreState';
import type { AnyPopupStore } from './popupTriggers';

export type PopupPositionerOptions = AnchorPositioningSharedOptions & {
    /**
     * Whether the portal keeps the popup mounted when closed.
     * @default false
     */
    keepMounted?: boolean | undefined;
    /**
     * @default 'ltr'
     */
    direction?: 'ltr' | 'rtl' | undefined;
    /**
     * Overrides the setup's `shiftCrossAxis`.
     */
    shiftCrossAxis?: boolean | undefined;
};

export type PopupPositionerSetup = {
    /**
     * ID of the floating tree node of this popup (no node is registered when omitted).
     */
    nodeId?: string | undefined;
    /**
     * ID of the parent node (nested popups).
     */
    parentNodeId?: string | null | undefined;
    tree?: FloatingTreeStore | null | undefined;
    /**
     * @default POPUP_COLLISION_AVOIDANCE
     */
    defaultCollisionAvoidance?: CollisionAvoidance | undefined;
    shiftCrossAxis?: boolean | undefined;
    lazyFlip?: boolean | undefined;
    adaptiveOrigin?: Middleware | undefined;
    /**
     * Reads the open state (e.g. a group's); defaults to the store's.
     */
    getOpen?: (() => boolean) | undefined;
    /**
     * Called when the active trigger changes while open: with `undefined` immediately (enables
     * transitions) and with `'trigger-change'` once the positioner's animations finish.
     */
    onTriggerChange?: ((instant: 'trigger-change' | undefined) => void) | undefined;
};

export type PopupPositionerState = {
    open: boolean;
    side: Side;
    align: Align;
    anchorHidden: boolean;
};

/**
 * The positioner part shared by popups: anchor positioning against the active trigger,
 * floating tree node registration and the positioner element's props.
 * Replacement for `useAnchorPositioning` + `<FloatingNode>` + the positioner's default props.
 */
export class PopupPositionerController<State extends PopupStoreState<unknown>> {
    private positioner: AnchorPositioner | null = null;

    private floatingRoot: FloatingRootStore | null = null;

    private options: PopupPositionerOptions;

    private readonly store: AnyPopupStore<State>;

    private readonly setup: PopupPositionerSetup;

    private readonly node: FloatingNodeRegistration | null;

    private previousTriggerElement: Element | null = null;

    private readonly animationFrame = new AnimationFrame();

    private readonly triggerChangeEffect = new Effect(() => this.handleTriggerChange());

    private readonly listeners = new Set<() => void>();

    private positionerUnsubscribe: (() => void) | null = null;

    private readonly unsubscribe: () => void;

    constructor(store: AnyPopupStore<State>, setup: PopupPositionerSetup, options: PopupPositionerOptions = {}) {
        this.store = store;
        this.setup = setup;
        this.options = options;
        this.node = setup.nodeId === undefined ? null : new FloatingNodeRegistration(setup.tree, setup.nodeId, setup.parentNodeId ?? null);
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: PopupPositionerOptions) {
        this.options = options;
        this.sync();
    }

    /**
     * The anchor positioner (side, alignment, arrow and position state).
     */
    get anchorPositioner(): AnchorPositioner {
        return this.positioner as AnchorPositioner;
    }

    /**
     * Ref callback for the positioner element.
     */
    setElement = (element: HTMLElement | null) => {
        this.store.set('positionerElement', element as State['positionerElement']);
    };

    /**
     * Ref callback for the arrow element.
     */
    setArrow = (element: Element | null) => {
        this.positioner?.setArrow(element);
    };

    /**
     * Subscribes to changes of the position (the popup store is subscribed to separately).
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    getState(): PopupPositionerState {
        const positioner = this.anchorPositioner;
        const state = positioner.store.state;
        return {
            open: this.isOpen(),
            side: positioner.side(state),
            align: AnchorPositioner.align(state),
            anchorHidden: AnchorPositioner.anchorHidden(state)
        };
    }

    getArrowStyles(): Style {
        return AnchorPositioner.arrowStyles(this.anchorPositioner.store.state);
    }

    isArrowUncentered(): boolean {
        return AnchorPositioner.arrowUncentered(this.anchorPositioner.store.state);
    }

    /**
     * Default props of the positioner element.
     */
    getPositionerProps(): { role: 'presentation'; hidden: boolean; style: Style } {
        const open = this.isOpen();
        const mounted = this.store.select('mounted');
        const style: Style = { ...this.anchorPositioner.positionerStyles() };

        if (!open) {
            style.pointerEvents = 'none';
        }
        if (!mounted) {
            style.display = 'none';
        }

        return { role: 'presentation', hidden: !mounted, style };
    }

    destroy() {
        this.unsubscribe();
        this.positionerUnsubscribe?.();
        this.positioner?.destroy();
        this.positioner = null;
        this.triggerChangeEffect.destroy();
        this.animationFrame.cancel();
        this.node?.destroy();
        this.listeners.clear();
    }

    private isOpen() {
        return this.setup.getOpen ? this.setup.getOpen() : this.store.select('open');
    }

    private getPositionerOptions(): AnchorPositionerOptions {
        const { setup, options } = this;
        return {
            ...options,
            mounted: this.store.select('mounted'),
            collisionAvoidance: options.collisionAvoidance ?? setup.defaultCollisionAvoidance ?? POPUP_COLLISION_AVOIDANCE,
            shiftCrossAxis: options.shiftCrossAxis ?? setup.shiftCrossAxis,
            lazyFlip: setup.lazyFlip,
            adaptiveOrigin: setup.adaptiveOrigin
        };
    }

    private sync() {
        const floatingRoot = this.store.select('floatingRootContext');

        if (floatingRoot !== this.floatingRoot) {
            this.positionerUnsubscribe?.();
            this.positioner?.destroy();
            this.floatingRoot = floatingRoot;
            this.positioner = new AnchorPositioner(floatingRoot, this.getPositionerOptions());
            this.positionerUnsubscribe = this.positioner.store.subscribe(() => this.emit());
            this.node?.attach(floatingRoot, () => this.anchorPositioner.store.state.placement);
        } else {
            this.positioner?.setOptions(this.getPositionerOptions());
        }

        if (this.setup.onTriggerChange) {
            this.triggerChangeEffect.sync([floatingRoot.select('domReferenceElement')]);
        }
    }

    private handleTriggerChange() {
        const currentTriggerElement = this.floatingRoot?.select('domReferenceElement') ?? null;
        const previousTriggerElement = this.previousTriggerElement;

        if (currentTriggerElement) {
            this.previousTriggerElement = currentTriggerElement;
        }

        if (!previousTriggerElement || !currentTriggerElement || currentTriggerElement === previousTriggerElement) {
            return;
        }

        this.setup.onTriggerChange?.(undefined);
        const abortController = new AbortController();
        runOnceAnimationsFinish(
            this.store.select('positionerElement'),
            () => {
                this.setup.onTriggerChange?.('trigger-change');
            },
            { signal: abortController.signal, frame: this.animationFrame }
        );

        return () => {
            abortController.abort();
        };
    }

    private emit() {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
