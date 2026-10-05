import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { ToolbarItemBase } from '../item/ToolbarItemBase';

import type { ToolbarMachine } from '../root/ToolbarMachine';

/**
 * A toolbar link (links cannot be disabled).
 */
export class ToolbarLinkMachine extends ToolbarItemBase {
    constructor(toolbar: ToolbarMachine) {
        super(toolbar, {}, { focusableWhenDisabled: true });
    }

    setElement = (element: HTMLElement | null) => {
        this.listItem.setElement(element);
    };

    getProps(elementProps: Props = {}): Props {
        return mergeProps(this.getCompositeItemProps(), elementProps);
    }

    getLinkState() {
        return { orientation: this.toolbar.orientation };
    }
}
