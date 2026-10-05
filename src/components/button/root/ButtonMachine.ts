import { error } from '~@lib/error';
import { makeEventPreventable, mergeProps } from '~@props/mergeProps';

import type { PreventableEvent, Props } from '~@props/mergeProps';

export type ButtonOptions = {
    /**
     * Whether the component should ignore user interaction.
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * Whether the button may receive focus even if it is disabled.
     * @default false
     */
    focusableWhenDisabled?: boolean | undefined;
    /**
     * @default 0
     */
    tabIndex?: number | undefined;
    /**
     * Whether the component is rendered as a native `<button>`.
     * @default true
     */
    native?: boolean | undefined;
    /**
     * Whether the button is an item of a composite widget (roving tab index is managed by the composite).
     * @default false
     */
    composite?: boolean | undefined;
};

export type FocusableWhenDisabledProps = {
    'aria-disabled'?: boolean;
    disabled?: boolean;
    onKeyDown: (event: KeyboardEvent) => void;
    tabIndex?: number;
};

/**
 * Props that keep a disabled control focusable or not.
 * Pure replacement for `useFocusableWhenDisabled`.
 */
export function getFocusableWhenDisabledProps(parameters: {
    focusableWhenDisabled?: boolean | undefined;
    disabled: boolean;
    composite?: boolean | undefined;
    tabIndex?: number | undefined;
    isNativeButton: boolean;
}): FocusableWhenDisabledProps {
    const { focusableWhenDisabled, disabled, composite = false, tabIndex: tabIndexProp = 0, isNativeButton } = parameters;

    const isFocusableComposite = composite && focusableWhenDisabled !== false;
    const isNonFocusableComposite = composite && focusableWhenDisabled === false;

    // we can't explicitly assign `undefined` to any of these props because it
    // would otherwise prevent subsequently merged props from setting them
    const additionalProps: FocusableWhenDisabledProps = {
        // allow Tabbing away from focusableWhenDisabled elements
        onKeyDown(event: KeyboardEvent) {
            if (disabled && focusableWhenDisabled && event.key !== 'Tab') {
                event.preventDefault();
            }
        }
    };

    if (!composite) {
        additionalProps.tabIndex = tabIndexProp;

        if (!isNativeButton && disabled) {
            additionalProps.tabIndex = focusableWhenDisabled ? tabIndexProp : -1;
        }
    }

    if ((isNativeButton && (focusableWhenDisabled || isFocusableComposite)) || (!isNativeButton && disabled)) {
        additionalProps['aria-disabled'] = disabled;
    }

    if (isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)) {
        additionalProps.disabled = disabled;
    }

    return additionalProps;
}

type ButtonEvent = Event & PreventableEvent & { key?: string };

type Handler = (event: ButtonEvent) => void;

/**
 * Button behaviour shared by every pressable part: disabled handling, keyboard activation of
 * non-native buttons (`Enter` on keydown, `Space` on keyup) and focusability while disabled.
 * Replacement for `useButton`.
 */
export class ButtonMachine {
    private options: ButtonOptions;

    private element: HTMLElement | null = null;

    constructor(options: ButtonOptions = {}) {
        this.options = options;
    }

    setOptions(options: ButtonOptions) {
        this.options = options;
        this.syncCompositeDisabled();
    }

    /**
     * Ref callback for the button element.
     */
    setElement = (element: HTMLElement | null) => {
        this.element = element;
        this.validateElement();
        this.syncCompositeDisabled();
    };

    /**
     * Merges the button behaviour into `externalProps`.
     */
    getButtonProps(externalProps: Props = {}): Props {
        const { disabled = false, native: isNativeButton = true } = this.options;
        const {
            onClick: externalOnClick,
            onMouseDown: externalOnMouseDown,
            onKeyUp: externalOnKeyUp,
            onKeyDown: externalOnKeyDown,
            onPointerDown: externalOnPointerDown,
            ...otherExternalProps
        } = externalProps as Props & {
            onClick?: Handler;
            onMouseDown?: Handler;
            onKeyUp?: Handler;
            onKeyDown?: Handler;
            onPointerDown?: Handler;
        };

        const type = isNativeButton ? 'button' : undefined;

        return mergeProps(
            {
                type,
                onClick(event: ButtonEvent) {
                    if (disabled) {
                        event.preventDefault();
                        return;
                    }
                    externalOnClick?.(event);
                },
                onMouseDown(event: ButtonEvent) {
                    if (!disabled) {
                        externalOnMouseDown?.(event);
                    }
                },
                onKeyDown: (event: ButtonEvent) => {
                    if (!disabled) {
                        makeEventPreventable(event);
                        externalOnKeyDown?.(event);
                    }

                    if (event.headlessUIHandlerPrevented) {
                        return;
                    }

                    const shouldClick = event.target === event.currentTarget && !isNativeButton && !this.isValidLink() && !disabled;
                    const isEnterKey = event.key === 'Enter';
                    const isSpaceKey = event.key === ' ';

                    // Keyboard accessibility for non interactive elements
                    if (shouldClick) {
                        if (isSpaceKey || isEnterKey) {
                            event.preventDefault();
                        }

                        if (isEnterKey) {
                            externalOnClick?.(event);
                        }
                    }
                },
                onKeyUp(event: ButtonEvent) {
                    // calling preventDefault in keyUp on a <button> will not dispatch a click event if Space is pressed
                    if (!disabled) {
                        makeEventPreventable(event);
                        externalOnKeyUp?.(event);
                    }

                    if (event.headlessUIHandlerPrevented) {
                        return;
                    }

                    if (event.target === event.currentTarget && !isNativeButton && !disabled && event.key === ' ') {
                        externalOnClick?.(event);
                    }
                },
                onPointerDown(event: ButtonEvent) {
                    if (disabled) {
                        event.preventDefault();
                        return;
                    }
                    externalOnPointerDown?.(event);
                }
            },
            isNativeButton ? undefined : { role: 'button' },
            this.getFocusableWhenDisabledProps(),
            otherExternalProps
        );
    }

    private getFocusableWhenDisabledProps() {
        const { disabled = false, focusableWhenDisabled, composite = false, tabIndex = 0, native = true } = this.options;
        return getFocusableWhenDisabledProps({ focusableWhenDisabled, disabled, composite, tabIndex, isNativeButton: native });
    }

    private isValidLink() {
        const element = this.element;
        return Boolean(element?.tagName === 'A' && (element as HTMLAnchorElement).href);
    }

    private validateElement() {
        if (process.env.NODE_ENV === 'production' || !this.element) {
            return;
        }

        const isNativeButton = this.options.native ?? true;
        const isButtonTag = this.element.tagName === 'BUTTON';

        if (isNativeButton && !isButtonTag) {
            error(
                'A component that acts as a button was not rendered as a native <button>, which does not match the default. Ensure that the element passed to the `render` prop of the component is a real <button>, or set the `nativeButton` prop on the component to `false`.'
            );
        } else if (!isNativeButton && isButtonTag) {
            error(
                'A component that acts as a button was rendered as a native <button>, which does not match the default. Ensure that the element passed to the `render` prop of the component is not a real <button>, or set the `nativeButton` prop on the component to `true`.'
            );
        }
    }

    // A disabled composite button rendering another button (e.g. <Toolbar.Button disabled render={<Menu.Trigger />} />)
    // passes `disabled` through two button machines; the DOM `disabled` attribute is finally removed.
    private syncCompositeDisabled() {
        const element = this.element;
        if (typeof HTMLButtonElement === 'undefined' || !(element instanceof HTMLButtonElement)) {
            return;
        }

        const { disabled = false, composite = false } = this.options;
        if (composite && disabled && this.getFocusableWhenDisabledProps().disabled === undefined && element.disabled) {
            element.disabled = false;
        }
    }
}
