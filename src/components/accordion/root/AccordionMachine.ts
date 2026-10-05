import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { END, HOME } from '~@components/composite/utils/compositeKeys';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { isElementDisabled } from '~@lib/isElementDisabled';
import { warn } from '~@lib/warn';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP } from '~@packages/floating-ui/utils/constants';
import { stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { Orientation, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { accordionRootStateAttributesMapping } from './accordionRootStateAttributesMapping';

export type AccordionValue = unknown[];

export type AccordionChangeEventDetails = ChangeEventDetails<typeof REASONS.triggerPress | typeof REASONS.none>;

export type AccordionState = {
    value: AccordionValue;
    disabled: boolean;
    orientation: Orientation;
};

const SUPPORTED_KEYS = new Set([ARROW_DOWN, ARROW_UP, ARROW_RIGHT, ARROW_LEFT, HOME, END]);

const EMPTY_ACCORDION_VALUE: AccordionValue = [];

function getActiveTriggers(items: (HTMLElement | null)[]): HTMLButtonElement[] {
    const output: HTMLButtonElement[] = [];
    for (const section of items) {
        if (!isElementDisabled(section)) {
            const trigger = section?.querySelector('[type="button"]') as HTMLButtonElement;
            if (!isElementDisabled(trigger)) {
                output.push(trigger);
            }
        }
    }
    return output;
}

export type AccordionOptions = {
    value?: AccordionValue | undefined;
    defaultValue?: AccordionValue | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    hiddenUntilFound?: boolean | undefined;
    keepMounted?: boolean | undefined;
    /**
     * @default true
     */
    loopFocus?: boolean | undefined;
    onValueChange?: ((value: AccordionValue, eventDetails: AccordionChangeEventDetails) => void) | undefined;
    /**
     * @default false
     */
    multiple?: boolean | undefined;
    /**
     * @default 'vertical'
     */
    orientation?: Orientation | undefined;
    direction?: TextDirection | undefined;
};

/**
 * State machine of an accordion: the list of open item values.
 */
export class AccordionMachine {
    readonly store: Store<{ value: AccordionValue }>;

    readonly registry = new ListRegistry();

    private options: AccordionOptions;

    constructor(options: AccordionOptions = {}) {
        this.options = options;
        this.store = new Store({
            value: options.value === undefined ? (options.defaultValue ?? EMPTY_ACCORDION_VALUE) : EMPTY_ACCORDION_VALUE
        });
        this.warn();
    }

    setOptions(options: AccordionOptions) {
        this.options = options;
        this.warn();
    }

    private warn() {
        const { hiddenUntilFound, keepMounted } = this.options;
        if (process.env.NODE_ENV !== 'production' && hiddenUntilFound && keepMounted === false) {
            warn(
                'The `keepMounted={false}` prop on a Accordion.Root will be ignored when using `hiddenUntilFound` since it requires Panels to remain mounted when closed.'
            );
        }
    }

    get value(): AccordionValue {
        return this.options.value ?? this.store.state.value;
    }

    get disabled() {
        return this.options.disabled ?? false;
    }

    get orientation(): Orientation {
        return this.options.orientation ?? 'vertical';
    }

    get loopFocus() {
        return this.options.loopFocus ?? true;
    }

    get direction(): TextDirection {
        return this.options.direction ?? 'ltr';
    }

    get hiddenUntilFound() {
        return this.options.hiddenUntilFound ?? false;
    }

    get keepMounted() {
        return this.options.keepMounted ?? false;
    }

    getState(): AccordionState {
        return { value: this.value, disabled: this.disabled, orientation: this.orientation };
    }

    static attrs(state: AccordionState): Record<string, string> {
        return getStyleHookProps(state, accordionRootStateAttributesMapping);
    }

    getRootProps(elementProps: Props = {}): Props {
        return mergeProps({ dir: this.direction, role: 'region' }, elementProps);
    }

    isOpen(itemValue: unknown) {
        return this.value.includes(itemValue);
    }

    private setValue(nextValue: AccordionValue, details: AccordionChangeEventDetails) {
        this.options.onValueChange?.(nextValue, details);

        if (details.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('value', nextValue);
        }
    }

    /**
     * Opens or closes the item with `itemValue`.
     */
    handleValueChange = (itemValue: unknown, nextOpen: boolean) => {
        const value = this.value;
        const details = createChangeEventDetails(REASONS.none);

        if (!this.options.multiple) {
            this.setValue(value[0] === itemValue ? [] : [itemValue], details);
        } else if (nextOpen) {
            this.setValue([...value, itemValue], details);
        } else {
            this.setValue(
                value.filter((v) => v !== itemValue),
                details
            );
        }
    };

    /**
     * Arrow/Home/End navigation between the triggers.
     */
    onTriggerKeyDown = (event: KeyboardEvent) => {
        if (!SUPPORTED_KEYS.has(event.key)) {
            return;
        }

        stopEvent(event);

        const loopFocus = this.loopFocus;
        const isHorizontal = this.orientation === 'horizontal';
        const isRtl = this.direction === 'rtl';
        const triggers = getActiveTriggers(this.registry.elementsRef.current);
        const lastIndex = triggers.length - 1;
        const thisIndex = triggers.indexOf(event.target as HTMLButtonElement);

        let nextIndex = -1;
        const toNext = () => {
            nextIndex = loopFocus ? (thisIndex + 1 > lastIndex ? 0 : thisIndex + 1) : Math.min(thisIndex + 1, lastIndex);
        };
        const toPrev = () => {
            nextIndex = loopFocus ? (thisIndex === 0 ? lastIndex : thisIndex - 1) : thisIndex - 1;
        };

        switch (event.key) {
            case ARROW_DOWN:
                if (!isHorizontal) {
                    toNext();
                }
                break;
            case ARROW_UP:
                if (!isHorizontal) {
                    toPrev();
                }
                break;
            case ARROW_RIGHT:
                if (isHorizontal) {
                    if (isRtl) {
                        toPrev();
                    } else {
                        toNext();
                    }
                }
                break;
            case ARROW_LEFT:
                if (isHorizontal) {
                    if (isRtl) {
                        toNext();
                    } else {
                        toPrev();
                    }
                }
                break;
            case HOME:
                nextIndex = 0;
                break;
            case END:
                nextIndex = lastIndex;
                break;
            default:
                break;
        }

        if (nextIndex > -1) {
            triggers[nextIndex]?.focus();
        }
    };

    destroy() {
        this.registry.destroy();
    }
}
