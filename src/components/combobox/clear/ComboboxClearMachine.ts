import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { triggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';
import type { AnyEvent } from '../utils/AnyEvent';

export type ComboboxClearState = {
    open: boolean;
    disabled: boolean;
    transitionStatus: TransitionStatus;
};

/**
 * State machine of `Combobox.Clear`: visible when there is something to clear.
 */
export class ComboboxClearMachine {
    readonly button: ButtonMachine;

    readonly transitions: TransitionStatusController;

    private options: { disabled?: boolean | undefined; nativeButton?: boolean | undefined };

    private readonly root: ComboboxRootMachine;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly unsubscribers: (() => void)[];

    constructor(root: ComboboxRootMachine, options: { disabled?: boolean | undefined; nativeButton?: boolean | undefined } = {}) {
        this.root = root;
        this.options = options;
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton });
        this.transitions = new TransitionStatusController(this.visible);
        this.openChangeComplete = new OpenChangeComplete(root.store.state.clearRef, () => {
            if (!this.visible) {
                this.transitions.setMounted(false);
            }
        });
        this.unsubscribers = [root.store.subscribe(() => this.sync()), root.inputValue.subscribe(() => this.sync())];
        this.sync();
    }

    setOptions(options: { disabled?: boolean | undefined; nativeButton?: boolean | undefined }) {
        this.options = options;
        this.sync();
    }

    get disabled(): boolean {
        return this.root.disabled || (this.options.disabled ?? false);
    }

    get visible(): boolean {
        const { selectionMode, selectedValue } = this.root.store.state;
        if (selectionMode === 'none') {
            return this.root.inputValue.state.inputValue !== '';
        }
        if (selectionMode === 'single') {
            return selectedValue != null;
        }
        return Array.isArray(selectedValue) && selectedValue.length > 0;
    }

    shouldRender(keepMounted = false): boolean {
        return keepMounted || this.transitions.state.mounted;
    }

    setElement = (element: HTMLButtonElement | null) => {
        this.button.setElement(element);
        this.root.store.state.clearRef.current = element;
    };

    getState(): ComboboxClearState {
        return { disabled: this.disabled, open: this.root.store.state.open, transitionStatus: this.transitions.state.transitionStatus };
    }

    static attrs(state: ComboboxClearState) {
        return getStyleHookProps(state, { ...transitionStatusMapping, ...triggerOpenStateMapping });
    }

    getClearProps(elementProps: Props = {}): Props {
        const { store } = this.root;
        const disabled = this.disabled;
        return mergeProps(
            {
                tabIndex: -1,
                disabled,
                'aria-readonly': store.state.readOnly || undefined,
                // Avoid stealing focus from the input.
                onMouseDown: (event: MouseEvent) => event.preventDefault(),
                onClick: (event: AnyEvent) => {
                    const { readOnly, selectionMode, selectedValue, keyboardActiveRef } = store.state;
                    if (disabled || readOnly) {
                        return;
                    }
                    const nativeEvent = getNativeEvent(event as MouseEvent);
                    const type = keyboardActiveRef.current ? 'keyboard' : 'pointer';
                    store.state.setInputValue('', createChangeEventDetails(REASONS.clearPress, nativeEvent));
                    if (selectionMode !== 'none') {
                        store.state.setSelectedValue(
                            Array.isArray(selectedValue) ? [] : null,
                            createChangeEventDetails(REASONS.clearPress, nativeEvent)
                        );
                        store.state.setIndices({ activeIndex: null, selectedIndex: null, type });
                    } else {
                        store.state.setIndices({ activeIndex: null, type });
                    }
                    store.state.inputRef.current?.focus();
                }
            },
            elementProps,
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.transitions.destroy();
        this.openChangeComplete.destroy();
    }

    private sync() {
        const visible = this.visible;
        this.button.setOptions({ disabled: this.disabled, native: this.options.nativeButton });
        this.transitions.setOpen(visible);
        this.openChangeComplete.sync(visible);
    }
}
