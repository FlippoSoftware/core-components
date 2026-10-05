import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import type { PopoverStore } from '../store/PopoverStore';

export type PopoverCloseOptions = {
    disabled?: boolean | undefined;
    nativeButton?: boolean | undefined;
};

/**
 * State machine of `Popover.Close`.
 */
export class PopoverCloseMachine {
    readonly button: ButtonMachine;

    private readonly store: PopoverStore<unknown>;

    constructor(store: PopoverStore<unknown>, options: PopoverCloseOptions = {}) {
        this.store = store;
        this.button = new ButtonMachine(this.getButtonOptions(options));
    }

    setOptions(options: PopoverCloseOptions) {
        this.button.setOptions(this.getButtonOptions(options));
    }

    setElement = (element: HTMLElement | null) => {
        this.button.setElement(element);
    };

    getCloseProps(elementProps: Props = {}): Props {
        return mergeProps(
            {
                onClick: (event: MouseEvent | { nativeEvent: MouseEvent; currentTarget: EventTarget | null }) => {
                    const nativeEvent = getNativeEvent(event as MouseEvent);
                    const currentTarget = 'currentTarget' in event ? event.currentTarget : nativeEvent.currentTarget;
                    this.store.setOpen(false, createChangeEventDetails(REASONS.closePress, nativeEvent, currentTarget as HTMLElement));
                }
            },
            elementProps,
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    private getButtonOptions({ disabled, nativeButton }: PopoverCloseOptions) {
        return { disabled, focusableWhenDisabled: false, native: nativeButton };
    }
}
