import type { MutableRef } from './types';

/**
 * Creates a mutable reference object.
 */
export function createRef<T>(initialValue: T): MutableRef<T>;
export function createRef<T>(): MutableRef<T | null>;
export function createRef<T>(initialValue: T | null = null): MutableRef<T | null> {
    return { current: initialValue };
}
