import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import type { QrCodeFileExtension, QrCodeMachine } from '../root/QrCodeMachine';
import type { TriggerBaseOptions } from '../utils/TriggerBaseOptions';

export type QrCodeDownloadTriggerOptions = TriggerBaseOptions & {
    /**
     * @default 'qrcode'
     */
    name?: string | undefined;
    /**
     * @default 'svg'
     */
    extension?: QrCodeFileExtension | undefined;
    onDownload?: (() => void) | undefined;
    onDownloadError?: ((error: unknown) => void) | undefined;
};

/**
 * Button that downloads the generated QR code.
 */
export class QrCodeDownloadTriggerMachine {
    readonly button = new ButtonMachine();

    readonly store = new Store({ downloading: false });

    private options: QrCodeDownloadTriggerOptions;

    private readonly qrCode: QrCodeMachine;

    constructor(qrCode: QrCodeMachine, options: QrCodeDownloadTriggerOptions = {}) {
        this.qrCode = qrCode;
        this.options = options;
        this.syncButton();
    }

    setOptions(options: QrCodeDownloadTriggerOptions) {
        this.options = options;
        this.syncButton();
    }

    get disabled() {
        return Boolean(!this.qrCode.renderer || this.options.disabled || this.store.state.downloading);
    }

    getState() {
        return { ...this.qrCode.getState(), disabled: this.disabled, downloading: this.store.state.downloading };
    }

    getProps(elementProps: Props = {}): Props {
        this.syncButton();
        return this.button.getButtonProps(
            mergeProps(
                {
                    onClick: async () => {
                        const renderer = this.qrCode.renderer;
                        if (!renderer || this.store.state.downloading) {
                            return;
                        }

                        const { name = 'qrcode', extension = 'svg', onDownload, onDownloadError } = this.options;
                        this.store.set('downloading', true);
                        this.syncButton();

                        try {
                            await renderer.download({ name, extension });
                            onDownload?.();
                        } catch (error) {
                            onDownloadError?.(error);
                        } finally {
                            this.store.set('downloading', false);
                            this.syncButton();
                        }
                    }
                },
                elementProps
            )
        );
    }

    private syncButton() {
        this.button.setOptions({ disabled: this.disabled, native: this.options.nativeButton });
    }
}
