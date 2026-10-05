import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { FocusManager } from '~@packages/floating-ui/FocusManager';
import { contains, getTarget } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Interaction, Side, TransitionStatus } from '~@lib/types';
import type { FocusTarget } from '~@packages/floating-ui/FocusManager';
import type { Props } from '~@props/mergeProps';

import type { ComboboxPositionerMachine } from '../positioner/ComboboxPositionerMachine';
import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';

export type ComboboxPopupState = {
    open: boolean;
    side: Side;
    align: Align;
    anchorHidden: boolean;
    transitionStatus: TransitionStatus;
    empty: boolean;
};

export type ComboboxPopupOptions = {
    initialFocus?: FocusTarget | undefined;
    finalFocus?: FocusTarget | undefined;
};

/**
 * State machine of `Combobox.Popup`: focus management (the input inside the popup gets focus) and props.
 */
export class ComboboxPopupMachine {
    readonly focusManager: FocusManager;

    private options: ComboboxPopupOptions;

    private readonly root: ComboboxRootMachine;

    private readonly positioner: ComboboxPositionerMachine | null;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly unsubscribe: () => void;

    constructor(root: ComboboxRootMachine, positioner: ComboboxPositionerMachine | null, options: ComboboxPopupOptions = {}) {
        this.root = root;
        this.positioner = positioner;
        this.options = options;
        this.focusManager = new FocusManager(root.floatingRoot, this.getFocusManagerOptions());
        this.openChangeComplete = new OpenChangeComplete(root.store.state.popupRef, () => {
            if (root.store.state.open) {
                root.store.state.onOpenChangeComplete(true);
            }
        });
        this.unsubscribe = root.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: ComboboxPopupOptions) {
        this.options = options;
        this.sync();
    }

    setElement = (element: HTMLDivElement | null) => {
        this.root.store.state.popupRef.current = element;
    };

    getState(): ComboboxPopupState {
        const positionerState = this.positioner?.getState();
        const { open, transitionStatus } = this.root.store.state;
        return {
            open,
            side: positionerState?.side ?? 'bottom',
            align: positionerState?.align ?? 'center',
            anchorHidden: positionerState?.anchorHidden ?? false,
            transitionStatus,
            empty: this.root.derived.state.filteredItems.length === 0
        };
    }

    static attrs(state: ComboboxPopupState) {
        return getStyleHookProps(state, { ...popupStateMapping, ...transitionStatusMapping });
    }

    getPopupProps(elementProps: Props = {}): Props {
        const { store } = this.root;
        const { inputInsidePopup, openMethod, transitionStatus } = store.state;
        return mergeProps(
            {
                role: inputInsidePopup ? 'dialog' : 'presentation',
                tabIndex: -1,
                onFocus: (event: FocusEvent) => {
                    const target = getTarget(event) as Element | null;
                    if (openMethod !== 'touch' && (contains(store.state.listElement, target) || target === event.currentTarget)) {
                        store.state.inputRef.current?.focus();
                    }
                }
            },
            getDisabledMountTransitionStyles(transitionStatus),
            elementProps
        );
    }

    destroy() {
        this.unsubscribe();
        this.focusManager.destroy();
        this.openChangeComplete.destroy();
    }

    private getFocusManagerOptions() {
        const { store } = this.root;
        const { inputInsidePopup, mounted, openMethod, inputElement, popupRef } = store.state;
        const { initialFocus, finalFocus } = this.options;

        // If opened by touch, focus the popup to avoid opening the virtual keyboard (needed on Android).
        const defaultInitialFocus = inputInsidePopup
            ? (interactionType: Interaction) => (interactionType === 'touch' ? popupRef.current : inputElement)
            : false;

        return {
            disabled: !mounted,
            modal: !inputInsidePopup,
            openInteractionType: openMethod,
            initialFocus: initialFocus === undefined ? defaultInitialFocus : initialFocus,
            returnFocus: finalFocus ?? (inputInsidePopup ? undefined : false)
        };
    }

    private sync() {
        this.focusManager.setOptions(this.getFocusManagerOptions());
        this.openChangeComplete.sync(this.root.store.state.open);
    }
}
