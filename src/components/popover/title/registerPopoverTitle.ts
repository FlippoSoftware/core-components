import type { PopoverStore } from '../store/PopoverStore';

/**
 * Registers the ID of `Popover.Title` (`aria-labelledby` of the popup).
 *
 * @returns A cleanup function.
 */
export function registerPopoverTitle(store: PopoverStore<unknown>, id: string): () => void {
    store.set('titleElementId', id);
    return () => {
        store.set('titleElementId', undefined);
    };
}
