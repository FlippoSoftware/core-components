import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import type { AnyDialogStore } from '../utils/AnyDialogStore';

type ClickLikeEvent = MouseEvent | { nativeEvent: MouseEvent; currentTarget: EventTarget | null };

export type DialogCloseOptions = {
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    nativeButton?: boolean | undefined;
};

/**
 * State machine of `Dialog.Close`.
 */
export class DialogCloseMachine {
    readonly button: ButtonMachine;

    private options: DialogCloseOptions;

    private readonly store: AnyDialogStore;

    constructor(store: AnyDialogStore, options: DialogCloseOptions = {}) {
        this.store = store;
        this.options = options;
        this.button = new ButtonMachine({ disabled: options.disabled, native: options.nativeButton });
    }

    setOptions(options: DialogCloseOptions) {
        this.options = options;
        this.button.setOptions({ disabled: options.disabled, native: options.nativeButton });
    }

    setElement = (element: HTMLElement | null) => {
        this.button.setElement(element);
    };

    getState(): { disabled: boolean } {
        return { disabled: this.options.disabled ?? false };
    }

    getCloseProps(elementProps: Props = {}): Props {
        return mergeProps(
            {
                onClick: (event: ClickLikeEvent) => {
                    if (this.store.select('open')) {
                        this.store.setOpen(
                            false,
                            createChangeEventDetails(REASONS.closePress, getNativeEvent(event as MouseEvent)) as never
                        );
                    }
                }
            },
            elementProps,
            (props: Props) => this.button.getButtonProps(props)
        );
    }
}
