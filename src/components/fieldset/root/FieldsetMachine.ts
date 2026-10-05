import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { Store } from '~@store/Store';

export type FieldsetState = {
    disabled: boolean;
};

export type FieldsetOptions = {
    /**
     * @default false
     */
    disabled?: boolean | undefined;
};

/**
 * Groups a legend with fields; disables every field inside when disabled.
 */
export class FieldsetMachine {
    readonly store = new Store<{ legendId: string | undefined }>({ legendId: undefined });

    private options: FieldsetOptions;

    constructor(options: FieldsetOptions = {}) {
        this.options = options;
    }

    setOptions(options: FieldsetOptions) {
        this.options = options;
    }

    get disabled() {
        return this.options.disabled ?? false;
    }

    getState(): FieldsetState {
        return { disabled: this.disabled };
    }

    setLegendId = (legendId: string | undefined) => {
        this.store.set('legendId', legendId);
    };

    getRootProps() {
        return { 'aria-labelledby': this.store.state.legendId, ...getStyleHookProps(this.getState()) };
    }

    static legendAttrs(state: FieldsetState, id: string) {
        return { id, ...getStyleHookProps(state) };
    }
}
