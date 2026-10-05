/**
 * Effect body; may return a cleanup function.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: effects may return nothing or a cleanup, like framework effects.
export type EffectCallback = () => void | (() => void);

/**
 * An effect with dependencies, like a framework effect: `sync(deps)` re-runs it (after cleaning up
 * the previous run) only when a dependency changed (`Object.is`).
 */
export class Effect {
    private deps: readonly unknown[] | null = null;

    private cleanup: (() => void) | null = null;

    private readonly run: EffectCallback;

    constructor(run: EffectCallback) {
        this.run = run;
    }

    sync(deps: readonly unknown[]) {
        if (this.deps && deps.length === this.deps.length && deps.every((dep, index) => Object.is(dep, this.deps?.[index]))) {
            return;
        }

        this.cleanup?.();
        this.deps = deps;
        this.cleanup = this.run() ?? null;
    }

    destroy() {
        this.cleanup?.();
        this.cleanup = null;
        this.deps = null;
    }
}
