import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ACTIVE_COMPOSITE_ITEM } from '~@components/composite/utils/compositeKeys';
import { RadioMachine } from '~@components/radio/root/RadioMachine';
import { mergeProps } from '~@props/mergeProps';

import type { RadioOptions, RadioState } from '~@components/radio/root/RadioMachine';
import type { Props } from '~@props/mergeProps';

import { radioCardStateAttributesMapping } from './radioCardStateAttributesMapping';

export type RadioCardState = RadioState;

export type RadioCardOptions = Omit<RadioOptions, 'nativeButton' | 'id' | 'defaultInputId'>;

/**
 * State machine of a radio card: the whole card is the radio.
 */
export class RadioCardMachine extends RadioMachine {
    constructor(options: RadioCardOptions) {
        super({ ...options, defaultInputId: options.defaultId });
    }

    override setOptions(options: RadioCardOptions) {
        super.setOptions({ ...options, defaultInputId: options.defaultId });
    }

    static override attrs(state: RadioCardState): Record<string, string> {
        return getStyleHookProps(state, radioCardStateAttributesMapping);
    }

    override getRootProps(elementProps: Props = {}): Props {
        const group = this.groupMachine;
        const labelable = this.labelableController;
        const disabled = this.disabled;
        const readOnly = this.readOnly;
        const checked = this.checked;
        const getDescriptionProps = labelable?.getDescriptionProps ?? ((props: Props) => props);

        return mergeProps(
            this.getCompositeItemProps(),
            {
                role: 'radio',
                'aria-checked': checked,
                'aria-disabled': disabled || undefined,
                'aria-readonly': readOnly || undefined,
                'aria-required': this.required || undefined,
                'aria-labelledby': labelable?.labelId,
                [ACTIVE_COMPOSITE_ITEM]: checked ? '' : undefined,
                tabIndex: disabled ? -1 : 0,
                onKeyDown(event: KeyboardEvent) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                    }
                },
                onClick: (event: MouseEvent) => {
                    if (event.defaultPrevented || disabled || readOnly) {
                        return;
                    }
                    event.preventDefault();
                    this.inputRef.current?.click();
                },
                onFocus: (event: FocusEvent) => {
                    if (event.defaultPrevented || disabled || readOnly || !group?.touched) {
                        return;
                    }
                    this.inputRef.current?.click();
                    group.setTouched(false);
                }
            },
            getDescriptionProps,
            group?.field.getValidationProps,
            elementProps
        );
    }

    override getInputProps(): Props {
        const { id: _id, onFocus: _onFocus, ...inputProps } = super.getInputProps();
        return inputProps;
    }
}
