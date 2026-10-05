import { mergeProps } from '~@props/mergeProps';

import type { ButtonMachine } from '~@components/button/root/ButtonMachine';
import type { Props } from '~@props/mergeProps';

import type { ToastObject } from '../manager/ToastManager';
import type { ToastProviderMachine } from '../provider/ToastProviderMachine';

/**
 * Props of `Toast.Close`.
 */
export function getToastCloseProps(
    provider: ToastProviderMachine,
    toast: ToastObject,
    button: ButtonMachine,
    elementProps: Props = {}
): Props {
    return mergeProps(
        {
            'aria-hidden': !provider.store.state.focused || undefined,
            onClick: () => provider.close(toast.id)
        },
        elementProps,
        (props: Props) => button.getButtonProps(props)
    );
}
