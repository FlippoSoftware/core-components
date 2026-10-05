import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { mergeProps } from '~@props/mergeProps';

import type { MutableRef, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

export type SelectItemIndicatorState = {
    selected: boolean;
    transitionStatus: TransitionStatus;
};

/**
 * State machine of `Select.ItemIndicator` (rendered when `keepMounted || selected`).
 */
export class SelectItemIndicatorMachine {
    readonly transitions: TransitionStatusController;

    readonly ref: MutableRef<HTMLElement | null> = { current: null };

    private selected: boolean;

    private readonly openChangeComplete: OpenChangeComplete;

    constructor(selected: boolean) {
        this.selected = selected;
        this.transitions = new TransitionStatusController(selected);
        this.openChangeComplete = new OpenChangeComplete(this.ref, () => {
            if (!this.selected) {
                this.transitions.setMounted(false);
            }
        });
        this.openChangeComplete.sync(selected);
    }

    setSelected(selected: boolean) {
        this.selected = selected;
        this.transitions.setOpen(selected);
        this.openChangeComplete.sync(selected);
    }

    setElement = (element: HTMLElement | null) => {
        this.ref.current = element;
    };

    shouldRender(keepMounted = false): boolean {
        return keepMounted || this.selected;
    }

    getState(): SelectItemIndicatorState {
        return { selected: this.selected, transitionStatus: this.transitions.state.transitionStatus };
    }

    static attrs(state: SelectItemIndicatorState) {
        return getStyleHookProps(state, transitionStatusMapping);
    }

    getProps(elementProps: Props = {}): Props {
        return mergeProps({ 'aria-hidden': true }, elementProps);
    }

    destroy() {
        this.transitions.destroy();
        this.openChangeComplete.destroy();
    }
}
