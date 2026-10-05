import type { MutableRef } from '~@lib/types';

export type CompositeMetadata<CustomMetadata> = { index?: number | null } & CustomMetadata;

export type ListRegistryMap<Metadata> = Map<Element, CompositeMetadata<Metadata>>;

function sortByDocumentPosition(a: Element, b: Element) {
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING || position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
        return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING || position & Node.DOCUMENT_POSITION_CONTAINS) {
        return 1;
    }
    return 0;
}

export type ListRegistryOptions<Metadata> = {
    /**
     * List elements ordered by index (shared with list navigation).
     */
    elementsRef?: MutableRef<(HTMLElement | null)[]> | undefined;
    /**
     * Element labels ordered by index (shared with typeahead).
     */
    labelsRef?: MutableRef<(string | null)[]> | undefined;
    /**
     * Called with the sorted map whenever it changes.
     */
    onMapChange?: ((map: ListRegistryMap<Metadata>) => void) | undefined;
};

/**
 * Registry of list items ordered by their position in the DOM, not by render order.
 * Replacement for `CompositeList`: items register their element, and receive their index
 * once the registry is flushed (batched in a microtask, or synchronously with {@link ListRegistry.flush}).
 * DOM reordering is detected with a `MutationObserver`.
 */
export class ListRegistry<Metadata = Record<string, unknown>> {
    readonly elementsRef: MutableRef<(HTMLElement | null)[]>;

    readonly labelsRef: MutableRef<(string | null)[]> | undefined;

    /**
     * Index the next item can guess before the registry is flushed.
     */
    readonly nextIndexRef: MutableRef<number> = { current: 0 };

    private options: ListRegistryOptions<Metadata>;

    private readonly map = new Map<Element, Metadata | null>();

    private sortedMap: ListRegistryMap<Metadata> = new Map();

    private readonly listeners = new Set<(map: ListRegistryMap<Metadata>) => void>();

    private scheduled = false;

    private dirty = false;

    private observer: MutationObserver | null = null;

    private destroyed = false;

    constructor(options: ListRegistryOptions<Metadata> = {}) {
        this.options = options;
        this.elementsRef = options.elementsRef ?? { current: [] };
        this.labelsRef = options.labelsRef;
    }

    setOptions(options: ListRegistryOptions<Metadata>) {
        this.options = options;
    }

    get size() {
        return this.sortedMap.size;
    }

    /**
     * The registered elements with their metadata and index, ordered by DOM position.
     */
    getMap(): ListRegistryMap<Metadata> {
        return this.sortedMap;
    }

    register = (node: Element, metadata?: Metadata) => {
        this.map.set(node, metadata ?? null);
        this.markDirty();
    };

    unregister = (node: Element) => {
        this.map.delete(node);
        this.markDirty();
    };

    /**
     * Subscribes to changes of the sorted map.
     */
    subscribe = (listener: (map: ListRegistryMap<Metadata>) => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    /**
     * Index of a registered element, or `-1`.
     */
    indexOf(node: Element | null): number {
        if (!node) {
            return -1;
        }
        return this.sortedMap.get(node)?.index ?? -1;
    }

    /**
     * Sorts the registered elements and notifies the subscribers now.
     */
    flush = () => {
        if (!this.dirty || this.destroyed) {
            return;
        }
        this.dirty = false;

        const newMap: ListRegistryMap<Metadata> = new Map();
        const sortedNodes = Array.from(this.map.keys()).sort(sortByDocumentPosition);
        sortedNodes.forEach((node, index) => {
            const metadata = this.map.get(node) ?? ({} as Metadata);
            newMap.set(node, { ...metadata, index });
        });
        this.sortedMap = newMap;

        if (this.elementsRef.current.length !== newMap.size) {
            this.elementsRef.current.length = newMap.size;
        }
        if (this.labelsRef && this.labelsRef.current.length !== newMap.size) {
            this.labelsRef.current.length = newMap.size;
        }
        this.nextIndexRef.current = newMap.size;

        this.observeReordering();
        this.options.onMapChange?.(newMap);
        for (const listener of this.listeners) {
            listener(newMap);
        }
    };

    destroy() {
        this.destroyed = true;
        this.observer?.disconnect();
        this.observer = null;
        this.elementsRef.current = [];
        if (this.labelsRef) {
            this.labelsRef.current = [];
        }
        this.listeners.clear();
    }

    private markDirty() {
        this.dirty = true;
        if (this.scheduled) {
            return;
        }
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            this.flush();
        });
    }

    private observeReordering() {
        this.observer?.disconnect();
        this.observer = null;

        if (typeof MutationObserver !== 'function' || this.sortedMap.size === 0) {
            return;
        }

        const observer = new MutationObserver((entries) => {
            const diff = new Set<Node>();
            const updateDiff = (node: Node) => (diff.has(node) ? diff.delete(node) : diff.add(node));
            for (const entry of entries) {
                entry.removedNodes.forEach(updateDiff);
                entry.addedNodes.forEach(updateDiff);
            }
            // Nodes were moved (removed and re-added), not mounted or unmounted.
            if (diff.size === 0) {
                this.markDirty();
            }
        });

        for (const node of this.sortedMap.keys()) {
            if (node.parentElement) {
                observer.observe(node.parentElement, { childList: true });
            }
        }

        this.observer = observer;
    }
}

/**
 * One item of a {@link ListRegistry}: registers its element and tracks its index.
 * Replacement for `useCompositeListItem`.
 */
export class ListRegistryItem<Metadata = Record<string, unknown>> {
    private readonly registry: ListRegistry<Metadata>;

    private element: HTMLElement | null = null;

    private index: number;

    private label: string | null | undefined;

    private metadata: Metadata | undefined;

    private readonly externalIndex: number | undefined;

    private readonly unsubscribe: () => void;

    private readonly onIndexChange: (index: number) => void;

    constructor(
        registry: ListRegistry<Metadata>,
        options: {
            index?: number | undefined;
            label?: string | null | undefined;
            metadata?: Metadata | undefined;
            guessIndex?: boolean | undefined;
            onIndexChange?: ((index: number) => void) | undefined;
        } = {}
    ) {
        this.registry = registry;
        this.externalIndex = options.index;
        this.label = options.label;
        this.metadata = options.metadata;
        this.onIndexChange = options.onIndexChange ?? (() => {});

        if (options.index !== undefined) {
            this.index = options.index;
        } else if (options.guessIndex) {
            this.index = registry.nextIndexRef.current;
            registry.nextIndexRef.current += 1;
        } else {
            this.index = -1;
        }

        this.unsubscribe =
            this.externalIndex == null
                ? registry.subscribe((map) => {
                      const index = this.element ? map.get(this.element)?.index : null;
                      if (index != null && index !== this.index) {
                          this.index = index;
                          this.writeRefs();
                          this.onIndexChange(index);
                      }
                  })
                : () => {};
    }

    getIndex() {
        return this.index;
    }

    setLabel(label: string | null | undefined) {
        this.label = label;
        this.writeRefs();
    }

    setMetadata(metadata: Metadata | undefined) {
        this.metadata = metadata;
        if (this.element && this.externalIndex == null) {
            this.registry.register(this.element, metadata);
        }
    }

    /**
     * Ref callback for the item element.
     */
    setElement = (element: HTMLElement | null) => {
        if (this.element && this.element !== element && this.externalIndex == null) {
            this.registry.unregister(this.element);
        }
        this.element = element;
        if (element && this.externalIndex == null) {
            this.registry.register(element, this.metadata);
        }
        this.writeRefs();
    };

    destroy() {
        this.unsubscribe();
        if (this.element && this.externalIndex == null) {
            this.registry.unregister(this.element);
        }
    }

    private writeRefs() {
        const node = this.element;
        if (this.index === -1 || node === null) {
            return;
        }
        this.registry.elementsRef.current[this.index] = node;
        if (this.registry.labelsRef) {
            this.registry.labelsRef.current[this.index] = this.label !== undefined ? this.label : node.textContent;
        }
    }
}
