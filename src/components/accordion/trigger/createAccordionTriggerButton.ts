import { ButtonMachine } from '~@components/button/root/ButtonMachine';

/**
 * Creates the button machine of an accordion trigger (focusable when disabled).
 */
export function createAccordionTriggerButton(disabled: boolean, nativeButton = true) {
    return new ButtonMachine({ disabled, focusableWhenDisabled: true, native: nativeButton });
}
