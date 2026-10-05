import type { AnyDialogStore } from '../utils/AnyDialogStore';

/**
 * Registers the ID of `Dialog.Description`. @returns A cleanup function.
 */
export function registerDialogDescription(store: AnyDialogStore, id: string): () => void {
    store.set('descriptionElementId', id);
    return () => {
        store.set('descriptionElementId', undefined);
    };
}
