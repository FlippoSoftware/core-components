import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent, stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import type { ComboboxChipsMachine } from '../chips/ComboboxChipsMachine';
import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';

/**
 * State machine of `Combobox.Chip`.
 */
export class ComboboxChipMachine {
    readonly index = new Store<{ index: number }>({ index: -1 });

    private readonly root: ComboboxRootMachine;

    private readonly chips: ComboboxChipsMachine;

    private readonly listItem: ListRegistryItem;

    constructor(root: ComboboxRootMachine, chips: ComboboxChipsMachine) {
        this.root = root;
        this.chips = chips;
        this.listItem = new ListRegistryItem(chips.registry, { onIndexChange: (index) => this.index.set('index', index) });
    }

    setElement = (element: HTMLElement | null) => {
        this.listItem.setElement(element);
        this.index.set('index', this.listItem.getIndex());
    };

    getState(): { disabled: boolean } {
        return { disabled: this.root.store.state.disabled };
    }

    getChipProps(elementProps: Props = {}): Props {
        const { store } = this.root;
        const { disabled, readOnly } = store.state;
        return mergeProps(
            {
                tabIndex: -1,
                'aria-disabled': disabled || undefined,
                'aria-readonly': readOnly || undefined,
                onKeyDown: (event: KeyboardEvent) => {
                    if (store.state.disabled || store.state.readOnly) {
                        return;
                    }
                    const nextIndex = this.getNextIndex(event);
                    this.chips.setHighlightedChipIndex(nextIndex);
                    if (nextIndex === undefined) {
                        store.state.inputRef.current?.focus();
                    } else {
                        this.chips.chipsRef.current[nextIndex]?.focus();
                    }
                },
                onMouseDown: (event: MouseEvent) => {
                    if (store.state.disabled || store.state.readOnly) {
                        return;
                    }
                    event.preventDefault();
                    store.state.inputRef.current?.focus();
                }
            },
            elementProps
        );
    }

    destroy() {
        this.listItem.setElement(null);
        this.listItem.destroy();
    }

    private getNextIndex(event: KeyboardEvent): number | undefined {
        const { store } = this.root;
        const index = this.index.state.index;
        const selectedValue = store.state.selectedValue as unknown[];
        const nativeEvent = getNativeEvent(event);

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                return index > 0 ? index - 1 : undefined;
            case 'ArrowRight':
                event.preventDefault();
                return index < selectedValue.length - 1 ? index + 1 : undefined;
            case 'Backspace':
            case 'Delete': {
                const computedNextIndex = index >= selectedValue.length - 1 ? selectedValue.length - 2 : index;
                stopEvent(event);
                store.state.setIndices({ activeIndex: null, selectedIndex: null, type: 'keyboard' });
                store.state.setSelectedValue(
                    selectedValue.filter((_, i) => i !== index),
                    createChangeEventDetails(REASONS.none, nativeEvent)
                );
                return computedNextIndex >= 0 ? computedNextIndex : undefined;
            }
            case 'Enter':
            case ' ':
                stopEvent(event);
                return undefined;
            case 'ArrowDown':
            case 'ArrowUp':
                stopEvent(event);
                store.state.setOpen(true, createChangeEventDetails(REASONS.listNavigation, nativeEvent));
                return undefined;
            default:
                // Printable characters move focus back to the input.
                if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    return undefined;
                }
                return index;
        }
    }
}
