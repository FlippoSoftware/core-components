import { generateId } from '~@lib/generateId';

import type { MutableRef } from '~@lib/types';

export type ToastObject<Data extends object = object> = {
    id: string;
    ref?: MutableRef<HTMLElement | null> | undefined;
    title?: string | undefined;
    type?: string | undefined;
    description?: string | undefined;
    timeout?: number | undefined;
    priority?: 'low' | 'high' | undefined;
    transitionStatus?: 'starting' | 'ending' | undefined;
    limited?: boolean | undefined;
    height?: number | undefined;
    onClose?: (() => void) | undefined;
    onRemove?: (() => void) | undefined;
    actionProps?: Record<string, unknown> | undefined;
    data?: Data | undefined;
};

export type ToastAddOptions<Data extends object = object> = {
    id?: string | undefined;
} & Omit<ToastObject<Data>, 'id' | 'height' | 'ref' | 'limited'>;

export type ToastUpdateOptions<Data extends object = object> = Partial<ToastAddOptions<Data>>;

export type ToastPromiseOptions<Value, Data extends object = object> = {
    loading: string | ToastUpdateOptions<Data>;
    success: string | ToastUpdateOptions<Data> | ((result: Value) => string | ToastUpdateOptions<Data>);
    // biome-ignore lint/suspicious/noExplicitAny: rejection reasons are untyped.
    error: string | ToastUpdateOptions<Data> | ((error: any) => string | ToastUpdateOptions<Data>);
};

export type ToastManagerEvent =
    | { action: 'add'; options: ToastAddOptions & { id: string } }
    | { action: 'close'; options: { id: string } }
    | { action: 'update'; options: ToastUpdateOptions & { id: string } }
    | {
          action: 'promise';
          options: ToastPromiseOptions<unknown> & { promise: Promise<unknown>; setPromise: (promise: Promise<unknown>) => void };
      };

/**
 * A toast manager usable outside of components (e.g. from a request handler).
 * Pass it to the toast provider to connect them.
 */
export class ToastManager {
    private readonly listeners = new Set<(event: ToastManagerEvent) => void>();

    subscribe(listener: (event: ToastManagerEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    add<Data extends object>(options: ToastAddOptions<Data>): string {
        const id = options.id || generateId('toast');
        this.emit({ action: 'add', options: { ...options, id, transitionStatus: 'starting' } as ToastAddOptions & { id: string } });
        return id;
    }

    close(id: string): void {
        this.emit({ action: 'close', options: { id } });
    }

    update<Data extends object>(id: string, updates: ToastUpdateOptions<Data>): void {
        this.emit({ action: 'update', options: { ...updates, id } as ToastUpdateOptions & { id: string } });
    }

    promise<Value, Data extends object>(promiseValue: Promise<Value>, options: ToastPromiseOptions<Value, Data>): Promise<Value> {
        let handledPromise = promiseValue;
        this.emit({
            action: 'promise',
            options: {
                ...(options as ToastPromiseOptions<unknown>),
                promise: promiseValue,
                setPromise(promise: Promise<unknown>) {
                    handledPromise = promise as Promise<Value>;
                }
            }
        });
        return handledPromise;
    }

    private emit(event: ToastManagerEvent) {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

export function createToastManager(): ToastManager {
    return new ToastManager();
}
