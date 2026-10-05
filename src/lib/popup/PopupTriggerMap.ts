/**
 * Data structure to keep track of popup trigger elements by their IDs.
 * Uses both a set of Elements and a map of IDs to Elements for efficient lookups.
 */
export class PopupTriggerMap {
    private readonly elementsSet: Set<Element>;

    private readonly idMap: Map<string, Element>;

    constructor() {
        this.elementsSet = new Set();
        this.idMap = new Map();
    }

    /**
     * Adds a trigger element with the given ID.
     *
     * Note: The provided element is assumed to not be registered under multiple IDs.
     */
    public add(id: string, element: Element) {
        const existingElement = this.idMap.get(id);
        if (existingElement === element) {
            return;
        }

        if (existingElement !== undefined) {
            // We assume that the same element won't be registered under multiple ids.
            // This is safe considering how `registerTrigger` is implemented.
            this.elementsSet.delete(existingElement);
        }

        this.elementsSet.add(element);
        this.idMap.set(id, element);

        if (process.env.NODE_ENV !== 'production' && this.elementsSet.size !== this.idMap.size) {
            throw new Error('Flippo UI: A trigger element cannot be registered under multiple IDs in PopupTriggerMap.');
        }
    }

    /**
     * Removes the trigger element with the given ID.
     */
    public delete(id: string) {
        const element = this.idMap.get(id);
        if (element) {
            this.elementsSet.delete(element);
            this.idMap.delete(id);
        }
    }

    /**
     * Whether the given element is registered as a trigger.
     */
    public hasElement(element: Element): boolean {
        return this.elementsSet.has(element);
    }

    /**
     * Whether there is a registered trigger element matching the given predicate.
     */
    public hasMatchingElement(predicate: (el: Element) => boolean): boolean {
        for (const element of this.elementsSet) {
            if (predicate(element)) {
                return true;
            }
        }

        return false;
    }

    public getById(id: string): Element | undefined {
        return this.idMap.get(id);
    }

    public entries(): IterableIterator<[string, Element]> {
        return this.idMap.entries();
    }

    /**
     * Returns an iterable of all registered trigger elements.
     */
    public elements(): IterableIterator<Element> {
        return this.elementsSet.values();
    }

    public get size(): number {
        return this.idMap.size;
    }
}
