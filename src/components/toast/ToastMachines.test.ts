import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ButtonMachine } from '~@components/button/root/ButtonMachine';

import { getToastCloseProps } from './close/getToastCloseProps';
import { createToastManager } from './manager/ToastManager';
import { ToastProviderMachine } from './provider/ToastProviderMachine';
import { ToastRootMachine } from './root/ToastRootMachine';
import { ToastViewportMachine } from './viewport/ToastViewportMachine';

describe('Toast machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('adds toasts, enforces the limit and auto-dismisses them', () => {
        const provider = new ToastProviderMachine({ timeout: 1000, limit: 2 });
        const onClose = vi.fn();

        provider.add({ title: 'first', onClose });
        provider.add({ title: 'second' });
        provider.add({ title: 'third' });

        const { toasts } = provider.store.state;
        expect(toasts.map((toast) => toast.title)).toEqual(['third', 'second', 'first']);
        expect(toasts.map((toast) => toast.limited)).toEqual([false, false, true]);

        vi.advanceTimersByTime(1000);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(provider.store.state.toasts.every((toast) => toast.transitionStatus === 'ending')).toBe(true);

        provider.destroy();
    });

    it('pauses timers while hovered and resumes them on leave', () => {
        const provider = new ToastProviderMachine({ timeout: 1000 });
        const viewport = new ToastViewportMachine(provider);
        const viewportElement = document.createElement('div');
        document.body.append(viewportElement);
        viewport.setElement(viewportElement);

        const id = provider.add({ title: 'hello' });
        const props = viewport.getViewportProps();
        props.onMouseEnter();
        expect(viewport.getState().expanded).toBe(true);

        vi.advanceTimersByTime(5000);
        expect(provider.store.state.toasts[0]?.transitionStatus).toBe('starting');

        props.onMouseLeave();
        vi.advanceTimersByTime(1000);
        expect(provider.store.state.toasts.find((toast) => toast.id === id)?.transitionStatus).toBe('ending');

        viewport.destroy();
        provider.destroy();
    });

    it('connects a toast manager and handles promises', async () => {
        const manager = createToastManager();
        const provider = new ToastProviderMachine({ toastManager: manager });

        const result = manager.promise(Promise.resolve(42), { loading: 'Loading', success: (value) => `Done ${value}`, error: 'Failed' });
        expect(provider.store.state.toasts[0]).toMatchObject({ type: 'loading', description: 'Loading' });

        await expect(result).resolves.toBe(42);
        expect(provider.store.state.toasts[0]).toMatchObject({ type: 'success', description: 'Done 42' });

        manager.close(provider.store.state.toasts[0]?.id ?? '');
        expect(provider.store.state.toasts[0]?.transitionStatus).toBe('ending');

        provider.destroy();
    });

    it('removes a toast after its exit and closes it from Toast.Close', () => {
        const provider = new ToastProviderMachine();
        const onRemove = vi.fn();
        provider.add({ title: 'hello', onRemove, priority: 'high' });
        const toast = provider.store.state.toasts[0];
        if (!toast) {
            throw new Error('missing toast');
        }

        const root = new ToastRootMachine(provider, { toast });
        const element = document.createElement('div');
        document.body.append(element);
        root.setElement(element);
        root.setOptions({ toast: provider.store.state.toasts[0] ?? toast });

        const rootProps = root.getRootProps();
        expect(rootProps.role).toBe('alertdialog');
        expect(rootProps['aria-hidden']).toBe(true);
        expect(ToastRootMachine.attrs(root.getState())).not.toHaveProperty('data-swiping');

        const closeProps = getToastCloseProps(provider, toast, new ButtonMachine());
        closeProps.onClick(new MouseEvent('click'));

        root.setOptions({ toast: provider.store.state.toasts[0] ?? toast });
        expect(onRemove).toHaveBeenCalled();
        expect(provider.store.state.toasts).toHaveLength(0);

        root.destroy();
        provider.destroy();
    });
});
