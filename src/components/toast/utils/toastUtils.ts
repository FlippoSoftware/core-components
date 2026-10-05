/**
 * Registers the ID of a toast's title or description while it is rendered.
 *
 * @returns A cleanup function.
 */
export function registerToastLabel(setId: (id: string | undefined) => void, id: string): () => void {
    setId(id);
    return () => setId(undefined);
}

export type ToastPartState = {
    type: string | undefined;
};

/**
 * `Toast.Title`/`Toast.Description`: rendered only when there is content (children or the toast's text).
 */
export function shouldRenderToastText(children: unknown): boolean {
    return Boolean(children);
}
