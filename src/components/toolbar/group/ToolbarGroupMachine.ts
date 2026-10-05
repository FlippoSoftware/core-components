import type { ToolbarMachine, ToolbarState } from '../root/ToolbarMachine';

/**
 * A group of toolbar items (can be disabled as a whole).
 */
export class ToolbarGroupMachine {
    private disabledProp: boolean;

    private readonly toolbar: ToolbarMachine;

    constructor(toolbar: ToolbarMachine, disabled = false) {
        this.toolbar = toolbar;
        this.disabledProp = disabled;
    }

    setDisabled(disabled: boolean) {
        this.disabledProp = disabled;
    }

    get disabled() {
        return this.toolbar.disabled || this.disabledProp;
    }

    getState(): ToolbarState {
        return { disabled: this.disabled, orientation: this.toolbar.orientation };
    }
}
