import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { ToolbarItemBase } from '../item/ToolbarItemBase';

import type { ToolbarItemOptions } from '../item/ToolbarItemBase';
import type { ToolbarMachine } from '../root/ToolbarMachine';

/**
 * A toolbar button.
 */
export class ToolbarButtonMachine extends ToolbarItemBase {
    readonly button: ButtonMachine;

    constructor(toolbar: ToolbarMachine, options: ToolbarItemOptions = {}) {
        super(toolbar, options, { focusableWhenDisabled: options.focusableWhenDisabled ?? true });
        this.button = new ButtonMachine(this.getButtonOptions());
    }

    setOptions(options: ToolbarItemOptions) {
        this.options = options;
        this.listItem.setMetadata({ focusableWhenDisabled: this.focusableWhenDisabled });
        this.button.setOptions(this.getButtonOptions());
    }

    private getButtonOptions() {
        return {
            disabled: this.disabled,
            focusableWhenDisabled: this.focusableWhenDisabled,
            native: this.options.nativeButton ?? true,
            composite: true
        };
    }

    setElement = (element: HTMLElement | null) => {
        this.button.setElement(element);
        this.listItem.setElement(element);
    };

    getProps(elementProps: Props = {}): Props {
        // `disabled` is intentionally duplicated for integrating with Menu and Select disabled states.
        return this.button.getButtonProps(mergeProps(this.getCompositeItemProps(), elementProps, { disabled: this.disabled }));
    }
}
