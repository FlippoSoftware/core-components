import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import type { QrCodeMachine } from '../root/QrCodeMachine';
import type { TriggerBaseOptions } from '../utils/TriggerBaseOptions';

/**
 * Button that generates the QR code on demand.
 */
export class QrCodeGenerateTriggerMachine {
    readonly button = new ButtonMachine();

    private options: TriggerBaseOptions;

    private readonly qrCode: QrCodeMachine;

    constructor(qrCode: QrCodeMachine, options: TriggerBaseOptions = {}) {
        this.qrCode = qrCode;
        this.options = options;
        this.syncButton();
    }

    setOptions(options: TriggerBaseOptions) {
        this.options = options;
        this.syncButton();
    }

    get disabled() {
        const status = this.qrCode.store.state.status;
        return Boolean(status === 'loading' || this.qrCode.renderer || this.options.disabled);
    }

    getState() {
        return { status: this.qrCode.store.state.status, disabled: this.disabled };
    }

    getProps(elementProps: Props = {}): Props {
        this.syncButton();
        return this.button.getButtonProps(mergeProps({ onClick: this.qrCode.generate }, elementProps));
    }

    private syncButton() {
        this.button.setOptions({ disabled: this.disabled, native: this.options.nativeButton });
    }
}
