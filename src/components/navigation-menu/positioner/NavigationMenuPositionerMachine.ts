import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { DROPDOWN_COLLISION_AVOIDANCE, POPUP_COLLISION_AVOIDANCE } from '~@lib/constants';
import { ownerWindow } from '~@lib/owner';
import { adaptiveOrigin } from '~@packages/floating-ui/middleware/adaptiveOriginMiddleware';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { disableFocusInside, enableFocusInside, isOutsideEvent } from '~@packages/floating-ui/utils/tabbable';
import { AnchorPositioner } from '~@positioning/AnchorPositioner';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { Align, Side, Style } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { AnchorPositioningSharedOptions } from '~@positioning/AnchorPositioner';
import type { Props } from '~@props/mergeProps';

import { EMPTY_ROOT_CONTEXT } from '../utils/constants';

import type { NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

export type NavigationMenuPositionerState = {
    open: boolean;
    side: Side;
    align: Align;
    anchorHidden: boolean;
    instant: boolean;
};

/**
 * State machine of `NavigationMenu.Positioner`: positions the popup against the active trigger and keeps
 * the portal's content tabbable only once focus entered it.
 */
export class NavigationMenuPositionerMachine {
    readonly store = new Store<{ instant: boolean }>({ instant: false });

    private positioner: AnchorPositioner | null = null;

    private positionerRoot: FloatingRootStore | undefined | null = null;

    private options: AnchorPositioningSharedOptions & { keepMounted?: boolean | undefined };

    private readonly root: NavigationMenuRootMachine;

    private readonly resizeTimeout = new Timeout();

    private readonly listeners = new Set<() => void>();

    private positionerUnsubscribe: (() => void) | null = null;

    private readonly focusEffect = new Effect(() => this.manageFocusInside());

    private readonly resizeEffect = new Effect(() => this.trackResize());

    private readonly unsubscribers: (() => void)[];

    constructor(root: NavigationMenuRootMachine, options: AnchorPositioningSharedOptions & { keepMounted?: boolean | undefined } = {}) {
        this.root = root;
        this.options = options;
        this.unsubscribers = [root.store.subscribe(() => this.sync()), root.transitions.store.subscribe(() => this.sync())];
        this.sync();
    }

    setOptions(options: AnchorPositioningSharedOptions & { keepMounted?: boolean | undefined }) {
        this.options = options;
        this.sync();
    }

    get anchorPositioner(): AnchorPositioner {
        return this.positioner as AnchorPositioner;
    }

    /**
     * Subscribes to position changes (they don't go through the root store).
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    setElement = (element: HTMLElement | null) => {
        this.root.store.set('positionerElement', element);
    };

    getState(): NavigationMenuPositionerState {
        const state = this.anchorPositioner.store.state;
        return {
            open: this.root.open,
            side: this.anchorPositioner.side(state),
            align: AnchorPositioner.align(state),
            anchorHidden: AnchorPositioner.anchorHidden(state),
            instant: this.store.state.instant
        };
    }

    static attrs(state: NavigationMenuPositionerState) {
        return getStyleHookProps(state, popupStateMapping);
    }

    getPositionerProps(elementProps: Props = {}): Props {
        const { root } = this;
        const style: Style = { ...this.anchorPositioner.positionerStyles() };
        if (!root.open) {
            style.pointerEvents = 'none';
        }
        return mergeProps(
            { role: 'presentation', hidden: !root.transitions.state.mounted, style },
            getDisabledMountTransitionStyles(root.transitions.state.transitionStatus),
            elementProps
        );
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.positionerUnsubscribe?.();
        this.positioner?.destroy();
        this.focusEffect.destroy();
        this.resizeEffect.destroy();
        this.resizeTimeout.clear();
        this.listeners.clear();
    }

    private getAnchorOptions() {
        const { root } = this;
        const floatingRoot = root.store.state.floatingRootContext;
        const domReference = floatingRoot?.select('domReferenceElement');
        return {
            ...this.options,
            anchor: this.options.anchor ?? domReference ?? (root.prevTriggerElementRef as never),
            mounted: root.transitions.state.mounted,
            collisionAvoidance: this.options.collisionAvoidance ?? (root.nested ? POPUP_COLLISION_AVOIDANCE : DROPDOWN_COLLISION_AVOIDANCE),
            // Keeps the popup anchored while its size and position transition when side=top or side=left.
            adaptiveOrigin
        };
    }

    private sync() {
        const { root } = this;
        const floatingRoot = root.store.state.floatingRootContext;
        if (this.positioner === null || floatingRoot !== this.positionerRoot) {
            this.positionerUnsubscribe?.();
            this.positioner?.destroy();
            this.positionerRoot = floatingRoot;
            this.positioner = new AnchorPositioner(floatingRoot ?? EMPTY_ROOT_CONTEXT, this.getAnchorOptions());
            this.positionerUnsubscribe = this.positioner.store.subscribe(() => {
                for (const listener of this.listeners) {
                    listener();
                }
            });
        } else {
            this.positioner.setOptions(this.getAnchorOptions());
        }
        this.focusEffect.sync([root.store.state.positionerElement]);
        this.resizeEffect.sync([root.open, root.store.state.positionerElement]);
    }

    /**
     * Content of the portal is tabbable only once focus entered it (through a guard or the mouse).
     */
    private manageFocusInside() {
        const positionerElement = this.root.store.state.positionerElement;
        if (!positionerElement) {
            return;
        }
        const onFocus = (event: FocusEvent) => {
            if (isOutsideEvent(event)) {
                (event.type === 'focusin' ? enableFocusInside : disableFocusInside)(positionerElement);
            }
        };
        // Capture phase: run before the focus guards' handlers.
        positionerElement.addEventListener('focusin', onFocus, true);
        positionerElement.addEventListener('focusout', onFocus, true);
        return () => {
            positionerElement.removeEventListener('focusin', onFocus, true);
            positionerElement.removeEventListener('focusout', onFocus, true);
        };
    }

    private trackResize() {
        if (!this.root.open) {
            return;
        }
        const win = ownerWindow(this.root.store.state.positionerElement);
        const handleResize = () => {
            this.store.set('instant', true);
            this.resizeTimeout.start(100, () => this.store.set('instant', false));
        };
        win.addEventListener('resize', handleResize);
        return () => win.removeEventListener('resize', handleResize);
    }
}
