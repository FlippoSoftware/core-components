import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { Clipboard } from '~@patterns/Clipboard';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import type { SnippetMachine } from '../root/SnippetMachine';

export type SnippetCopyButtonState = {
    disabled: boolean;
    copied: boolean;
};

export type SnippetCopyButtonOptions = {
    disabled?: boolean | undefined;
    /**
     * @default 2000
     */
    resetDelay?: number | undefined;
    onCopy?: ((value: string) => void) | undefined;
    onCopyError?: ((error: unknown) => void) | undefined;
    nativeButton?: boolean | undefined;
};

/**
 * The button that copies the snippet.
 */
export class SnippetCopyButtonMachine {
    readonly clipboard: Clipboard;

    readonly button: ButtonMachine;

    private options: SnippetCopyButtonOptions;

    private readonly snippet: SnippetMachine;

    constructor(snippet: SnippetMachine, options: SnippetCopyButtonOptions = {}) {
        this.snippet = snippet;
        this.options = options;
        this.clipboard = new Clipboard(options.resetDelay ?? 2000);
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton });
        this.clipboard.store.subscribe(() => this.button.setOptions({ disabled: this.disabled, native: this.options.nativeButton }));
    }

    setOptions(options: SnippetCopyButtonOptions) {
        this.options = options;
        this.clipboard.setResetDelay(options.resetDelay ?? 2000);
        this.button.setOptions({ disabled: this.disabled, native: options.nativeButton });
    }

    get disabled() {
        return Boolean(this.snippet.disableCopy || this.options.disabled || this.clipboard.copied);
    }

    getState(): SnippetCopyButtonState {
        return { disabled: this.disabled, copied: this.clipboard.copied };
    }

    getProps(elementProps: Props = {}): Props {
        return this.button.getButtonProps(
            mergeProps(
                {
                    onClick: () => {
                        if (this.disabled) {
                            return;
                        }

                        try {
                            const textToCopy = this.snippet.getText();
                            this.clipboard.copy(textToCopy);
                            this.options.onCopy?.(textToCopy);
                        } catch (error) {
                            this.options.onCopyError?.(error);
                        }
                    }
                },
                elementProps
            )
        );
    }

    destroy() {
        this.clipboard.destroy();
    }
}
