import { QrCodeRootDataAttributes } from './QrCodeRootDataAttributes';

import type { QrCodeStatus } from './QrCodeMachine';

export const qrCodeStateAttributesMapping = {
    status: (status: QrCodeStatus): Record<string, string> => {
        switch (status) {
            case 'loading':
                return { [QrCodeRootDataAttributes.statusLoading]: '' };
            case 'error':
                return { [QrCodeRootDataAttributes.statusError]: '' };
            case 'generated':
                return { [QrCodeRootDataAttributes.statusGenerated]: '' };
            default:
                return { [QrCodeRootDataAttributes.statusIdle]: '' };
        }
    }
};
