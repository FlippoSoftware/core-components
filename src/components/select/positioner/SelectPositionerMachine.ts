import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { getInternalBackdropProps } from '~@dom/internalBackdrop';
import { acquireScrollLock } from '~@dom/scrollLock';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { DROPDOWN_COLLISION_AVOIDANCE } from '~@lib/constants';
import { findItemIndex, selectedValueIncludes } from '~@lib/itemEquality';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { AnchorPositioner } from '~@positioning/AnchorPositioner';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { ListRegistryMap } from '~@components/composite/list/ListRegistry';
import type { Align, MutableRef, Side, Style } from '~@lib/types';
import type { AnchorPositioningSharedOptions } from '~@positioning/AnchorPositioner';
import type { Props } from '~@props/mergeProps';

import { clearStyles } from '../utils/popupUtils';

import type { SelectRootMachine } from '../root/SelectRootMachine';

export type SelectPositionerOptions = AnchorPositioningSharedOptions & {
    /**
     * Whether to overlap the trigger so the selected item's text aligns with the trigger's value.
     * @default true
     */
    alignItemWithTrigger?: boolean | undefined;
};

export type SelectPositionerState = {
    open: boolean;
    side: Side | 'none';
    align: Align;
    anchorHidden: boolean;
};

type PositionerInternalState = {
    controlledAlignItemWithTrigger: boolean;
};

/**
 * State machine of `Select.Positioner`: anchor positioning or alignment of the selected item with the trigger,
 * the item registry (pruning values whose items disappeared), scroll lock and the internal backdrop.
 */
export class SelectPositionerMachine {
    readonly positioner: AnchorPositioner;

    readonly store: Store<PositionerInternalState>;

    readonly items: ListRegistry;

    readonly scrollUpArrowRef: MutableRef<HTMLElement | null> = { current: null };

    readonly scrollDownArrowRef: MutableRef<HTMLElement | null> = { current: null };

    private options: SelectPositionerOptions;

    private readonly root: SelectRootMachine;

    private prevMapSize = 0;

    private readonly scrollLock = new Effect(() => {
        const { open, openMethod, modal, triggerElement } = this.root.store.state;
        if (!((this.alignItemWithTriggerActive || modal) && open && openMethod !== 'touch')) {
            return;
        }
        return acquireScrollLock(triggerElement);
    });

    private readonly unsubscribers: (() => void)[] = [];

    constructor(root: SelectRootMachine, options: SelectPositionerOptions = {}) {
        this.root = root;
        this.options = options;
        this.store = new Store<PositionerInternalState>({ controlledAlignItemWithTrigger: options.alignItemWithTrigger ?? true });
        this.positioner = new AnchorPositioner(root.floatingRoot, this.getAnchorOptions());
        this.items = new ListRegistry({
            elementsRef: root.refs.listRef,
            labelsRef: root.refs.labelsRef,
            onMapChange: this.onMapChange
        });
        this.unsubscribers.push(
            root.store.subscribe(() => this.sync()),
            this.store.subscribe(() => this.sync())
        );
        this.sync();
    }

    setOptions(options: SelectPositionerOptions) {
        this.options = options;
        this.sync();
    }

    /**
     * Whether the popup is aligned with the trigger (disabled for touch and when there's no room).
     */
    get alignItemWithTriggerActive(): boolean {
        const { mounted, openMethod } = this.root.store.state;
        return mounted && this.store.state.controlledAlignItemWithTrigger && openMethod !== 'touch';
    }

    setControlledAlignItemWithTrigger = (value: boolean) => {
        this.store.set('controlledAlignItemWithTrigger', value);
    };

    setElement = (element: HTMLElement | null) => {
        this.root.setPositionerElement(element);
    };

    getSide(): Side | 'none' {
        return this.alignItemWithTriggerActive ? 'none' : this.positioner.side();
    }

    getState(): SelectPositionerState {
        const state = this.positioner.store.state;
        return {
            open: this.root.store.state.open,
            side: this.getSide(),
            align: AnchorPositioner.align(state),
            anchorHidden: AnchorPositioner.anchorHidden(state)
        };
    }

    static attrs(state: SelectPositionerState) {
        return getStyleHookProps(state, popupStateMapping);
    }

    getPositionerProps(elementProps: Props = {}): Props {
        const { open, mounted, transitionStatus } = this.root.store.state;
        const style: Style = this.alignItemWithTriggerActive ? { position: 'fixed' } : { ...this.positioner.positionerStyles() };
        if (!open) {
            style.pointerEvents = 'none';
        }
        if (!mounted) {
            style.display = 'none';
        }
        return mergeProps(
            { role: 'presentation', hidden: !mounted, style },
            getDisabledMountTransitionStyles(transitionStatus),
            elementProps
        );
    }

    shouldRenderInternalBackdrop(): boolean {
        const { mounted, modal } = this.root.store.state;
        return mounted && modal;
    }

    getInternalBackdropProps() {
        const { open, triggerElement } = this.root.store.state;
        return getInternalBackdropProps(triggerElement, !open);
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.scrollLock.destroy();
        this.positioner.destroy();
        this.items.destroy();
    }

    private getAnchorOptions() {
        const { alignItemWithTrigger: _alignItemWithTrigger, ...options } = this.options;
        return {
            ...options,
            side: options.side ?? 'bottom',
            align: options.align ?? 'center',
            mounted: this.root.store.state.mounted,
            disableAnchorTracking: options.disableAnchorTracking ?? this.alignItemWithTriggerActive,
            collisionAvoidance: options.collisionAvoidance ?? DROPDOWN_COLLISION_AVOIDANCE,
            keepMounted: true
        };
    }

    private sync() {
        const { store } = this.root;
        const { alignItemWithTrigger = true } = this.options;

        if (!store.state.mounted) {
            if (this.store.state.controlledAlignItemWithTrigger !== alignItemWithTrigger) {
                this.store.set('controlledAlignItemWithTrigger', alignItemWithTrigger);
            }
            if (store.state.scrollUpArrowVisible || store.state.scrollDownArrowVisible) {
                store.update({ scrollUpArrowVisible: false, scrollDownArrowVisible: false });
            }
        }

        this.root.refs.alignItemWithTriggerActiveRef.current = this.alignItemWithTriggerActive;
        this.positioner.setOptions(this.getAnchorOptions());
        this.scrollLock.sync([
            this.alignItemWithTriggerActive,
            store.state.modal,
            store.state.open,
            store.state.openMethod,
            store.state.triggerElement
        ]);
    }

    /**
     * Prunes selected values whose items were removed.
     */
    private readonly onMapChange = (map: ListRegistryMap<Record<string, unknown>>) => {
        const { root } = this;
        const { store, refs } = root;
        if (map.size === 0 && this.prevMapSize === 0) {
            return;
        }
        if (refs.valuesRef.current.length === 0) {
            return;
        }
        const prevSize = this.prevMapSize;
        this.prevMapSize = map.size;
        if (map.size === prevSize) {
            return;
        }

        const { value, multiple, isItemEqualToValue, open } = store.state;
        const eventDetails = createChangeEventDetails(REASONS.none);

        if (prevSize !== 0 && !multiple && value !== null && findItemIndex(refs.valuesRef.current, value, isItemEqualToValue) === -1) {
            const initialValue = refs.initialValueRef.current;
            const hasInitial = initialValue != null && findItemIndex(refs.valuesRef.current, initialValue, isItemEqualToValue) !== -1;
            const nextValue = hasInitial ? initialValue : null;
            root.setValue(nextValue, eventDetails);
            if (nextValue === null) {
                store.set('selectedIndex', null);
                refs.selectedItemTextRef.current = null;
            }
        }

        if (prevSize !== 0 && multiple && Array.isArray(value)) {
            const nextValue = value.filter((item) => findItemIndex(refs.valuesRef.current, item, isItemEqualToValue) !== -1);
            if (nextValue.length !== value.length || nextValue.some((item) => !selectedValueIncludes(value, item, isItemEqualToValue))) {
                root.setValue(nextValue, eventDetails);
                if (nextValue.length === 0) {
                    store.set('selectedIndex', null);
                    refs.selectedItemTextRef.current = null;
                }
            }
        }

        if (open && this.alignItemWithTriggerActive) {
            store.update({ scrollUpArrowVisible: false, scrollDownArrowVisible: false });
            clearStyles(store.state.positionerElement, { height: '' });
            clearStyles(refs.popupRef.current, { height: '' });
        }
    };
}
