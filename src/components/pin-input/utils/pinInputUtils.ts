import type { PinInputFocusMode, PinInputType } from '../root/PinInputMachine';

// Pre-compiled regex patterns for better performance
const PATTERNS = {
    alphabetic: /^[a-z]$/i,
    numeric: /^\d$/,
    alphanumeric: /^[a-z0-9]$/i
} as const;

// Cache for custom patterns to avoid re-compilation
const patternCache = new Map<string, RegExp>();

export function testPattern(value: string, type?: PinInputType, pattern?: string): boolean {
    // Empty value should not pass validation
    if (value === '') {
        return false;
    }

    if (pattern) {
        let regex = patternCache.get(pattern);
        if (!regex) {
            regex = new RegExp(pattern);
            patternCache.set(pattern, regex);
        }
        return regex.test(value);
    }

    if (type && PATTERNS[type]) {
        return PATTERNS[type].test(value);
    }

    return true;
}

export function getFirstEmptyIndex(values: string[]): number {
    const index = values.indexOf('');
    return index === -1 ? Math.max(values.length - 1, 0) : index;
}

export function getFocusTarget(mode: PinInputFocusMode, values: string[], lastFocusedIndex: number | null, maxIndex: number): number {
    switch (mode) {
        case 'first-empty':
            return Math.min(getFirstEmptyIndex(values), maxIndex);
        case 'first':
            return 0;
        default:
            return Math.min(lastFocusedIndex ?? 0, maxIndex);
    }
}
