// biome-ignore-all lint/suspicious/noExplicitAny: untyped emitter mirrors the Floating UI events API.

export type EventMap = Record<string, unknown>;

/**
 * Typed event emitter.
 */
export class EventEmitter<T extends EventMap> {
    private readonly map = new Map<keyof T, Set<(data: unknown) => void>>();

    /**
     * Registers a listener.
     * @returns A function that removes the listener.
     */
    public on<K extends keyof T>(event: K, listener: (data: T[K]) => void): () => void {
        let listeners = this.map.get(event);
        if (!listeners) {
            listeners = new Set();
            this.map.set(event, listeners);
        }

        listeners.add(listener as (data: unknown) => void);

        return () => this.off(event, listener);
    }

    /**
     * Removes a listener.
     */
    public off<K extends keyof T>(event: K, listener: (data: T[K]) => void): void {
        this.map.get(event)?.delete(listener as (data: unknown) => void);
    }

    /**
     * Calls every listener of the event with `data`.
     */
    public emit<K extends keyof T>(event: K, data: T[K]): void {
        for (const listener of this.map.get(event) ?? []) {
            listener(data);
        }
    }

    /**
     * Registers a listener that is removed after the first call.
     */
    public once<K extends keyof T>(event: K, listener: (data: T[K]) => void): () => void {
        const removeListener = this.on(event, (data) => {
            removeListener();
            listener(data);
        });
        return removeListener;
    }

    /**
     * Removes all listeners of the event, or of every event when no name is given.
     */
    public removeAllListeners<K extends keyof T>(event?: K): void {
        if (event) {
            this.map.delete(event);
        } else {
            this.map.clear();
        }
    }
}

/**
 * Loosely typed emitter used by floating elements (`openchange`, `setOpen`, `virtualfocus`, …).
 * Same shape as Floating UI's `FloatingEvents`.
 */
export type FloatingEvents = {
    emit: <T extends string>(event: T, data?: any) => void;
    on: (event: string, handler: (data: any) => void) => void;
    off: (event: string, handler: (data: any) => void) => void;
};

export function createEventEmitter(): FloatingEvents {
    const map = new Map<string, Set<(data: any) => void>>();
    return {
        emit(event: string, data: any) {
            for (const listener of map.get(event) ?? []) {
                listener(data);
            }
        },
        on(event: string, listener: (data: any) => void) {
            let listeners = map.get(event);
            if (!listeners) {
                listeners = new Set();
                map.set(event, listeners);
            }
            listeners.add(listener);
        },
        off(event: string, listener: (data: any) => void) {
            map.get(event)?.delete(listener);
        }
    };
}
