import { DialogPopupDataAttributes } from '../popup/DialogPopupDataAttributes';

export const nestedMapping = {
    nested(value: boolean) {
        return value ? { [DialogPopupDataAttributes.nested]: '' } : null;
    },
    nestedDialogOpen(value: boolean) {
        return value ? { [DialogPopupDataAttributes.nestedDialogOpen]: '' } : null;
    }
};
