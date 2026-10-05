import { mergeProps } from '~@props/mergeProps';

import type { ButtonMachine } from '~@components/button/root/ButtonMachine';
import type { Props } from '~@props/mergeProps';

import type { ToastObject } from '../manager/ToastManager';

/**
 * Props of `Toast.Action` (merged with the toast's `actionProps`).
 */
export function getToastActionProps(toast: ToastObject, button: ButtonMachine, elementProps: Props = {}): Props {
    return mergeProps(elementProps, toast.actionProps, (props: Props) => button.getButtonProps(props));
}
