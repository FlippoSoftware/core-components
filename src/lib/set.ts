type Style = {
    [key: string]: string;
};

const cache = new WeakMap();

export function isInView(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();

    if (!window.visualViewport) return false;

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        // Need + 40 for safari detection
        rect.bottom <= window.visualViewport.height - 40 &&
        rect.right <= window.visualViewport.width
    );
}

export function set(el: Element | HTMLElement | null | undefined, styles: Style, ignoreCache = false) {
    if (!el || !(el instanceof HTMLElement)) return;

    const originalStyles: Style = {};

    Object.entries(styles).forEach(([key, value]: [string, string]) => {
        if (key.startsWith('--')) {
            el.style.setProperty(key, value);
            return;
        }

        originalStyles[key] = (el.style as any)[key];
        (el.style as any)[key] = value;
    });

    if (ignoreCache) return;

    cache.set(el, originalStyles);
}
