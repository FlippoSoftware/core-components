import type { DialogPopupState } from '../popup/DialogPopupMachine';

import type { AnyDialogStore } from './AnyDialogStore';

export function getDialogState(store: AnyDialogStore): DialogPopupState {
    return {
        open: store.select('open'),
        nested: store.select('nested'),
        transitionStatus: store.select('transitionStatus'),
        nestedDialogOpen: store.select('nestedOpenDialogCount') > 0
    };
}
