import { FloatingDelayGroup } from '~@packages/floating-ui/FloatingDelayGroup';

export type TooltipProviderOptions = {
    /**
     * Delay before opening a tooltip of the group.
     */
    delay?: number | undefined;
    /**
     * Delay before closing a tooltip of the group.
     */
    closeDelay?: number | undefined;
    /**
     * Time (ms) during which another tooltip of the group opens instantly.
     * @default 400
     */
    timeout?: number | undefined;
};

/**
 * State machine of `Tooltip.Provider`: a delay group shared by its tooltips.
 */
export class TooltipProviderMachine {
    readonly delayGroup: FloatingDelayGroup;

    private options: TooltipProviderOptions;

    constructor(options: TooltipProviderOptions = {}) {
        this.options = options;
        this.delayGroup = new FloatingDelayGroup({
            delay: { open: options.delay, close: options.closeDelay },
            timeoutMs: options.timeout ?? 400
        });
    }

    setOptions(options: TooltipProviderOptions) {
        this.options = options;
        this.delayGroup.setOptions({ delay: { open: options.delay, close: options.closeDelay }, timeoutMs: options.timeout ?? 400 });
    }

    get delay() {
        return this.options.delay;
    }

    get closeDelay() {
        return this.options.closeDelay;
    }

    destroy() {
        this.delayGroup.destroy();
    }
}
