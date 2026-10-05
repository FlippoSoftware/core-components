import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

/**
 * `Select.Group`: `aria-labelledby` follows the registered `Select.GroupLabel`.
 */
export class SelectGroupMachine {
    readonly store = new Store<{ labelId: string | undefined }>({ labelId: undefined });

    registerLabel(id: string): () => void {
        this.store.set('labelId', id);
        return () => this.store.set('labelId', undefined);
    }

    getGroupProps(elementProps: Props = {}): Props {
        return mergeProps({ role: 'group', 'aria-labelledby': this.store.state.labelId }, elementProps);
    }

    static getLabelProps(id: string, elementProps: Props = {}): Props {
        return mergeProps({ id }, elementProps);
    }
}
