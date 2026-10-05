import { defineConfig } from 'vitest/config';

import { alias } from './aliases';

export default defineConfig({
    resolve: { alias },
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/env.d.ts'],
            // Ratchet: raise as interaction tests (pointer/keyboard, browser layout) are added. Target: 85.
            thresholds: {
                lines: 50
            }
        }
    }
});
