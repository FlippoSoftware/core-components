import { clamp } from '~@lib/clamp';
import { valueToPercent } from '~@lib/valueToPercent';

export type ThumbCollisionBehavior = 'push' | 'swap' | 'none';

export function asc(a: number, b: number) {
    return a - b;
}

export function replaceArrayItemAtIndex(array: readonly number[], index: number, newValue: number) {
    const output = array.slice();
    output[index] = newValue;
    return output.sort(asc);
}

export function getMidpoint(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
        x: (rect.left + rect.right) / 2,
        y: (rect.top + rect.bottom) / 2
    };
}

type GetPushedThumbValuesParams = {
    values: readonly number[];
    index: number;
    nextValue: number;
    min: number;
    max: number;
    step: number;
    minStepsBetweenValues: number;
    initialValues?: readonly number[];
};

/**
 * Returns a new array of slider values where attempting to move the thumb at `index`
 * beyond its neighbours "pushes" them while respecting `minStepsBetweenValues`.
 */
export function getPushedThumbValues({
    values,
    index,
    nextValue,
    min,
    max,
    step,
    minStepsBetweenValues,
    initialValues
}: GetPushedThumbValuesParams): number[] {
    if (values.length === 0) {
        return [];
    }

    const nextValues = values.slice();
    const minValueDifference = step * minStepsBetweenValues;
    const lastIndex = nextValues.length - 1;
    const baseInitialValues = initialValues ?? values;

    const indexMin = min + index * minValueDifference;
    const indexMax = max - (lastIndex - index) * minValueDifference;
    nextValues[index] = clamp(nextValue, indexMin, indexMax);

    for (let i = index + 1; i <= lastIndex; i += 1) {
        const minAllowed = (nextValues[i - 1] ?? 0) + minValueDifference;
        const maxAllowed = max - (lastIndex - i) * minValueDifference;
        const initialValue = baseInitialValues[i] ?? nextValues[i];
        let candidate = Math.max(nextValues[i] ?? 0, minAllowed);

        if (initialValue != null && initialValue < candidate) {
            candidate = Math.max(initialValue, minAllowed);
        }

        nextValues[i] = clamp(candidate, minAllowed, maxAllowed);
    }

    for (let i = index - 1; i >= 0; i -= 1) {
        const maxAllowed = (nextValues[i + 1] ?? 0) - minValueDifference;
        const minAllowed = min + i * minValueDifference;
        const initialValue = baseInitialValues[i] ?? nextValues[i];
        let candidate = Math.min(nextValues[i] ?? 0, maxAllowed);

        if (initialValue != null && initialValue > candidate) {
            candidate = Math.min(initialValue, maxAllowed);
        }

        nextValues[i] = clamp(candidate, minAllowed, maxAllowed);
    }

    for (let i = 0; i <= lastIndex; i += 1) {
        nextValues[i] = Number((nextValues[i] ?? 0).toFixed(12));
    }

    return nextValues;
}

export function getSliderValue(valueInput: number, index: number, min: number, max: number, range: boolean, values: readonly number[]) {
    let newValue: number | number[] = valueInput;

    newValue = clamp(newValue, min, max);

    if (range) {
        newValue = replaceArrayItemAtIndex(
            values,
            index,
            // Bound the new value to the thumb's neighbours.
            clamp(newValue, values[index - 1] || Number.NEGATIVE_INFINITY, values[index + 1] || Number.POSITIVE_INFINITY)
        );
    }

    return newValue;
}

export type ResolveThumbCollisionParams = {
    behavior: ThumbCollisionBehavior;
    values: readonly number[];
    currentValues?: readonly number[] | null;
    initialValues?: readonly number[] | null;
    pressedIndex: number;
    nextValue: number;
    min: number;
    max: number;
    step: number;
    minStepsBetweenValues: number;
};

export type ResolveThumbCollisionResult = {
    value: number | number[];
    thumbIndex: number;
    didSwap: boolean;
};

export function resolveThumbCollision({
    behavior,
    values,
    currentValues,
    initialValues,
    pressedIndex,
    nextValue,
    min,
    max,
    step,
    minStepsBetweenValues
}: ResolveThumbCollisionParams): ResolveThumbCollisionResult {
    const activeValues = currentValues ?? values;
    const baselineValues = initialValues ?? values;
    const range = activeValues.length > 1;

    if (!range) {
        return {
            value: nextValue,
            thumbIndex: 0,
            didSwap: false
        };
    }

    const minValueDifference = step * minStepsBetweenValues;

    switch (behavior) {
        case 'swap': {
            const pressedInitialValue = activeValues[pressedIndex];
            const epsilon = 1e-7;
            const candidateValues = activeValues.slice();
            const previousNeighbor = candidateValues[pressedIndex - 1];
            const nextNeighbor = candidateValues[pressedIndex + 1];

            const lowerBound = previousNeighbor != null ? previousNeighbor + minValueDifference : min;
            const upperBound = nextNeighbor != null ? nextNeighbor - minValueDifference : max;

            const constrainedValue = clamp(nextValue, lowerBound, upperBound);
            const pressedValueAfterClamp = Number(constrainedValue.toFixed(12));
            candidateValues[pressedIndex] = pressedValueAfterClamp;

            const movingForward = nextValue > (pressedInitialValue ?? 0);
            const movingBackward = nextValue < (pressedInitialValue ?? 0);

            const shouldSwapForward = movingForward && nextNeighbor != null && nextValue >= nextNeighbor - epsilon;
            const shouldSwapBackward = movingBackward && previousNeighbor != null && nextValue <= previousNeighbor + epsilon;

            if (!shouldSwapForward && !shouldSwapBackward) {
                return {
                    value: candidateValues,
                    thumbIndex: pressedIndex,
                    didSwap: false
                };
            }

            const targetIndex = shouldSwapForward ? pressedIndex + 1 : pressedIndex - 1;

            const initialValuesForPush = candidateValues.map((_, index) => {
                if (index === pressedIndex) {
                    return pressedValueAfterClamp;
                }

                const baseline = baselineValues[index];
                if (baseline != null) {
                    return baseline;
                }

                return activeValues[index];
            });

            let nextValueForTarget = nextValue;
            if (shouldSwapForward) {
                nextValueForTarget = Math.max(nextValue, candidateValues[targetIndex] ?? 0);
            } else {
                nextValueForTarget = Math.min(nextValue, candidateValues[targetIndex] ?? 0);
            }

            const adjustedValues = getPushedThumbValues({
                values: candidateValues,
                index: targetIndex,
                nextValue: nextValueForTarget,
                min,
                max,
                step,
                minStepsBetweenValues,
                initialValues: initialValuesForPush as unknown as readonly number[]
            });

            const neighborIndex = shouldSwapForward ? targetIndex - 1 : targetIndex + 1;

            if (neighborIndex >= 0 && neighborIndex < adjustedValues.length) {
                const previousValue = adjustedValues[neighborIndex - 1];
                const nextValueAfter = adjustedValues[neighborIndex + 1];

                let neighborLowerBound = previousValue != null ? previousValue + minValueDifference : min;
                neighborLowerBound = Math.max(neighborLowerBound, min + neighborIndex * minValueDifference);

                let neighborUpperBound = nextValueAfter != null ? nextValueAfter - minValueDifference : max;
                neighborUpperBound = Math.min(neighborUpperBound, max - (adjustedValues.length - 1 - neighborIndex) * minValueDifference);

                const restoredValue = clamp(pressedValueAfterClamp, neighborLowerBound, neighborUpperBound);
                adjustedValues[neighborIndex] = Number(restoredValue.toFixed(12));
            }

            return {
                value: adjustedValues,
                thumbIndex: targetIndex,
                didSwap: true
            };
        }
        case 'push': {
            const nextValues = getPushedThumbValues({
                values: activeValues,
                index: pressedIndex,
                nextValue,
                min,
                max,
                step,
                minStepsBetweenValues
            });

            return {
                value: nextValues,
                thumbIndex: pressedIndex,
                didSwap: false
            };
        }
        case 'none':
        default: {
            const candidateValues = activeValues.slice();
            const previousNeighbor = candidateValues[pressedIndex - 1];
            const nextNeighbor = candidateValues[pressedIndex + 1];

            const lowerBound = previousNeighbor != null ? previousNeighbor + minValueDifference : min;
            const upperBound = nextNeighbor != null ? nextNeighbor - minValueDifference : max;

            const constrainedValue = clamp(nextValue, lowerBound, upperBound);
            candidateValues[pressedIndex] = Number(constrainedValue.toFixed(12));

            return {
                value: candidateValues,
                thumbIndex: pressedIndex,
                didSwap: false
            };
        }
    }
}

function getDecimalPrecision(num: number) {
    // This handles the case when num is very small (0.00000001), js will turn this into 1e-8.
    // When num is bigger than 1 or less than -1 it won't get converted to this notation so it's fine.
    if (Math.abs(num) < 1) {
        const parts = num.toExponential().split('e-');
        const matissaDecimalPart = parts[0]?.split('.')[1];

        return (matissaDecimalPart ? matissaDecimalPart.length : 0) + Number.parseInt(parts[1] ?? '', 10);
    }

    const decimalPart = num.toString().split('.')[1];
    return decimalPart ? decimalPart.length : 0;
}

export function roundValueToStep(value: number, step: number, min: number) {
    const nearest = Math.round((value - min) / step) * step + min;
    return Number(nearest.toFixed(getDecimalPrecision(step)));
}

export function validateMinimumDistance(values: number | readonly number[], step: number, minStepsBetweenValues: number) {
    if (!Array.isArray(values)) {
        return true;
    }

    const distances = values.reduce((acc: number[], val, index, vals) => {
        if (index === vals.length - 1) {
            return acc;
        }

        acc.push(Math.abs(val - (vals[index + 1] ?? 0)));

        return acc;
    }, []);

    return Math.min(...distances) >= step * minStepsBetweenValues;
}

export function valueArrayToPercentages(values: number[], min: number, max: number) {
    const output = [];

    for (const value of values) {
        output.push(clamp(valueToPercent(value, min, max), 0, 100));
    }

    return output;
}
