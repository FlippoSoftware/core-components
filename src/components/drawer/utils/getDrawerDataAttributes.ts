import { DrawerGestureDataAttributes } from '../drag/DrawerGestureDataAttributes';

import type { DrawerDirection, DrawerPopupDataAttributes } from '../store/DrawerStore';

/**
 * Data attributes describing the swipe direction and whether snap points are used.
 */
export function getDrawerDataAttributes(snapPoints: boolean, swipeDirection: DrawerDirection): DrawerPopupDataAttributes {
    return {
        [DrawerGestureDataAttributes.snapPoints]: snapPoints ? '' : null,
        [DrawerGestureDataAttributes.swipeDirectionRight]: swipeDirection === 'right' ? '' : null,
        [DrawerGestureDataAttributes.swipeDirectionLeft]: swipeDirection === 'left' ? '' : null,
        [DrawerGestureDataAttributes.swipeDirectionUp]: swipeDirection === 'up' ? '' : null,
        [DrawerGestureDataAttributes.swipeDirectionDown]: swipeDirection === 'down' ? '' : null
    };
}
