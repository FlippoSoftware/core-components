import type { AnyDialogStore } from '../utils/AnyDialogStore';

/**
 * Registers the ID of `Dialog.Title`. @returns A cleanup function.
 */
export function registerDialogTitle(store: AnyDialogStore, id: string): () => void {
    store.set('titleElementId', id);
    return () => {
        store.set('titleElementId', undefined);
    };
}
