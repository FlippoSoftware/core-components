import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { ClientPointInteraction } from '~@packages/floating-ui/interactions/ClientPointInteraction';
import { DismissInteraction } from '~@packages/floating-ui/interactions/DismissInteraction';
import { FocusInteraction } from '~@packages/floating-ui/interactions/FocusInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { PopupRootController } from '~@popup/PopupRootController';

import type { ElementProps } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import type { InteractionProps } from '~@packages/floating-ui/types';

import { selectTooltipMultipleActive, selectTooltipOpen } from '../store/TooltipMultipleStore';
import { TooltipStore } from '../store/TooltipStore';

import type { TooltipMultipleMachine } from '../multiple/TooltipMultipleMachine';
import type { TooltipChangeEventDetails, TooltipState } from '../store/TooltipStore';

export type TooltipTrackCursorAxis = 'none' | 'x' | 'y' | 'both';

export type TooltipRootOptions = {
    open?: boolean | undefined;
    /**
     * @default false
     */
    defaultOpen?: boolean | undefined;
    onOpenChange?: ((open: boolean, eventDetails: TooltipChangeEventDetails) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
    /**
     * @default false
     */
    disableHoverablePopup?: boolean | undefined;
    /**
     * @default 'none'
     */
    trackCursorAxis?: TooltipTrackCursorAxis | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    triggerId?: string | null | undefined;
    /**
     * @default null
     */
    defaultTriggerId?: string | null | undefined;
};

export type TooltipRootSetup<Payload> = {
    /**
     * Store of a handle (`createTooltipHandle`); a new store is created when omitted.
     */
    store?: TooltipStore<Payload> | undefined;
    /**
     * The enclosing `Tooltip.Multiple`, if any.
     */
    multiple?: TooltipMultipleMachine | null | undefined;
    floatingId?: string | undefined;
    tree?: FloatingTreeStore | null | undefined;
    /**
     * `ReactDOM.flushSync` in React.
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

export type TooltipRootActions = {
    unmount: () => void;
    close: () => void;
};

/**
 * State machine of `Tooltip.Root`: open state (own or shared with a `Tooltip.Multiple` group),
 * transitions, instant animations in delay groups and focus/dismiss/client point interactions.
 */
export class TooltipRootMachine<Payload = unknown> {
    readonly store: TooltipStore<Payload>;

    readonly floatingRoot: FloatingRootStore;

    readonly actions: TooltipRootActions;

    private options: TooltipRootOptions;

    private readonly multiple: TooltipMultipleMachine | null;

    private readonly tree: FloatingTreeStore | null;

    private readonly multipleItem: ListRegistryItem | null = null;

    private readonly controller: PopupRootController<TooltipState<Payload>>;

    private readonly focus: FocusInteraction;

    private readonly dismiss: DismissInteraction;

    private readonly clientPoint: ClientPointInteraction;

    private previousInstantType: TooltipState<Payload>['instantType'] | null = null;

    private readonly propsEffect = new Effect(() => this.updateSharedProps());

    private readonly unsubscribers: (() => void)[] = [];

    constructor(options: TooltipRootOptions, setup: TooltipRootSetup<Payload> = {}) {
        const { open, defaultOpen = false, triggerId, defaultTriggerId = null } = options;
        const multiple = setup.multiple ?? null;

        this.options = options;
        this.multiple = multiple;
        this.tree = setup.tree ?? null;
        this.store =
            setup.store ??
            new TooltipStore<Payload>({
                // When inside Multiple, use Multiple's open state initially.
                open: multiple ? multiple.store.select('open') : (open ?? defaultOpen),
                activeTriggerId: triggerId !== undefined ? triggerId : defaultTriggerId
            });

        if (setup.flushSync) {
            this.store.setContextValue('flushSync', setup.flushSync);
        }

        if (multiple) {
            this.unsubscribers.push(multiple.store.registerStore(this.store as TooltipStore<unknown>));
            this.multipleItem = new ListRegistryItem(multiple.registry, {
                onIndexChange: (index) => this.store.set('multipleItemIndex', index)
            });
            // Re-run transitions and derived state when the group's shared state changes.
            this.unsubscribers.push(multiple.store.subscribe(() => this.store.notifyAll()));
        }

        this.controller = new PopupRootController<TooltipState<Payload>>(
            this.store,
            {
                setOpen: (nextOpen, details) => this.store.setOpen(nextOpen, details as never),
                floatingId: setup.floatingId,
                getTransitionOpen: () => this.isOpen(),
                getTriggerOpen: () => this.getOpenState(),
                flush: setup.flushSync,
                onChange: () => this.sync()
            },
            this.getControllerOptions()
        );
        this.floatingRoot = this.controller.floatingRoot;

        this.focus = new FocusInteraction(this.floatingRoot, this.getFocusOptions());
        this.dismiss = new DismissInteraction(this.floatingRoot, this.getDismissOptions());
        this.clientPoint = new ClientPointInteraction(this.floatingRoot, this.getClientPointOptions());

        this.actions = {
            unmount: this.controller.unmount,
            close: () => {
                this.store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction));
            }
        };

        this.unsubscribers.push(this.floatingRoot.subscribe(() => this.sync()));
        this.sync();
    }

    setOptions(options: TooltipRootOptions) {
        this.options = options;
        this.controller.setOptions(this.getControllerOptions());
        this.focus.setOptions(this.getFocusOptions());
        this.dismiss.setOptions(this.getDismissOptions());
        this.clientPoint.setOptions(this.getClientPointOptions());
        this.sync();
    }

    /**
     * Ref callback for the hidden marker rendered inside `Tooltip.Multiple`
     * (registers the tooltip in the group's list). Render it with {@link TooltipRootMachine.multipleMarkerStyle}.
     */
    setMultipleItemElement = (element: HTMLElement | null) => {
        this.multipleItem?.setElement(element);
    };

    /**
     * Whether the adapter must render the hidden marker for `Tooltip.Multiple`.
     */
    get isInsideMultiple(): boolean {
        return this.multiple !== null;
    }

    readonly multipleMarkerStyle = visuallyHidden;

    /**
     * The open state, shared with the `Tooltip.Multiple` group when inside one.
     */
    getOpenState(): boolean {
        return selectTooltipOpen(this.store as TooltipStore<unknown>, this.multiple?.store ?? null);
    }

    /**
     * Whether this tooltip is the active one of its `Tooltip.Multiple` group.
     */
    isMultipleActive(): boolean {
        return selectTooltipMultipleActive(this.store as TooltipStore<unknown>, this.multiple?.store ?? null);
    }

    getState(): { payload: Payload | undefined } {
        return { payload: this.store.select('payload') as Payload | undefined };
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.multipleItem?.setElement(null);
        this.propsEffect.destroy();
        this.focus.destroy();
        this.dismiss.destroy();
        this.clientPoint.destroy();
        this.controller.destroy();
    }

    private get disabled() {
        return this.options.disabled ?? false;
    }

    private isOpen() {
        return !this.disabled && this.getOpenState();
    }

    private getControllerOptions() {
        const { open, triggerId, onOpenChange, onOpenChangeComplete } = this.options;
        return {
            // When inside Multiple, don't use the controlled prop: Multiple handles it.
            open: this.multiple ? undefined : open,
            triggerId,
            onOpenChange: onOpenChange as never,
            onOpenChangeComplete
        };
    }

    private getFocusOptions() {
        const multiple = this.multiple;
        return {
            enabled: !this.disabled,
            // For Multiple: block blur close if focus moves to another element in the group.
            shouldBlockBlurClose: multiple
                ? (relatedTarget: Element | null) => relatedTarget != null && multiple.store.isElementInGroup(relatedTarget)
                : undefined
        };
    }

    private getDismissOptions() {
        return { enabled: !this.disabled, referencePress: true, tree: this.tree };
    }

    private getClientPointOptions() {
        const { trackCursorAxis = 'none' } = this.options;
        return {
            enabled: !this.disabled && trackCursorAxis !== 'none',
            axis: trackCursorAxis === 'none' ? undefined : trackCursorAxis
        };
    }

    private sync() {
        const { store } = this;
        const { trackCursorAxis = 'none', disableHoverablePopup = false } = this.options;
        const openState = this.getOpenState();
        const open = this.isOpen();

        store.update({ trackCursorAxis, disableHoverablePopup, disabled: this.disabled });

        if (openState && this.disabled) {
            store.setOpen(false, createChangeEventDetails(REASONS.disabled));
        }

        this.syncInstantType();

        if (open && store.select('activeTriggerId') == null) {
            store.set('payload', undefined);
        }

        const rootState = this.floatingRoot.state;
        this.propsEffect.sync([
            rootState.open,
            rootState.floatingId,
            rootState.domReferenceElement,
            rootState.floatingElement,
            this.disabled,
            trackCursorAxis
        ]);
    }

    /**
     * Animations should be instant in two cases:
     * 1) opening during the provider's instant phase (adjacent tooltip opens instantly);
     * 2) closing because another tooltip opened (reason === 'none').
     * Otherwise, allow the animation to play.
     */
    private syncInstantType() {
        const { store } = this;
        const transitionStatus = store.select('transitionStatus');
        const instantType = store.select('instantType');
        const reason = store.select('lastOpenChangeReason');

        if (
            (transitionStatus === 'ending' && reason === REASONS.none) ||
            (transitionStatus !== 'ending' && store.select('isInstantPhase'))
        ) {
            // Capture the current instant type so we can restore it later and set it to 'delay' to
            // disable animations while moving from one trigger to another within a delay group.
            if (instantType !== 'delay') {
                this.previousInstantType = instantType;
            }
            store.set('instantType', 'delay');
        } else if (this.previousInstantType !== null) {
            const previous = this.previousInstantType;
            this.previousInstantType = null;
            store.set('instantType', previous);
        }
    }

    private updateSharedProps() {
        const list: InteractionProps[] = [this.focus.getProps(), this.dismiss.getProps(), this.clientPoint.getProps()];
        this.store.update({
            activeTriggerProps: mergeInteractionProps(undefined, list, 'reference') as ElementProps,
            inactiveTriggerProps: mergeInteractionProps(undefined, list, 'trigger') as ElementProps,
            popupProps: mergeInteractionProps(undefined, list, 'floating') as ElementProps
        });
    }
}
