import { getIndicatorStyle } from '~@components/progress/indicator/getIndicatorStyle';
import { formatNumber } from '~@lib/formatNumber';
import { Store } from '~@store/Store';

import type { Style } from '~@lib/types';

export type MeterOptions = {
    format?: Intl.NumberFormatOptions | undefined;
    getAriaValueText?: ((formattedValue: string, value: number) => string) | undefined;
    locale?: Intl.LocalesArgument | undefined;
    /**
     * @default 100
     */
    max?: number | undefined;
    /**
     * @default 0
     */
    min?: number | undefined;
    value: number;
};

function formatValue(value: number, locale?: Intl.LocalesArgument, format?: Intl.NumberFormatOptions): string {
    if (!format) {
        return formatNumber(value / 100, locale, { style: 'percent' });
    }

    return formatNumber(value, locale, format);
}

/**
 * State of a meter (formatted value, ARIA).
 */
export class MeterMachine {
    readonly store = new Store<{ labelId: string | undefined }>({ labelId: undefined });

    private options: MeterOptions;

    constructor(options: MeterOptions) {
        this.options = options;
    }

    setOptions(options: MeterOptions) {
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

    setLabelId = (labelId: string | undefined) => {
        this.store.set('labelId', labelId);
    };

    getRootProps() {
        const { value, getAriaValueText, format } = this.options;
        let ariaValuetext = `${value}%`;
        if (getAriaValueText) {
            ariaValuetext = getAriaValueText(this.formattedValue, value);
        } else if (format) {
            ariaValuetext = this.formattedValue;
        }

        return {
            'aria-labelledby': this.store.state.labelId,
            'aria-valuemax': this.max,
            'aria-valuemin': this.min,
            'aria-valuenow': value,
            'aria-valuetext': ariaValuetext,
            role: 'meter'
        };
    }

    /**
     * Text `<Meter.Value>` shows by default.
     */
    getValueText() {
        return (this.formattedValue || this.options.value) ?? '';
    }

    getIndicatorStyle(): Style {
        return getIndicatorStyle(this.options.value, this.min, this.max);
    }
}
