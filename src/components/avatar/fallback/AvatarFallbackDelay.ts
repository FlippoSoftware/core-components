import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { ImageLoadingStatus } from '../root/AvatarMachine';

/**
 * Delay before the avatar fallback may be shown.
 */
export class AvatarFallbackDelay {
    readonly store: Store<{ delayPassed: boolean }>;

    private readonly timeout = new Timeout();

    constructor(delay: number | undefined) {
        this.store = new Store({ delayPassed: delay === undefined });
        this.setDelay(delay);
    }

    setDelay(delay: number | undefined) {
        this.timeout.clear();
        if (delay !== undefined) {
            this.timeout.start(delay, () => this.store.set('delayPassed', true));
        }
    }

    /**
     * Whether the fallback is rendered.
     */
    isRendered(imageLoadingStatus: ImageLoadingStatus) {
        return imageLoadingStatus !== 'loaded' && this.store.state.delayPassed;
    }

    destroy() {
        this.timeout.clear();
    }
}
