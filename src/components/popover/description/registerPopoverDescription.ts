import type { PopoverStore } from '../store/PopoverStore';

/**
 * Registers the ID of `Popover.Description` (`aria-describedby` of the popup).
 *
 * @returns A cleanup function.
 */
export function registerPopoverDescription(store: PopoverStore<unknown>, id: string): () => void {
    store.set('descriptionElementId', id);
    return () => {
        store.set('descriptionElementId', undefined);
    };
}
