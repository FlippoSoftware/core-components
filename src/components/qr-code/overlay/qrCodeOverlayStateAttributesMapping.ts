import type { TransitionStatus } from '~@lib/types';

import { qrCodeStateAttributesMapping } from '../root/qrCodeStateAttributesMapping';

import { QrCodeOverlayDataAttributes } from './QrCodeOverlayDataAttributes';

export const qrCodeOverlayStateAttributesMapping = {
    ...qrCodeStateAttributesMapping,
    transitionStatus: (transitionStatus: TransitionStatus): Record<string, string> | null => {
        if (transitionStatus === 'starting') {
            return { [QrCodeOverlayDataAttributes.startingStyle]: '' };
        }
        if (transitionStatus === 'ending') {
            return { [QrCodeOverlayDataAttributes.endingStyle]: '' };
        }
        return null;
    }
};
