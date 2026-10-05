import { Timeout } from '~@timers/Timeout';

import type { HandleClose } from '~@packages/floating-ui/safePolygon';

import type { TooltipMultipleStore } from '../store/TooltipMultipleStore';

type Point = [number, number];

type Polygon = Point[];

const ORIGIN: Point = [0, 0];

/**
 * Checks if a point is inside a polygon (ray casting).
 */
export function isPointInPolygon(point: Point, polygon: Polygon): boolean {
    if (polygon.length < 3) {
        return false;
    }

    const [x, y] = point;
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const [xi, yi] = polygon[i] ?? ORIGIN;
        const [xj, yj] = polygon[j] ?? ORIGIN;
        const intersect = yi >= y !== yj >= y && x <= ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) {
            isInside = !isInside;
        }
    }
    return isInside;
}

function getRectCenter(rect: DOMRect): Point {
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

/**
 * Cross product of vectors OA and OB.
 */
function cross(o: Point, a: Point, b: Point): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Convex hull of a set of points (Graham scan).
 */
export function convexHull(points: Point[]): Point[] {
    if (points.length < 3) {
        return points;
    }

    // The lowest point (leftmost on ties) starts the hull.
    let start = 0;
    points.forEach((current, i) => {
        const startPoint = points[start] ?? ORIGIN;
        if (current[1] < startPoint[1] || (current[1] === startPoint[1] && current[0] < startPoint[0])) {
            start = i;
        }
    });
    const startPoint = points[start] ?? ORIGIN;

    // Sort by polar angle around the start point (closer points first on ties).
    const sorted = points
        .filter((_, i) => i !== start)
        .sort((a, b) => {
            const angleA = Math.atan2(a[1] - startPoint[1], a[0] - startPoint[0]);
            const angleB = Math.atan2(b[1] - startPoint[1], b[0] - startPoint[0]);
            if (angleA !== angleB) {
                return angleA - angleB;
            }
            const distA = (a[0] - startPoint[0]) ** 2 + (a[1] - startPoint[1]) ** 2;
            const distB = (b[0] - startPoint[0]) ** 2 + (b[1] - startPoint[1]) ** 2;
            return distA - distB;
        });

    const hull: Point[] = [startPoint];
    for (const point of sorted) {
        while (hull.length > 1) {
            const prev = hull[hull.length - 2] ?? ORIGIN;
            const last = hull[hull.length - 1] ?? ORIGIN;
            if (cross(prev, last, point) > 0) {
                break;
            }
            hull.pop();
        }
        hull.push(point);
    }
    return hull;
}

/**
 * Expands a polygon from its centroid by `buffer` pixels.
 */
function expandPolygon(polygon: Point[], buffer: number): Point[] {
    if (polygon.length < 3) {
        return polygon;
    }
    const centroid: Point = [
        polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
        polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length
    ];
    return polygon.map((point) => {
        const dx = point[0] - centroid[0];
        const dy = point[1] - centroid[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) {
            return point;
        }
        const scale = (dist + buffer) / dist;
        return [centroid[0] + dx * scale, centroid[1] + dy * scale] as Point;
    });
}

/**
 * Polygon covering the gap between a trigger and its popup.
 */
function createTriggerPopupPolygon(triggerRect: DOMRect, popupRect: DOMRect, buffer: number): Polygon {
    const triggerCenter = getRectCenter(triggerRect);
    const popupCenter = getRectCenter(popupRect);
    const dx = popupCenter[0] - triggerCenter[0];
    const dy = popupCenter[1] - triggerCenter[1];

    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) {
            // Popup to the right.
            return [
                [triggerRect.right - buffer, triggerRect.top - buffer],
                [triggerRect.right - buffer, triggerRect.bottom + buffer],
                [popupRect.left + buffer, popupRect.bottom + buffer],
                [popupRect.left + buffer, popupRect.top - buffer]
            ];
        }
        // Popup to the left.
        return [
            [triggerRect.left + buffer, triggerRect.top - buffer],
            [triggerRect.left + buffer, triggerRect.bottom + buffer],
            [popupRect.right - buffer, popupRect.bottom + buffer],
            [popupRect.right - buffer, popupRect.top - buffer]
        ];
    }
    if (dy > 0) {
        // Popup below.
        return [
            [triggerRect.left - buffer, triggerRect.bottom - buffer],
            [triggerRect.right + buffer, triggerRect.bottom - buffer],
            [popupRect.right + buffer, popupRect.top + buffer],
            [popupRect.left - buffer, popupRect.top + buffer]
        ];
    }
    // Popup above.
    return [
        [triggerRect.left - buffer, triggerRect.top + buffer],
        [triggerRect.right + buffer, triggerRect.top + buffer],
        [popupRect.right + buffer, popupRect.bottom - buffer],
        [popupRect.left - buffer, popupRect.bottom - buffer]
    ];
}

function getRectCorners(rect: DOMRect, buffer: number): Point[] {
    return [
        [rect.left - buffer, rect.top - buffer],
        [rect.right + buffer, rect.top - buffer],
        [rect.right + buffer, rect.bottom + buffer],
        [rect.left - buffer, rect.bottom + buffer]
    ];
}

export type MultipleSafePolygonOptions = {
    /**
     * Buffer around elements.
     * @default 5
     */
    buffer?: number | undefined;
    /**
     * Whether to block pointer events on the body.
     * @default false
     */
    blockPointerEvents?: boolean | undefined;
};

/**
 * Safe polygon for the tooltips of a `Tooltip.Multiple` group: the cursor is safe inside the convex hull
 * of all triggers, the area between each trigger and its popup, and the popups themselves.
 * Moving between the group's triggers and popups therefore doesn't close the shared tooltip.
 */
export function multipleSafePolygon(multipleStore: TooltipMultipleStore, options: MultipleSafePolygonOptions = {}): HandleClose {
    const { buffer = 5, blockPointerEvents = false } = options;
    const timeout = new Timeout();

    const fn: HandleClose = ({ onClose }) =>
        function onMouseMove(event: MouseEvent) {
            const close = () => {
                timeout.clear();
                onClose();
            };

            timeout.clear();

            const triggers = multipleStore.getAllTriggerElements();
            const popups = multipleStore.getAllPopupElements();
            if (triggers.length === 0) {
                close();
                return;
            }

            const polygons: Polygon[] = [];

            // 1. The convex hull of all triggers.
            const triggerPoints = triggers.flatMap((trigger) => getRectCorners(trigger.getBoundingClientRect(), buffer));
            if (triggerPoints.length >= 3) {
                polygons.push(expandPolygon(convexHull(triggerPoints), buffer));
            }

            // 2. The connection between each trigger and its popup.
            for (const trigger of triggers) {
                for (const store of multipleStore.context.stores) {
                    if (store.context.triggerElements.hasElement(trigger)) {
                        const popupElement = store.select('popupElement');
                        if (popupElement) {
                            polygons.push(
                                createTriggerPopupPolygon(trigger.getBoundingClientRect(), popupElement.getBoundingClientRect(), buffer)
                            );
                        }
                        break;
                    }
                }
            }

            // 3. The popups.
            for (const popup of popups) {
                polygons.push(getRectCorners(popup.getBoundingClientRect(), buffer));
            }

            const cursorPoint: Point = [event.clientX, event.clientY];
            if (polygons.some((polygon) => isPointInPolygon(cursorPoint, polygon))) {
                return;
            }

            // Outside every safe zone: close after a short delay.
            timeout.start(50, close);
        };

    fn.__options = { blockPointerEvents };
    return fn;
}
