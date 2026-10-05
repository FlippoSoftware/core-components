import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { isModifierKeySet } from '~@components/composite/utils/compositeKeys';
import { isComposingEvent } from '~@lib/eventKey';
import { ARABIC_RE, HAN_RE } from '~@lib/parseNumeric';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import { testPattern } from '../utils/pinInputUtils';

import type { PinInputMachine } from '../root/PinInputMachine';

const NAVIGATE_KEYS = new Set(['Tab', 'Enter', 'Escape']);

function shouldAllowKey(event: KeyboardEvent): boolean {
    return (
        isComposingEvent(event) ||
        /^\d$/.test(event.key) ||
        ARABIC_RE.test(event.key) ||
        HAN_RE.test(event.key) ||
        NAVIGATE_KEYS.has(event.key)
    );
}

export type PinInputPinOptions = {
    /**
     * Generated id of the pin input.
     */
    id: string;
};

/**
 * One pin (character input).
 */
export class PinInputPinMachine {
    readonly listItem: ListRegistryItem;

    readonly store = new Store({ index: -1 });

    private options: PinInputPinOptions;

    private readonly pinInput: PinInputMachine;

    constructor(pinInput: PinInputMachine, options: PinInputPinOptions) {
        this.pinInput = pinInput;
        this.options = options;
        this.listItem = new ListRegistryItem(pinInput.registry, { onIndexChange: (index) => this.store.set('index', index) });
    }

    setOptions(options: PinInputPinOptions) {
        this.options = options;
    }

    get index() {
        return this.store.state.index;
    }

    getState() {
        return { ...this.pinInput.getState(), value: this.pinInput.values[this.index] };
    }

    setElement = (element: HTMLElement | null) => {
        this.listItem.setElement(element);
    };

    getProps(elementProps: Props = {}): Props {
        const root = this.pinInput;
        const {
            otp = false,
            mask = false,
            placeholder = '○',
            selectOnFocus = false,
            type = 'numeric',
            pattern,
            focusMode,
            direction = 'ltr'
        } = root.optionsSnapshot;
        const index = this.index;
        const { focusedInputIndex } = root.store.state;
        const valid = root.getState().valid;
        const id = this.options.id;
        const readOnly = (focusMode === 'first-empty' && focusedInputIndex !== index) || root.readOnly;
        const field = root.field;

        return mergeProps(
            {
                id,
                tabIndex: focusedInputIndex === index ? 0 : -1,
                value: root.values[index] ?? '',
                dir: direction,
                inputMode: otp ? 'numeric' : 'text',
                'aria-invalid': !valid,
                'aria-label': `PIN digit ${index + 1}`,
                'aria-describedby': valid === false ? `${id}-error` : undefined,
                type: mask ? 'password' : otp ? 'tel' : 'text',
                readOnly,
                autoCapitalize: 'none',
                autoComplete: otp ? 'one-time-code' : 'off',
                placeholder: focusedInputIndex === index ? '' : placeholder,
                onFocus: () => {
                    field.setFocused(true);
                    root.setFocusedInputIndex(index);
                    root.setLastFocusedInputIndex(index);
                    if (selectOnFocus) {
                        (root.elementsRef.current[index] as HTMLInputElement | null)?.select();
                    }
                },
                onBlur: () => {
                    field.setTouched(true);
                    field.setFocused(false);
                    root.setFocusedInputIndex(null);
                },
                onChange: (event: Event) => {
                    const inputValue = (event.target as HTMLInputElement).value.at(-1) ?? '';

                    if (!testPattern(inputValue, type, pattern)) {
                        return;
                    }

                    field.setDirty(true);
                    field.setFilled(true);

                    root.onValueChange(inputValue, index, getNativeEvent(event));

                    // Auto-focus next input if available
                    const nextIndex = index + 1;
                    if (nextIndex < root.elementsRef.current.length) {
                        root.elementsRef.current[nextIndex]?.focus();
                    }
                },
                onPaste: (event: ClipboardEvent) => {
                    root.handlePasteValue(event.clipboardData?.getData('text') ?? '', index);
                },
                onKeyDown: (event: KeyboardEvent) => {
                    if (event.defaultPrevented || shouldAllowKey(event) || isModifierKeySet(event, [])) {
                        return;
                    }

                    root.handleSpecialKeys(event, index);
                }
            },
            elementProps
        );
    }

    destroy() {
        this.listItem.destroy();
    }
}
