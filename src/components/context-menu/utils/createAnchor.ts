import type { ContextMenuAnchor } from './ContextMenuAnchor';

export function createAnchor(x: number, y: number, size: number): ContextMenuAnchor {
    return {
        getBoundingClientRect() {
            return DOMRect.fromRect({ width: size, height: size, x, y });
        }
    };
}
