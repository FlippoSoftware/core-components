import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { isAndroid, isFirefox } from '~@lib/detectBrowser';
import { getNativeEvent, stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { Side, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { ComboboxChipsMachine } from '../chips/ComboboxChipsMachine';
import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';

import { comboboxInputStateAttributesMapping } from './comboboxInputStateAttributesMapping';

export type ComboboxInputState = FieldRootState & {
    open: boolean;
    disabled: boolean;
    readOnly: boolean;
    popupSide: Side | null;
    listEmpty: boolean;
};

export type ComboboxInputOptions = {
    id: string;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
};

export type ComboboxInputSetup = {
    /**
     * Whether the input is rendered inside the positioner (the popup).
     * @default false
     */
    insidePopup?: boolean | undefined;
    chips?: ComboboxChipsMachine | null | undefined;
    /**
     * @default 'ltr'
     */
    direction?: TextDirection | undefined;
};

type InputEvent = { currentTarget: EventTarget | null; nativeEvent?: Event };

type InputKeyboardEvent = KeyboardEvent & { nativeEvent?: KeyboardEvent };

/**
 * State machine of `Combobox.Input`: typing opens and filters, Enter selects the highlighted item,
 * IME composition, chip navigation and Escape clearing.
 */
export class ComboboxInputMachine {
    /**
     * Value shown while composing with an IME (filtering waits for the composition to end).
     */
    readonly composition = new Store<{ composingValue: string | null }>({ composingValue: null });

    private options: ComboboxInputOptions;

    private readonly root: ComboboxRootMachine;

    private readonly setup: ComboboxInputSetup;

    private isComposing = false;

    constructor(root: ComboboxRootMachine, options: ComboboxInputOptions, setup: ComboboxInputSetup = {}) {
        this.root = root;
        this.options = options;
        this.setup = setup;
    }

    setOptions(options: ComboboxInputOptions) {
        this.options = options;
    }

    get disabled(): boolean {
        return this.root.disabled || (this.options.disabled ?? false);
    }

    setElement = (element: HTMLInputElement | null) => {
        const { store } = this.root;
        store.state.inputRef.current = element;
        const isInsidePopup = (this.setup.insidePopup ?? false) || store.state.inline;
        if (element && isInsidePopup && !store.state.hasInputValue) {
            store.state.setInputValue('', createChangeEventDetails(REASONS.none));
        }
        store.update({ inputElement: element, inputInsidePopup: isInsidePopup });
    };

    getState(): ComboboxInputState {
        const { store, derived } = this.root;
        const { open, readOnly, mounted, positionerElement, popupSide } = store.state;
        return {
            ...this.root.field.getState(),
            open,
            disabled: this.disabled,
            readOnly,
            popupSide: mounted && positionerElement ? popupSide : null,
            listEmpty: derived.state.filteredItems.length === 0
        };
    }

    static attrs(state: ComboboxInputState) {
        return getStyleHookProps(state, comboboxInputStateAttributesMapping);
    }

    /**
     * @param elementProps The user's props (a `value` prop overrides the displayed value).
     */
    getInputProps(elementProps: Props = {}, labelId?: string): Props {
        const { root } = this;
        const { store, field } = root;
        const { readOnly, name, selectionMode } = store.state;
        const disabled = this.disabled;
        const value = elementProps.value ?? this.composition.state.composingValue ?? root.inputValue.state.inputValue;

        return mergeProps(
            store.state.inputProps,
            store.state.triggerProps,
            {
                type: 'text',
                value,
                'aria-readonly': readOnly || undefined,
                'aria-labelledby': labelId,
                disabled,
                readOnly,
                ...(selectionMode === 'none' && name && { name }),
                id: this.options.id,
                onFocus: () => field.setFocused(true),
                onBlur: () => {
                    field.setTouched(true);
                    field.setFocused(false);
                    if (field.validationMode === 'onBlur') {
                        field.commit(selectionMode === 'none' ? root.inputValue.state.inputValue : store.state.selectedValue);
                    }
                },
                onCompositionStart: (event: InputEvent) => {
                    if (isAndroid) {
                        return;
                    }
                    this.isComposing = true;
                    this.composition.set('composingValue', (event.currentTarget as HTMLInputElement).value);
                },
                onCompositionEnd: (event: InputEvent) => {
                    this.isComposing = false;
                    const next = (event.currentTarget as HTMLInputElement).value;
                    this.composition.set('composingValue', null);
                    store.state.setInputValue(next, createChangeEventDetails(REASONS.inputChange, getNativeEvent(event as Event)));
                },
                onChange: this.handleChange,
                onKeyDown: this.handleKeyDown,
                onPointerMove: () => {
                    store.state.keyboardActiveRef.current = false;
                },
                onPointerDown: () => {
                    store.state.keyboardActiveRef.current = false;
                }
            },
            field.getValidationProps(elementProps)
        );
    }

    private readonly resetIndices = () => {
        const { store } = this.root;
        store.state.setIndices({
            activeIndex: null,
            selectedIndex: null,
            type: store.state.keyboardActiveRef.current ? 'keyboard' : 'pointer'
        });
    };

    private readonly handleChange = (event: InputEvent) => {
        const { store } = this.root;
        const { readOnly, autoHighlight } = store.state;
        const disabled = this.disabled;
        const input = event.currentTarget as HTMLInputElement;
        const nativeEvent = getNativeEvent(event as Event);
        const autoHighlightEnabled = Boolean(autoHighlight);
        const nextValue = input.value;
        const trimmed = nextValue.trim();

        // During IME composition, avoid filtering prematurely (Android treats all text as composing).
        if (this.isComposing) {
            this.composition.set('composingValue', nextValue);
            if (nextValue === '' && !store.state.openOnInputClick && !store.state.inputInsidePopup) {
                store.state.setOpen(false, createChangeEventDetails(REASONS.inputClear, nativeEvent));
            }
            if (!readOnly && !disabled && trimmed !== '') {
                store.state.setOpen(true, createChangeEventDetails(REASONS.inputChange, nativeEvent));
                if (!autoHighlightEnabled) {
                    this.resetIndices();
                }
            }
            if (store.state.open && store.state.activeIndex !== null && !(autoHighlightEnabled && trimmed !== '')) {
                this.resetIndices();
            }
            return;
        }

        store.state.setInputValue(nextValue, createChangeEventDetails(REASONS.inputChange, nativeEvent));

        const clearDetails = createChangeEventDetails(REASONS.inputClear, nativeEvent);
        if (nextValue === '' && !store.state.inputInsidePopup) {
            if (store.state.selectionMode === 'single') {
                store.state.setSelectedValue(null, clearDetails);
            }
            if (!store.state.openOnInputClick) {
                store.state.setOpen(false, clearDetails);
            }
        }

        if (!readOnly && !disabled && trimmed !== '') {
            store.state.setOpen(true, createChangeEventDetails(REASONS.inputChange, nativeEvent));
            // With autoHighlight, the root keeps the highlight on the first item.
            if (!autoHighlightEnabled) {
                this.resetIndices();
            }
        }

        // Typing resets the highlight so virtual focus returns to the input.
        if (store.state.open && store.state.activeIndex !== null && !autoHighlightEnabled) {
            this.resetIndices();
        }
    };

    private readonly handleKeyDown = (event: InputKeyboardEvent) => {
        const { store } = this.root;
        const { readOnly, selectedValue, selectionMode, mounted, open } = store.state;
        if (this.disabled || readOnly) {
            return;
        }
        if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
            return;
        }

        store.state.keyboardActiveRef.current = true;
        const input = event.currentTarget as HTMLInputElement;
        const nativeEvent = getNativeEvent(event as KeyboardEvent);
        const scrollAmount = input.scrollWidth - input.clientWidth;
        const isRTL = this.setup.direction === 'rtl';

        if (event.key === 'Home') {
            stopEvent(event);
            const cursor = isFirefox && isRTL ? input.value.length : 0;
            input.setSelectionRange(cursor, cursor);
            input.scrollLeft = 0;
            return;
        }
        if (event.key === 'End') {
            stopEvent(event);
            const cursor = isFirefox && isRTL ? 0 : input.value.length;
            input.setSelectionRange(cursor, cursor);
            input.scrollLeft = isRTL ? -scrollAmount : scrollAmount;
            return;
        }

        if (!mounted && event.key === 'Escape') {
            const isClear =
                selectionMode === 'multiple' && Array.isArray(selectedValue) ? selectedValue.length === 0 : selectedValue === null;
            const details = createChangeEventDetails(REASONS.escapeKey, nativeEvent);
            store.state.setInputValue('', details);
            store.state.setSelectedValue(selectionMode === 'multiple' ? [] : null, details);
            if (!isClear && !store.state.inline && !details.isPropagationAllowed) {
                event.stopPropagation();
            }
            return;
        }

        const chips = this.setup.chips;
        // Remove the last chip with Backspace on an empty input.
        if (
            chips &&
            event.key === 'Backspace' &&
            input.value === '' &&
            chips.highlightedChipIndex === undefined &&
            Array.isArray(selectedValue) &&
            selectedValue.length > 0
        ) {
            this.resetIndices();
            store.state.setSelectedValue(selectedValue.slice(0, -1), createChangeEventDetails(REASONS.none, nativeEvent));
            return;
        }

        if (chips) {
            const nextIndex = this.getNextChipIndex(event, chips);
            chips.setHighlightedChipIndex(nextIndex);
            if (nextIndex !== undefined) {
                chips.chipsRef.current[nextIndex]?.focus();
            } else {
                store.state.inputRef.current?.focus();
            }
        }

        // IME composition key.
        if (event.which === 229) {
            return;
        }

        if (event.key === 'Enter' && open) {
            const { activeIndex } = store.state;
            if (activeIndex === null) {
                // Allow form submission when no item is highlighted.
                store.state.setOpen(false, createChangeEventDetails(REASONS.none, nativeEvent));
                return;
            }
            stopEvent(event);
            const listItem = store.state.listRef.current[activeIndex];
            if (listItem) {
                store.state.selectionEventRef.current = nativeEvent;
                listItem.click();
                store.state.selectionEventRef.current = null;
            }
        }
    };

    private getNextChipIndex(event: InputKeyboardEvent, chips: ComboboxChipsMachine): number | undefined {
        const { store } = this.root;
        const selectedValue = store.state.selectedValue as unknown[];
        const { highlightedChipIndex } = chips;
        const input = event.currentTarget as HTMLInputElement;

        if (highlightedChipIndex !== undefined) {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                return highlightedChipIndex > 0 ? highlightedChipIndex - 1 : undefined;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                return highlightedChipIndex < selectedValue.length - 1 ? highlightedChipIndex + 1 : undefined;
            }
            if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault();
                const computedNextIndex =
                    highlightedChipIndex >= selectedValue.length - 1 ? selectedValue.length - 2 : highlightedChipIndex;
                store.state.setIndices({ activeIndex: null, selectedIndex: null, type: 'keyboard' });
                return computedNextIndex >= 0 ? computedNextIndex : undefined;
            }
            return highlightedChipIndex;
        }

        if (event.key === 'ArrowLeft' && (input.selectionStart ?? 0) === 0 && selectedValue.length > 0) {
            event.preventDefault();
            return Math.max(selectedValue.length - 1, 0);
        }
        if (event.key === 'Backspace' && input.value === '' && selectedValue.length > 0) {
            store.state.setIndices({ activeIndex: null, selectedIndex: null, type: 'keyboard' });
            event.preventDefault();
        }
        return undefined;
    }
}
