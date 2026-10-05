import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { COMPOSITE_KEYS } from '~@components/composite/utils/compositeKeys';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { FocusManager } from '~@packages/floating-ui/FocusManager';
import { mergeProps } from '~@props/mergeProps';

import type { Interaction, Style, TransitionStatus } from '~@lib/types';
import type { FloatingPortalController } from '~@packages/floating-ui/FloatingPortalController';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import type { FocusManagerOptions, FocusTarget } from '~@packages/floating-ui/FocusManager';
import type { Props } from '~@props/mergeProps';

import { getDialogState } from '../utils/getDialogState';

import type { DialogStore } from '../store/DialogStore';
import type { AnyDialogStore } from '../utils/AnyDialogStore';

import { DialogPopupCssVars } from './DialogPopupCssVars';
import { dialogPopupStateAttributesMapping } from './dialogPopupStateAttributesMapping';

export type DialogPopupState = {
    open: boolean;
    transitionStatus: TransitionStatus;
    nested: boolean;
    nestedDialogOpen: boolean;
};

export type DialogPopupOptions = {
    initialFocus?: FocusTarget | undefined;
    finalFocus?: FocusTarget | undefined;
};

export type DialogPopupSetup = {
    tree?: FloatingTreeStore | null | undefined;
    portal?: FloatingPortalController | null | undefined;
};

/**
 * State machine of `Dialog.Popup`: focus management (trap for modal dialogs) and the popup's props.
 */
export class DialogPopupMachine<Payload = unknown> {
    private options: DialogPopupOptions;

    private readonly store: DialogStore<Payload>;

    private readonly setup: DialogPopupSetup;

    private floatingRoot: FloatingRootStore | null = null;

    private focusManagerInstance: FocusManager | null = null;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly unsubscribe: () => void;

    constructor(store: DialogStore<Payload>, options: DialogPopupOptions = {}, setup: DialogPopupSetup = {}) {
        this.store = store;
        this.options = options;
        this.setup = setup;
        this.openChangeComplete = new OpenChangeComplete(store.context.popupRef, () => {
            if (store.select('open')) {
                store.context.onOpenChangeComplete?.(true);
            }
        });
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: DialogPopupOptions) {
        this.options = options;
        this.sync();
    }

    /**
     * The focus manager; the adapter renders its focus guards around the popup.
     */
    get focusManager(): FocusManager {
        return this.focusManagerInstance as FocusManager;
    }

    setElement = (element: HTMLElement | null) => {
        this.store.context.popupRef.current = element;
        this.store.set('popupElement', element);
    };

    static attrs(state: DialogPopupState) {
        return getStyleHookProps(state, dialogPopupStateAttributesMapping);
    }

    getState(): DialogPopupState {
        return getDialogState(this.store as AnyDialogStore);
    }

    getPopupProps(elementProps: Props = {}): Props {
        const { store } = this;
        return mergeProps(
            store.select('popupProps'),
            {
                'aria-labelledby': store.select('titleElementId') ?? undefined,
                'aria-describedby': store.select('descriptionElementId') ?? undefined,
                role: store.select('role'),
                tabIndex: -1,
                hidden: !store.select('mounted'),
                onKeyDown: (event: KeyboardEvent) => {
                    if (COMPOSITE_KEYS.has(event.key)) {
                        event.stopPropagation();
                    }
                },
                style: { [DialogPopupCssVars.nestedDialogs]: store.select('nestedOpenDialogCount') } as Style
            },
            elementProps
        );
    }

    destroy() {
        this.unsubscribe();
        this.focusManagerInstance?.destroy();
        this.focusManagerInstance = null;
        this.openChangeComplete.destroy();
    }

    private getFocusManagerOptions(): FocusManagerOptions {
        const { store } = this;
        const { initialFocus, finalFocus } = this.options;

        // If opened by touch, focus the popup element to prevent the virtual keyboard from opening
        // (this is required for Android specifically as iOS handles this automatically).
        const defaultInitialFocus = (interactionType: Interaction) => (interactionType === 'touch' ? store.context.popupRef.current : true);

        return {
            openInteractionType: store.select('openMethod'),
            disabled: !store.select('mounted'),
            closeOnFocusOut: !store.select('disablePointerDismissal'),
            initialFocus: initialFocus === undefined ? defaultInitialFocus : initialFocus,
            returnFocus: finalFocus,
            modal: store.select('modal') !== false,
            restoreFocus: 'popup',
            tree: this.setup.tree,
            portal: this.setup.portal
        };
    }

    private sync() {
        const floatingRoot = this.store.select('floatingRootContext');
        if (floatingRoot !== this.floatingRoot) {
            this.focusManagerInstance?.destroy();
            this.floatingRoot = floatingRoot;
            this.focusManagerInstance = new FocusManager(floatingRoot, this.getFocusManagerOptions());
        } else {
            this.focusManagerInstance?.setOptions(this.getFocusManagerOptions());
        }
        this.openChangeComplete.sync(this.store.select('open'));
    }
}
