import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

/**
 * `Menu.Group`: `aria-labelledby` follows the registered `Menu.GroupLabel`.
 */
export class MenuGroupMachine {
    readonly store = new Store<{ labelId: string | undefined }>({ labelId: undefined });

    /**
     * Registers the group label's ID. @returns A cleanup function.
     */
    registerLabel(id: string): () => void {
        this.store.set('labelId', id);
        return () => this.store.set('labelId', undefined);
    }

    getGroupProps(elementProps: Props = {}): Props {
        return mergeProps({ role: 'group', 'aria-labelledby': this.store.state.labelId }, elementProps);
    }

    static getLabelProps(id: string, elementProps: Props = {}): Props {
        return mergeProps({ id, role: 'presentation' }, elementProps);
    }
}
