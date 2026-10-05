import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { formatNumber } from '~@lib/formatNumber';
import { Store } from '~@store/Store';

import type { Style } from '~@lib/types';

import { getIndicatorStyle } from '../indicator/getIndicatorStyle';

import { progressStateAttributesMapping } from './progressStateAttributesMapping';

export type ProgressStatus = 'indeterminate' | 'progressing' | 'complete';

export type ProgressState = {
    status: ProgressStatus;
};

export type ProgressOptions = {
    format?: Intl.NumberFormatOptions | undefined;
    getAriaValueText?: ((formattedValue: string | null, value: number | null) => string) | undefined;
    locale?: Intl.LocalesArgument | undefined;
    /**
     * @default 100
     */
    max?: number | undefined;
    /**
     * @default 0
     */
    min?: number | undefined;
    /**
     * `null` means indeterminate.
     */
    value: number | null;
};

function formatValue(value: number | null, locale?: Intl.LocalesArgument, format?: Intl.NumberFormatOptions): string {
    if (value == null) {
        return '';
    }

    if (!format) {
        return formatNumber(value / 100, locale, { style: 'percent' });
    }

    return formatNumber(value, locale, format);
}

function getDefaultAriaValueText(formattedValue: string | null, value: number | null) {
    if (value == null) {
        return 'indeterminate progress';
    }

    return formattedValue || `${value}%`;
}

/**
 * State of a progress bar (status, formatted value, ARIA).
 */
export class ProgressMachine {
    readonly store = new Store<{ labelId: string | undefined }>({ labelId: undefined });

    private options: ProgressOptions;

    constructor(options: ProgressOptions) {
        this.options = options;
    }

    setOptions(options: ProgressOptions) {
        this.options = options;
    }

    get min() {
        return this.options.min ?? 0;
    }

    get max() {
        return this.options.max ?? 100;
    }

    get value() {
        return this.options.value;
    }

    get formattedValue() {
        return formatValue(this.options.value, this.options.locale, this.options.format);
    }

    getState(): ProgressState {
        const { value } = this.options;
        let status: ProgressStatus = 'indeterminate';
        if (Number.isFinite(value)) {
            status = value === this.max ? 'complete' : 'progressing';
        }
        return { status };
    }

    static attrs(state: ProgressState): Record<string, string> {
        return getStyleHookProps(state, progressStateAttributesMapping);
    }

    setLabelId = (labelId: string | undefined) => {
        this.store.set('labelId', labelId);
    };

    getRootProps() {
        const { value, getAriaValueText = getDefaultAriaValueText } = this.options;
        return {
            'aria-labelledby': this.store.state.labelId,
            'aria-valuemax': this.max,
            'aria-valuemin': this.min,
            'aria-valuenow': value ?? undefined,
            'aria-valuetext': getAriaValueText(this.formattedValue, value),
            role: 'progressbar'
        };
    }

    getIndicatorStyle(): Style {
        return getIndicatorStyle(this.options.value, this.min, this.max);
    }

    /**
     * Arguments of the `<Progress.Value>` render function and the text it shows by default.
     */
    getValueText() {
        const { value } = this.options;
        return {
            formattedValue: value == null ? 'indeterminate' : this.formattedValue,
            display: value == null ? null : this.formattedValue,
            value
        };
    }
}
