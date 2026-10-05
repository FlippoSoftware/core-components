import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimationFrame } from './AnimationFrame';
import { Timeout } from './Timeout';

describe('Timeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs the latest scheduled call only', () => {
        const timeout = Timeout.create();
        const first = vi.fn();
        const second = vi.fn();

        timeout.start(100, first);
        timeout.start(100, second);
        expect(timeout.isStarted()).toBe(true);

        vi.advanceTimersByTime(100);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
        expect(timeout.isStarted()).toBe(false);
    });

    it('clears through the dispose effect', () => {
        const timeout = new Timeout();
        const fn = vi.fn();
        timeout.start(50, fn);
        timeout.disposeEffect()();
        vi.advanceTimersByTime(50);
        expect(fn).not.toHaveBeenCalled();
        timeout.clear();
    });
});

describe('AnimationFrame', () => {
    it('runs the latest request on the next frame', async () => {
        const frame = AnimationFrame.create();
        const first = vi.fn();
        const second = vi.fn();

        frame.request(first);
        frame.request(second);

        await new Promise<void>((resolve) => {
            AnimationFrame.request(() => resolve());
        });

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
        expect(frame.currentId).toBeNull();
    });

    it('cancels requests', async () => {
        const frame = new AnimationFrame();
        const fn = vi.fn();
        frame.request(fn);
        frame.disposeEffect()();

        const id = AnimationFrame.request(fn);
        AnimationFrame.cancel(id);
        AnimationFrame.cancel(-100);

        await new Promise<void>((resolve) => {
            AnimationFrame.request(() => resolve());
        });

        expect(fn).not.toHaveBeenCalled();
    });
});
