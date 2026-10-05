import type { SnapPoint } from '../store/DrawerStore';

/**
 * Converts a snap point (px number or `"50%"`) to pixels of the container's size.
 */
export function parseSnapPoint(snapPoint: SnapPoint | null, containerSize: number): number {
    if (snapPoint === null) {
        return 0;
    }
    if (typeof snapPoint === 'number') {
        return snapPoint;
    }
    const match = snapPoint.match(/^(\d+(?:\.\d+)?)%$/);
    if (match?.[1]) {
        return (containerSize * Number.parseFloat(match[1])) / 100;
    }
    return 0;
}
