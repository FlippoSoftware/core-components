import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { getNativeEvent, stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';

/**
 * State machine of `Combobox.List`: the listbox (or grid) holding the items.
 * `registry` is the item list for non-virtualized lists.
 */
export class ComboboxListMachine {
    readonly registry: ListRegistry;

    private readonly root: ComboboxRootMachine;

    private readonly hasPositioner: boolean;

    constructor(root: ComboboxRootMachine, hasPositioner: boolean) {
        this.root = root;
        this.hasPositioner = hasPositioner;
        const { store } = root;
        this.registry = new ListRegistry({
            elementsRef: store.state.listRef,
            labelsRef: root.store.state.items ? undefined : store.state.labelsRef
        });
    }

    setElement = (element: HTMLElement | null) => {
        const { store } = this.root;
        store.set('listElement', element);
        if (!this.hasPositioner) {
            store.set('positionerElement', element);
        }
    };

    getState(): { empty: boolean } {
        return { empty: this.root.derived.state.filteredItems.length === 0 };
    }

    getListProps(elementProps: Props = {}): Props {
        const { store, floatingRoot } = this.root;
        const { grid, selectionMode, popupProps } = store.state;
        return mergeProps(
            popupProps,
            {
                tabIndex: -1,
                id: floatingRoot.select('floatingId'),
                role: grid ? 'grid' : 'listbox',
                'aria-multiselectable': selectionMode === 'multiple' ? 'true' : undefined,
                onKeyDown: (event: KeyboardEvent) => {
                    const { disabled, readOnly, activeIndex } = store.state;
                    if (disabled || readOnly || event.key !== 'Enter' || activeIndex == null) {
                        // Allow form submission when no item is highlighted.
                        return;
                    }
                    stopEvent(event);
                    const nativeEvent = getNativeEvent(event);
                    const listItem = store.state.listRef.current[activeIndex];
                    if (listItem) {
                        store.state.selectionEventRef.current = nativeEvent;
                        listItem.click();
                        store.state.selectionEventRef.current = null;
                    }
                },
                onKeyDownCapture: () => {
                    store.state.keyboardActiveRef.current = true;
                },
                onPointerMoveCapture: () => {
                    store.state.keyboardActiveRef.current = false;
                }
            },
            elementProps
        );
    }

    destroy() {
        this.registry.destroy();
    }
}
