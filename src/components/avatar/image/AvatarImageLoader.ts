import { Store } from '~@store/Store';

import type { AvatarMachine, ImageLoadingStatus } from '../root/AvatarMachine';

export type AvatarImageOptions = {
    src: string | undefined;
    referrerPolicy?: ReferrerPolicy | undefined;
    crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined;
    onLoadingStatusChange?: ((status: ImageLoadingStatus) => void) | undefined;
};

/**
 * Preloads the avatar image and reports its loading status to the avatar.
 * Replacement for `useImageLoadingStatus` + `AvatarImage`; the image renders only when `loaded`.
 */
export class AvatarImageLoader {
    readonly store = new Store<{ status: ImageLoadingStatus }>({ status: 'idle' });

    private options: AvatarImageOptions;

    private readonly avatar: AvatarMachine;

    private cancel: (() => void) | null = null;

    private deps: unknown[] = [];

    constructor(avatar: AvatarMachine, options: AvatarImageOptions) {
        this.avatar = avatar;
        this.options = options;
        this.load();
    }

    setOptions(options: AvatarImageOptions) {
        this.options = options;
        this.load();
    }

    get status() {
        return this.store.state.status;
    }

    destroy() {
        this.cancel?.();
        this.cancel = null;
    }

    private setStatus(status: ImageLoadingStatus) {
        this.store.set('status', status);
        if (status !== 'idle') {
            this.options.onLoadingStatusChange?.(status);
            this.avatar.setImageLoadingStatus(status);
        }
    }

    private load() {
        const { src, crossOrigin, referrerPolicy } = this.options;
        const deps = [src, crossOrigin, referrerPolicy];
        if (this.cancel !== null && deps.every((dep, index) => Object.is(dep, this.deps[index]))) {
            return;
        }
        this.deps = deps;
        this.cancel?.();

        if (!src) {
            this.cancel = () => {};
            this.setStatus('error');
            return;
        }

        let isMounted = true;
        const image = new window.Image();

        const updateStatus = (status: ImageLoadingStatus) => () => {
            if (isMounted) {
                this.setStatus(status);
            }
        };

        this.setStatus('loading');
        image.onload = updateStatus('loaded');
        image.onerror = updateStatus('error');
        if (referrerPolicy) {
            image.referrerPolicy = referrerPolicy;
        }
        image.crossOrigin = crossOrigin ?? null;
        image.src = src;

        this.cancel = () => {
            isMounted = false;
        };
    }
}
