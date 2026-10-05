import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

function transformValue(text: string) {
    // Manually replace all &nbsp; to avoid getting different unicode characters.
    return text.replace(/ /g, ' ');
}

/**
 * Copies text to the clipboard and keeps a temporary `copied` flag.
 * Replacement for `useClipboard`.
 */
export class Clipboard {
    readonly store = new Store<{ copied: boolean; error: Error | null }>({ copied: false, error: null });

    private readonly timeout = new Timeout();

    private resetDelay: number;

    constructor(resetDelay = 2000) {
        this.resetDelay = resetDelay;
    }

    setResetDelay(resetDelay: number) {
        this.resetDelay = resetDelay;
    }

    get copied() {
        return this.store.state.copied;
    }

    copy = (valueToCopy: string) => {
        if (typeof navigator !== 'undefined' && 'clipboard' in navigator) {
            navigator.clipboard
                .writeText(transformValue(valueToCopy))
                .then(() => {
                    this.timeout.start(this.resetDelay, () => this.store.set('copied', false));
                    this.store.set('copied', true);
                })
                .catch((err: Error) => this.store.set('error', err));
        } else {
            this.store.set('error', new Error('useClipboard: navigator.clipboard is not supported'));
        }
    };

    reset = () => {
        this.store.update({ copied: false, error: null });
        this.timeout.clear();
    };

    destroy() {
        this.timeout.clear();
    }
}
