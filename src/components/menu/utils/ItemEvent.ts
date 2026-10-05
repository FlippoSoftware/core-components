import type { PreventableEvent } from '~@props/mergeProps';

export type ItemEvent = (MouseEvent | KeyboardEvent) & Partial<PreventableEvent> & { nativeEvent?: Event };
