import type { ToastUpdateOptions } from '../manager/ToastManager';

/**
 * Converts `loading`/`success`/`error` options of a promise toast to update options.
 */
export function resolvePromiseOptions<T, Data extends object>(
    options: string | ToastUpdateOptions<Data> | ((result: T) => string | ToastUpdateOptions<Data>),
    result?: T
): ToastUpdateOptions<Data> {
    if (typeof options === 'string') {
        return { description: options };
    }
    if (typeof options === 'function') {
        const resolvedOptions = options(result as T);
        return typeof resolvedOptions === 'string' ? { description: resolvedOptions } : resolvedOptions;
    }
    return options;
}
