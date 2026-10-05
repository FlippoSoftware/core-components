import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { CompositeRootMachine } from '~@components/composite/root/CompositeRootMachine';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { ListRegistry, ListRegistryMap } from '~@components/composite/list/ListRegistry';
import type { Orientation, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { ToolbarItemMetadata, ToolbarItemState } from '../item/ToolbarItemBase';

export type ToolbarState = {
    disabled: boolean;
    orientation: Orientation;
};

export type ToolbarOptions = {
    /**
     * @default 1
     */
    cols?: number | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    loopFocus?: boolean | undefined;
    /**
     * @default 'horizontal'
     */
    orientation?: Orientation | undefined;
    direction?: TextDirection | undefined;
};

/**
 * State machine of a toolbar: composite navigation over buttons, inputs and links.
 */
export class ToolbarMachine {
    readonly composite: CompositeRootMachine;

    readonly store = new Store<{ itemMap: ListRegistryMap<ToolbarItemMetadata> }>({ itemMap: new Map() });

    private options: ToolbarOptions;

    constructor(options: ToolbarOptions = {}) {
        this.options = options;
        this.composite = new CompositeRootMachine(this.getCompositeOptions());
        this.composite.registry.setOptions({
            onMapChange: (map) => {
                this.store.set('itemMap', map as unknown as ListRegistryMap<ToolbarItemMetadata>);
                this.composite.setOptions(this.getCompositeOptions());
            }
        });
    }

    setOptions(options: ToolbarOptions) {
        this.options = options;
        this.composite.setOptions(this.getCompositeOptions());
    }

    private getCompositeOptions() {
        return {
            cols: this.options.cols ?? 1,
            loopFocus: this.options.loopFocus ?? true,
            orientation: this.orientation,
            direction: this.options.direction ?? 'ltr',
            disabledIndices: this.disabledIndices
        };
    }

    get registry() {
        return this.composite.registry as unknown as ListRegistry<ToolbarItemMetadata>;
    }

    get disabled() {
        return this.options.disabled ?? false;
    }

    get orientation(): Orientation {
        return this.options.orientation ?? 'horizontal';
    }

    /**
     * Indices of disabled items that are not focusable.
     */
    get disabledIndices() {
        const output: number[] = [];
        for (const itemMetadata of this.store.state.itemMap.values()) {
            if (itemMetadata?.index && !itemMetadata.focusableWhenDisabled) {
                output.push(itemMetadata.index);
            }
        }
        return output;
    }

    getState(): ToolbarState {
        return { disabled: this.disabled, orientation: this.orientation };
    }

    static attrs(state: ToolbarState | ToolbarItemState): Record<string, string> {
        return getStyleHookProps(state);
    }

    getRootProps(elementProps: Props = {}): Props {
        return mergeProps(this.composite.getRootProps(), { 'aria-orientation': this.orientation, role: 'toolbar' }, elementProps);
    }

    destroy() {
        this.composite.destroy();
    }
}
