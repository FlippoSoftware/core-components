export * as REASONS from './reasonParts';

import type * as Reasons from './reasonParts';

export type EventReasons = typeof Reasons;
export type EventReason = EventReasons[keyof EventReasons];
