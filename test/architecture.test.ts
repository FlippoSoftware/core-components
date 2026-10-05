// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            return listSourceFiles(path);
        }
        return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
    });
}

const FORBIDDEN_IMPORT = /from\s+['"](react|react-dom|@floating-ui\/react|@floating-ui\/react-dom)(\/[^'"]*)?['"]/;

describe('architecture', () => {
    const files = listSourceFiles(SRC);

    it('finds the sources', () => {
        expect(files.length).toBeGreaterThan(20);
    });

    it('does not import React or the React bindings of Floating UI', () => {
        const offenders = files.filter((file) => FORBIDDEN_IMPORT.test(readFileSync(file, 'utf8'))).map((file) => relative(SRC, file));
        expect(offenders).toEqual([]);
    });

    it('can be imported in Node.js without a DOM', async () => {
        expect(typeof globalThis.document).toBe('undefined');
        const core = await import('../src/index');
        expect(core.PopoverStore).toBeTypeOf('function');
        expect(core.REASONS.triggerPress).toBe('trigger-press');
    });

    it('creates stores without a DOM', async () => {
        const { DialogStore, MenuStore, PopoverStore, TooltipStore } = await import('../src/index');
        expect(new PopoverStore().state.open).toBe(false);
        expect(new DialogStore().state.modal).toBe(true);
        expect(new TooltipStore().state.isInstantPhase).toBe(true);
        expect(new MenuStore().state.hoverEnabled).toBe(true);
    });
});
