import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { COMPOSITE_KEYS, END, HOME } from '~@components/composite/utils/compositeKeys';
import { formatNumber } from '~@lib/formatNumber';
import { valueToPercent } from '~@lib/valueToPercent';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP } from '~@packages/floating-ui/utils/constants';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { Style } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { getMidpoint, getSliderValue, roundValueToStep } from '../utils/sliderUtils';

import type { SliderMachine } from '../root/SliderMachine';

export type SliderThumbMetadata = {
    inputId: string | null | undefined;
};

const PAGE_UP = 'PageUp';

const PAGE_DOWN = 'PageDown';

const ALL_KEYS = new Set([ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, HOME, END, PAGE_UP, PAGE_DOWN]);

function getDefaultAriaValueText(
    values: readonly number[],
    index: number,
    format: Intl.NumberFormatOptions | undefined,
    locale: Intl.LocalesArgument | undefined
): string | undefined {
    if (index < 0) {
        return undefined;
    }

    if (values.length === 2) {
        return index === 0
            ? `${formatNumber(values[index], locale, format)} start range`
            : `${formatNumber(values[index], locale, format)} end range`;
    }

    return format ? formatNumber(values[index], locale, format) : undefined;
}

function getNewValue(thumbValue: number, step: number, direction: 1 | -1, min: number, max: number): number {
    return direction === 1 ? Math.min(thumbValue + step, max) : Math.max(thumbValue - step, min);
}

export type SliderThumbOptions = {
    'aria-describedby'?: string | undefined;
    'aria-label'?: string | undefined;
    'aria-labelledby'?: string | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    getAriaLabel?: ((index: number) => string) | null | undefined;
    getAriaValueText?: ((formattedValue: string, value: number, index: number) => string) | null | undefined;
    /**
     * Explicit index (for SSR of range sliders).
     */
    index?: number | undefined;
    tabIndex?: number | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * Generated id of the thumb.
     */
    id: string;
    /**
     * Generated id of the input of a range thumb.
     */
    defaultInputId: string;
    /**
     * Generated labelable id of the input of a single thumb.
     */
    labelableInputId: string;
};

/**
 * One slider thumb with its hidden range input.
 */
export class SliderThumbMachine {
    readonly listItem: ListRegistryItem<SliderThumbMetadata>;

    readonly store = new Store<{ compositeIndex: number; positionPercent: number | undefined }>({
        compositeIndex: -1,
        positionPercent: undefined
    });

    private options: SliderThumbOptions;

    private readonly slider: SliderMachine;

    private thumbElement: HTMLElement | null = null;

    private inputElement: HTMLInputElement | null = null;

    constructor(slider: SliderMachine, options: SliderThumbOptions) {
        this.slider = slider;
        this.options = options;
        this.listItem = new ListRegistryItem(slider.thumbRegistry, {
            metadata: { inputId: this.inputId },
            onIndexChange: (index) => this.store.set('compositeIndex', index)
        });
    }

    setOptions(options: SliderThumbOptions) {
        this.options = options;
        this.listItem.setMetadata({ inputId: this.inputId });
        this.syncInsetPosition();
    }

    get inputId() {
        return this.slider.range ? this.options.defaultInputId : this.options.labelableInputId;
    }

    get index() {
        return this.slider.range ? (this.options.index ?? this.store.state.compositeIndex) : 0;
    }

    get disabled() {
        return (this.options.disabled ?? false) || this.slider.disabled;
    }

    private get thumbValue() {
        return this.slider.values[this.index];
    }

    private get thumbValuePercent() {
        return valueToPercent(this.thumbValue ?? 0, this.slider.min, this.slider.max);
    }

    setThumbElement = (element: HTMLElement | null) => {
        this.thumbElement = element;
        this.listItem.setElement(element);
        if (this.slider.inset) {
            queueMicrotask(() => this.syncInsetPosition());
        }
    };

    setInputElement = (element: HTMLInputElement | null) => {
        this.inputElement = element;
        this.slider.field.inputRef.current = element;
    };

    /**
     * Measures the thumb position for inset (edge-aligned) sliders. Call when the value changes.
     */
    syncInsetPosition() {
        if (!this.slider.inset) {
            return;
        }

        const control = this.slider.controlRef.current;
        const thumb = this.thumbElement;
        if (!control || !thumb) {
            return;
        }

        const vertical = this.slider.orientation === 'vertical';
        const thumbRect = thumb.getBoundingClientRect();
        const controlRect = control.getBoundingClientRect();
        const side = vertical ? 'height' : 'width';

        // the total travel distance adjusted to account for the thumb size
        const controlSize = controlRect[side] - thumbRect[side];
        // px distance from the starting edge (inline-start or bottom) to the thumb center
        const thumbOffsetFromControlEdge = thumbRect[side] / 2 + (controlSize * this.thumbValuePercent) / 100;

        const nextPositionPercent = (thumbOffsetFromControlEdge / controlRect[side]) * 100;

        this.store.set('positionPercent', nextPositionPercent);

        const index = this.index;
        const last = index === this.slider.values.length - 1;

        if (index === 0) {
            this.slider.setIndicatorPosition((prevPosition) => [nextPositionPercent, prevPosition[1]]);
        } else if (last) {
            this.slider.setIndicatorPosition((prevPosition) => [prevPosition[0], nextPositionPercent]);
        }
    }

    getThumbStyle(mounted: boolean): Style {
        const slider = this.slider;
        const vertical = slider.orientation === 'vertical';
        const rtl = slider.direction === 'rtl';
        const range = slider.range;
        const index = this.index;
        const { active, lastUsedThumbIndex } = slider.store.state;
        const safeLastUsedThumbIndex = lastUsedThumbIndex >= 0 && lastUsedThumbIndex < slider.values.length ? lastUsedThumbIndex : -1;
        const startEdge = vertical ? 'bottom' : 'insetInlineStart';
        const crossOffsetProperty = vertical ? 'left' : 'top';

        let zIndex: number | undefined;
        if (range) {
            if (active === index) {
                zIndex = 2;
            } else if (safeLastUsedThumbIndex === index) {
                zIndex = 1;
            }
        } else if (active === index) {
            zIndex = 1;
        }

        const translate = `${(vertical || !rtl ? -1 : 1) * 50}% ${(vertical ? 1 : -1) * 50}%`;

        if (!slider.inset) {
            const thumbValuePercent = this.thumbValuePercent;
            if (!Number.isFinite(thumbValuePercent)) {
                return visuallyHidden;
            }

            return { position: 'absolute', [startEdge]: `${thumbValuePercent}%`, [crossOffsetProperty]: '50%', translate, zIndex };
        }

        const positionPercent = this.store.state.positionPercent;

        return {
            '--position': `${positionPercent}%`,
            visibility: (slider.renderBeforeHydration && !mounted) || positionPercent === undefined ? 'hidden' : undefined,
            position: 'absolute',
            [startEdge]: 'var(--position)',
            [crossOffsetProperty]: '50%',
            translate,
            zIndex
        };
    }

    getProps(elementProps: Props = {}, mounted = true): Props {
        const slider = this.slider;
        const index = this.index;
        return mergeProps(
            {
                'data-index': index,
                id: this.options.id,
                onPointerDown: (event: PointerEvent) => {
                    slider.pressedThumbIndexRef.current = index;

                    if (this.thumbElement != null) {
                        const axis = slider.orientation === 'horizontal' ? 'x' : 'y';
                        const midpoint = getMidpoint(this.thumbElement);
                        slider.pressedThumbCenterOffsetRef.current =
                            (slider.orientation === 'horizontal' ? event.clientX : event.clientY) - midpoint[axis];
                    }

                    if (this.inputElement != null && slider.pressedInputRef.current !== this.inputElement) {
                        slider.pressedInputRef.current = this.inputElement;
                    }
                },
                style: this.getThumbStyle(mounted),
                suppressHydrationWarning: slider.renderBeforeHydration || undefined,
                tabIndex: -1
            },
            elementProps
        );
    }

    getInputProps(): Props {
        const slider = this.slider;
        const field = slider.field;
        const index = this.index;
        const thumbValue = this.thumbValue;
        const values = slider.values;
        const { getAriaLabel, getAriaValueText, tabIndex } = this.options;
        const rtl = slider.direction === 'rtl';
        const writingMode = slider.orientation === 'vertical' ? (rtl ? 'vertical-rl' : 'vertical-lr') : undefined;

        return mergeProps(
            {
                'aria-label': typeof getAriaLabel === 'function' ? getAriaLabel(index) : this.options['aria-label'],
                'aria-labelledby': this.options['aria-labelledby'] ?? slider.labelId,
                'aria-describedby': this.options['aria-describedby'],
                'aria-orientation': slider.orientation,
                'aria-valuenow': thumbValue,
                'aria-valuetext':
                    typeof getAriaValueText === 'function'
                        ? getAriaValueText(formatNumber(thumbValue, slider.locale, slider.formatOptions), thumbValue ?? 0, index)
                        : getDefaultAriaValueText(values, index, slider.formatOptions, slider.locale),
                disabled: this.disabled,
                id: this.inputId,
                max: slider.max,
                min: slider.min,
                name: slider.name,
                onChange: (event: Event) => {
                    slider.handleInputChange((event.target as HTMLInputElement).valueAsNumber, index, event);
                },
                onFocus: () => {
                    slider.setActive(index);
                    field.setFocused(true);
                },
                onBlur: () => {
                    if (!this.thumbElement) {
                        return;
                    }

                    slider.setActive(-1);
                    field.setTouched(true);
                    field.setFocused(false);

                    if (field.validationMode === 'onBlur') {
                        field.commit(getSliderValue(thumbValue ?? 0, index, slider.min, slider.max, slider.range, values));
                    }
                },
                onKeyDown: (event: KeyboardEvent) => this.onKeyDown(event),
                step: slider.step,
                // So that VoiceOver's focus indicator matches the thumb's dimensions
                style: { ...visuallyHidden, width: '100%', height: '100%', writingMode },
                tabIndex: tabIndex ?? undefined,
                type: 'range',
                value: thumbValue ?? ''
            },
            field.getInputValidationProps
        );
    }

    private onKeyDown(event: KeyboardEvent) {
        if (!ALL_KEYS.has(event.key)) {
            return;
        }

        if (COMPOSITE_KEYS.has(event.key)) {
            event.stopPropagation();
        }

        const slider = this.slider;
        const { min, max, step, largeStep, minStepsBetweenValues, range, values } = {
            min: slider.min,
            max: slider.max,
            step: slider.step,
            largeStep: slider.largeStep,
            minStepsBetweenValues: slider.minStepsBetweenValues,
            range: slider.range,
            values: slider.values
        };
        const index = this.index;
        const rtl = slider.direction === 'rtl';
        const thumbStep = event.shiftKey ? largeStep : step;
        const roundedValue = roundValueToStep(this.thumbValue ?? 0, step, min);

        let newValue: number | null = null;

        switch (event.key) {
            case ARROW_UP:
                newValue = getNewValue(roundedValue, thumbStep, 1, min, max);
                break;
            case ARROW_RIGHT:
                newValue = getNewValue(roundedValue, thumbStep, rtl ? -1 : 1, min, max);
                break;
            case ARROW_DOWN:
                newValue = getNewValue(roundedValue, thumbStep, -1, min, max);
                break;
            case ARROW_LEFT:
                newValue = getNewValue(roundedValue, thumbStep, rtl ? 1 : -1, min, max);
                break;
            case PAGE_UP:
                newValue = getNewValue(roundedValue, largeStep, 1, min, max);
                break;
            case PAGE_DOWN:
                newValue = getNewValue(roundedValue, largeStep, -1, min, max);
                break;
            case END:
                newValue = max;
                if (range) {
                    newValue = Number.isFinite(values[index + 1]) ? (values[index + 1] ?? 0) - step * minStepsBetweenValues : max;
                }
                break;
            case HOME:
                newValue = min;
                if (range) {
                    newValue = Number.isFinite(values[index - 1]) ? (values[index - 1] ?? 0) + step * minStepsBetweenValues : min;
                }
                break;
            default:
                break;
        }

        if (newValue !== null) {
            slider.handleInputChange(newValue, index, event);
            event.preventDefault();
        }
    }

    destroy() {
        this.listItem.destroy();
    }
}
