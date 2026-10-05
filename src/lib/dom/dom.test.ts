import { afterEach, describe, expect, it, vi } from 'vitest';

import { runOnceAnimationsFinish } from './animations';
import { whenConnected } from './whenConnected';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function frames(count: number) {
    for (let i = 0; i < count; i += 1) {
        await nextFrame();
    }
}

function mockAnimations(element: HTMLElement, animations: () => Partial<Animation>[]) {
    element.getAnimations = (() => animations()) as HTMLElement['getAnimations'];
}

describe('whenConnected', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('runs immediately for connected elements', () => {
        const element = document.body.appendChild(document.createElement('div'));
        const fn = vi.fn();
        whenConnected(element, fn)();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('waits until the element is inserted', async () => {
        const element = document.createElement('div');
        const fn = vi.fn();
        whenConnected(element, fn);

        await frames(1);
        expect(fn).not.toHaveBeenCalled();

        document.body.appendChild(element);
        await frames(2);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('can be canceled', async () => {
        const element = document.createElement('div');
        const fn = vi.fn();
        const cancel = whenConnected(element, fn);
        document.body.appendChild(element);
        cancel();
        await frames(2);
        expect(fn).not.toHaveBeenCalled();
    });
});

describe('runOnceAnimationsFinish', () => {
    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = undefined;
    });

    it('does nothing without an element', () => {
        const fn = vi.fn();
        runOnceAnimationsFinish(null, fn);
        expect(fn).not.toHaveBeenCalled();
    });

    it('runs synchronously when animations are disabled', () => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
        const fn = vi.fn();
        runOnceAnimationsFinish(document.createElement('div'), fn);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('waits for animations and flushes the callback', async () => {
        const element = document.createElement('div');
        let resolveAnimation: () => void = () => {};
        const finished = new Promise<Animation>((resolve) => {
            resolveAnimation = () => resolve({} as Animation);
        });
        mockAnimations(element, () => [{ finished }]);

        const fn = vi.fn();
        const flush = vi.fn((cb: () => void) => cb());
        runOnceAnimationsFinish(element, fn, { flush, waitForNextTick: true });

        await frames(3);
        expect(fn).not.toHaveBeenCalled();

        resolveAnimation();
        await finished;
        await Promise.resolve();
        expect(flush).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries once when no animation has started yet', async () => {
        const element = document.createElement('div');
        const getAnimations = vi.fn(() => []);
        mockAnimations(element, getAnimations);
        const fn = vi.fn();

        runOnceAnimationsFinish(element, fn);
        await frames(3);
        expect(getAnimations).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('respects the abort signal', async () => {
        const element = document.createElement('div');
        mockAnimations(element, () => []);
        const controller = new AbortController();
        const fn = vi.fn();

        runOnceAnimationsFinish(element, fn, { signal: controller.signal });
        controller.abort();
        await frames(3);
        expect(fn).not.toHaveBeenCalled();
    });

    it('treats aborted animations as finished by default', async () => {
        const element = document.createElement('div');
        const rejected = Promise.reject(new Error('aborted'));
        rejected.catch(() => {});
        mockAnimations(element, () => [{ finished: rejected }]);
        const fn = vi.fn();

        runOnceAnimationsFinish(element, fn);
        await frames(2);
        await Promise.resolve();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('re-checks running animations when aborted ones do not count as finished', async () => {
        const element = document.createElement('div');
        const rejected = Promise.reject(new Error('aborted'));
        rejected.catch(() => {});
        let calls = 0;
        mockAnimations(element, () => {
            calls += 1;
            return calls <= 2
                ? [{ finished: rejected, pending: true, playState: 'running' }]
                : [{ finished: Promise.resolve({} as Animation) }];
        });
        const fn = vi.fn();

        runOnceAnimationsFinish(element, fn, { treatAbortedAsFinished: false });
        await frames(2);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
