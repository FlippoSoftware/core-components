import { PopupTriggerMap } from '~@popup/PopupTriggerMap';

import { FloatingRootStore } from './FloatingRootStore';

/**
 * Creates a closed floating root without elements. Used as the initial value in popup stores.
 */
export function getEmptyRootContext(): FloatingRootStore {
    return new FloatingRootStore({
        open: false,
        floatingElement: null,
        referenceElement: null,
        triggerElements: new PopupTriggerMap(),
        floatingId: '',
        nested: false,
        noEmit: false,
        onOpenChange: undefined
    });
}
