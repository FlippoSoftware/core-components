import { AnimationFrame } from '~@timers/AnimationFrame';

/**
 * Calls `fn` once `element` is attached to a document.
 *
 * Adapters may hand elements to the core before inserting them (ref callbacks run before
 * insertion in some renderers), so any measuring, focusing or `autoUpdate` must wait for it.
 *
 * @returns A function that cancels the pending call.
 */
export function whenConnected(element: Element, fn: () => void): () => void {
    if (element.isConnected) {
        fn();
        return () => {};
    }

    let canceled = false;
    const frame = new AnimationFrame();

    const check = () => {
        if (canceled) {
            return;
        }
        if (element.isConnected) {
            fn();
            return;
        }
        frame.request(check);
    };

    queueMicrotask(check);

    return () => {
        canceled = true;
        frame.cancel();
    };
}
