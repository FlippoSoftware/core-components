import { fileURLToPath } from 'node:url';

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Path aliases (keep in sync with `compilerOptions.paths` in tsconfig.json).
 */
export const alias = {
    '~@lib': resolve('./src/lib'),
    '~@components': resolve('./src/components'),
    '~@packages': resolve('./src/packages'),
    '~@attributes': resolve('./src/lib/attributes'),
    '~@dom': resolve('./src/lib/dom'),
    '~@events': resolve('./src/lib/events'),
    '~@patterns': resolve('./src/lib/patterns'),
    '~@popup': resolve('./src/lib/popup'),
    '~@positioning': resolve('./src/lib/positioning'),
    '~@props': resolve('./src/lib/props'),
    '~@store': resolve('./src/lib/store'),
    '~@timers': resolve('./src/lib/timers')
};
