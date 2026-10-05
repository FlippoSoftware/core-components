import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { Store } from '~@store/Store';

import type { MutableRef } from '~@lib/types';

import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';

/**
 * State machine of `Combobox.Chips`: the container of the selected values' chips, with keyboard navigation.
 */
export class ComboboxChipsMachine {
    readonly store = new Store<{ highlightedChipIndex: number | undefined }>({ highlightedChipIndex: undefined });

    readonly registry: ListRegistry;

    private readonly root: ComboboxRootMachine;

    private readonly unsubscribe: () => void;

    constructor(root: ComboboxRootMachine) {
        this.root = root;
        this.registry = new ListRegistry();
        this.unsubscribe = root.store.subscribe(() => {
            if (root.store.state.open && this.store.state.highlightedChipIndex !== undefined) {
                this.store.set('highlightedChipIndex', undefined);
            }
        });
    }

    get chipsRef(): MutableRef<(HTMLElement | null)[]> {
        return this.registry.elementsRef;
    }

    get highlightedChipIndex(): number | undefined {
        return this.store.state.highlightedChipIndex;
    }

    setHighlightedChipIndex = (index: number | undefined) => {
        this.store.set('highlightedChipIndex', index);
    };

    setElement = (element: HTMLDivElement | null) => {
        this.root.store.state.chipsContainerRef.current = element;
    };

    destroy() {
        this.unsubscribe();
        this.registry.destroy();
    }
}
