import { Store } from '~@store/Store';

export type ImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type AvatarState = {
    imageLoadingStatus: ImageLoadingStatus;
};

/**
 * State of an avatar: the loading status of its image, shared by the image and the fallback.
 */
export class AvatarMachine {
    readonly store = new Store<AvatarState>({ imageLoadingStatus: 'idle' });

    getState(): AvatarState {
        return this.store.state;
    }

    setImageLoadingStatus = (status: ImageLoadingStatus) => {
        this.store.set('imageLoadingStatus', status);
    };
}
