import { getFocusableWhenDisabledProps } from '~@components/button/root/ButtonMachine';
import { ARROW_LEFT, ARROW_RIGHT } from '~@packages/floating-ui/utils/constants';
import { stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { ToolbarItemBase } from '../item/ToolbarItemBase';

import type { ToolbarItemOptions } from '../item/ToolbarItemBase';
import type { ToolbarMachine } from '../root/ToolbarMachine';

/**
 * A toolbar input.
 */
export class ToolbarInputMachine extends ToolbarItemBase {
    constructor(toolbar: ToolbarMachine, options: ToolbarItemOptions = {}) {
        super(toolbar, options, { focusableWhenDisabled: options.focusableWhenDisabled ?? true });
    }

    setOptions(options: ToolbarItemOptions) {
        this.options = options;
        this.listItem.setMetadata({ focusableWhenDisabled: this.focusableWhenDisabled });
    }

    setElement = (element: HTMLElement | null) => {
        this.listItem.setElement(element);
    };

    getProps(elementProps: Props = {}): Props {
        const disabled = this.disabled;
        return mergeProps(
            this.getCompositeItemProps(),
            {
                onClick(event: MouseEvent) {
                    if (disabled) {
                        event.preventDefault();
                    }
                },
                onKeyDown(event: KeyboardEvent) {
                    if (event.key !== ARROW_LEFT && event.key !== ARROW_RIGHT && disabled) {
                        stopEvent(event);
                    }
                },
                onPointerDown(event: PointerEvent) {
                    if (disabled) {
                        event.preventDefault();
                    }
                }
            },
            elementProps,
            getFocusableWhenDisabledProps({
                composite: true,
                disabled,
                focusableWhenDisabled: this.focusableWhenDisabled,
                isNativeButton: false
            })
        );
    }
}
