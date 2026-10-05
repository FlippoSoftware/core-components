import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { COMPOSITE_KEYS } from '~@components/composite/utils/compositeKeys';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { FocusManager } from '~@packages/floating-ui/FocusManager';
import { HoverFloatingInteraction } from '~@packages/floating-ui/interactions/hover/HoverFloatingInteraction';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Side, TransitionStatus } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { FocusManagerOptions, FocusTarget } from '~@packages/floating-ui/FocusManager';
import type { Props } from '~@props/mergeProps';

import type { MenuPositionerMachine } from '../positioner/MenuPositionerMachine';
import type { MenuRootMachine } from '../root/MenuRootMachine';
import type { MenuChangeEventReason, MenuStore } from '../store/MenuStore';

import { menuPopupStateAttributesMapping } from './menuPopupStateAttributesMapping';

export type MenuPopupState = {
    transitionStatus: TransitionStatus;
    side: Side;
    align: Align;
    open: boolean;
    nested: boolean;
    instant: 'dismiss' | 'click' | 'group' | undefined;
};

export type MenuPopupOptions = {
    finalFocus?: FocusTarget | undefined;
};

export type MenuPopupSetup = {
    positioner: MenuPositionerMachine<unknown> | null;
    /**
     * @default false
     */
    insideToolbar?: boolean | undefined;
};

/**
 * State machine of `Menu.Popup`: focus management, hover close and closing on item press.
 */
export class MenuPopupMachine<Payload = unknown> {
    private options: MenuPopupOptions;

    private readonly root: MenuRootMachine<Payload>;

    private readonly setup: MenuPopupSetup;

    private floatingRoot: FloatingRootStore | null = null;

    private focusManagerInstance: FocusManager | null = null;

    private hover: HoverFloatingInteraction | null = null;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly unsubscribers: (() => void)[] = [];

    constructor(root: MenuRootMachine<Payload>, setup: MenuPopupSetup, options: MenuPopupOptions = {}) {
        this.root = root;
        this.setup = setup;
        this.options = options;
        const { store } = root;
        this.openChangeComplete = new OpenChangeComplete(store.context.popupRef, () => {
            if (store.select('open')) {
                store.context.onOpenChangeComplete?.(true);
            }
        });

        const events = root.tree.events;
        events.on('close', this.handleTreeClose);
        this.unsubscribers.push(
            () => events.off('close', this.handleTreeClose),
            store.subscribe(() => this.sync())
        );
        this.sync();
    }

    private get store(): MenuStore<Payload> {
        return this.root.store;
    }

    setOptions(options: MenuPopupOptions) {
        this.options = options;
        this.sync();
    }

    get focusManager(): FocusManager {
        return this.focusManagerInstance as FocusManager;
    }

    setElement = (element: HTMLElement | null) => {
        this.store.context.popupRef.current = element;
        this.store.set('popupElement', element);
    };

    static attrs(state: MenuPopupState) {
        return getStyleHookProps(state, menuPopupStateAttributesMapping);
    }

    getState(): MenuPopupState {
        const positionerState = this.setup.positioner?.getState();
        return {
            transitionStatus: this.store.select('transitionStatus'),
            side: positionerState?.side ?? 'bottom',
            align: positionerState?.align ?? 'center',
            open: this.store.select('open'),
            nested: this.store.select('parent').type === 'menu',
            instant: this.store.select('instantType')
        };
    }

    getPopupProps(elementProps: Props = {}): Props {
        const { store } = this;
        return mergeProps(
            store.select('popupProps'),
            {
                onKeyDown: (event: KeyboardEvent) => {
                    if (this.setup.insideToolbar && COMPOSITE_KEYS.has(event.key)) {
                        event.stopPropagation();
                    }
                }
            },
            getDisabledMountTransitionStyles(store.select('transitionStatus')),
            elementProps,
            { 'data-rootownerid': store.select('rootId') }
        );
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.focusManagerInstance?.destroy();
        this.hover?.destroy();
        this.focusManagerInstance = null;
        this.hover = null;
        this.openChangeComplete.destroy();
    }

    private readonly handleTreeClose = (event: { domEvent: Event | undefined; reason: MenuChangeEventReason }) => {
        this.store.setOpen(false, createChangeEventDetails(event.reason, event.domEvent));
    };

    private getFocusManagerOptions(): FocusManagerOptions {
        const { store } = this;
        const parent = store.select('parent');
        const isContextMenu = parent.type === 'context-menu';
        const triggerElement = store.select('activeTriggerElement');

        let returnFocus = parent.type === undefined || isContextMenu;
        if (triggerElement || (parent.type === 'menubar' && store.select('lastOpenChangeReason') !== REASONS.outsidePress)) {
            returnFocus = true;
        }

        return {
            modal: isContextMenu,
            disabled: !store.select('mounted'),
            returnFocus: this.options.finalFocus === undefined ? returnFocus : this.options.finalFocus,
            initialFocus: parent.type !== 'menu',
            restoreFocus: true,
            tree: parent.type !== 'menubar' ? this.root.tree : undefined,
            previousFocusableElement: triggerElement ?? undefined,
            nextFocusableElement: parent.type === undefined ? store.context.triggerFocusTargetRef : undefined,
            beforeContentFocusGuardRef: parent.type === undefined ? store.context.beforeContentFocusGuardRef : undefined
        };
    }

    private getHoverOptions() {
        const { store } = this;
        const parent = store.select('parent');
        return {
            enabled:
                store.select('hoverEnabled') && !store.select('disabled') && parent.type !== 'context-menu' && parent.type !== 'menubar',
            closeDelay: store.select('closeDelay'),
            tree: this.root.tree
        };
    }

    private sync() {
        const floatingRoot = this.store.select('floatingRootContext');
        if (floatingRoot !== this.floatingRoot) {
            this.focusManagerInstance?.destroy();
            this.hover?.destroy();
            this.floatingRoot = floatingRoot;
            this.focusManagerInstance = new FocusManager(floatingRoot, this.getFocusManagerOptions());
            this.hover = new HoverFloatingInteraction(floatingRoot, this.getHoverOptions());
        } else {
            this.focusManagerInstance?.setOptions(this.getFocusManagerOptions());
            this.hover?.setOptions(this.getHoverOptions());
        }
        this.openChangeComplete.sync(this.store.select('open'));
    }
}
