// biome-ignore-all lint/suspicious/noExplicitAny: selector inference relies on `any` in generic constraints.

/**
 * A function that derives a value from the state and up to three extra arguments.
 */
export type Selector<State = any, Result = unknown, Params extends readonly any[] = any[]> = (state: State, ...params: Params) => Result;

type AnySelector = (...args: any[]) => any;

type StateFromSelectorList<Selectors extends readonly any[]> = Selectors extends [f: infer F, ...other: infer R]
    ? StateFromSelector<F> extends StateFromSelectorList<R>
        ? StateFromSelector<F>
        : StateFromSelectorList<R>
    : object;

type StateFromSelector<T> = T extends (first: infer F, ...args: any[]) => any ? F : never;

type DropFirst<T> = T extends [any, ...infer Xs] ? Xs : [];

type ReturnTypes<FunctionsArray extends readonly AnySelector[]> = {
    [Index in keyof FunctionsArray]: FunctionsArray[Index] extends FunctionsArray[number] ? ReturnType<FunctionsArray[Index]> : never;
};

type MergeParams<STypes extends readonly unknown[], CTypes extends readonly unknown[]> = STypes['length'] extends 0
    ? CTypes
    : MergeParams<DropFirst<STypes>, DropFirst<CTypes>>;

export type CreateSelectorFunction = <
    const Args extends any[],
    const Selectors extends readonly Selector<any>[],
    const Combiner extends (...args: readonly [...ReturnTypes<Selectors>, ...Args]) => any
>(
    ...items: [...Selectors, Combiner]
) => (
    ...args: Selectors['length'] extends 0
        ? MergeParams<ReturnTypes<Selectors>, Parameters<Combiner>>
        : [StateFromSelectorList<Selectors>, ...MergeParams<ReturnTypes<Selectors>, Parameters<Combiner>>]
) => ReturnType<Combiner>;

/**
 * Creates a selector function that can be used to derive values from the store's state.
 * The selector can take up to three additional arguments that can be used in the selector logic.
 * This function accepts up to six functions and combines them into a single selector function.
 * The last parameter is the combiner function that combines the results of the previous selectors.
 *
 * @example
 * const selector = createSelector(
 *  (state) => state.disabled
 * );
 *
 * @example
 * const selector = createSelector(
 *   (state) => state.disabled,
 *   (state) => state.open,
 *   (disabled, open) => ({ disabled, open })
 * );
 */
export const createSelector = ((...selectors: AnySelector[]) => {
    const [a, b, c, d, e, f, ...other] = selectors;

    if (other.length > 0) {
        throw new Error('Unsupported number of selectors');
    }

    if (a && b && c && d && e && f) {
        return (state: unknown, a1: unknown, a2: unknown, a3: unknown) =>
            f(a(state, a1, a2, a3), b(state, a1, a2, a3), c(state, a1, a2, a3), d(state, a1, a2, a3), e(state, a1, a2, a3), a1, a2, a3);
    }

    if (a && b && c && d && e) {
        return (state: unknown, a1: unknown, a2: unknown, a3: unknown) =>
            e(a(state, a1, a2, a3), b(state, a1, a2, a3), c(state, a1, a2, a3), d(state, a1, a2, a3), a1, a2, a3);
    }

    if (a && b && c && d) {
        return (state: unknown, a1: unknown, a2: unknown, a3: unknown) =>
            d(a(state, a1, a2, a3), b(state, a1, a2, a3), c(state, a1, a2, a3), a1, a2, a3);
    }

    if (a && b && c) {
        return (state: unknown, a1: unknown, a2: unknown, a3: unknown) => c(a(state, a1, a2, a3), b(state, a1, a2, a3), a1, a2, a3);
    }

    if (a && b) {
        return (state: unknown, a1: unknown, a2: unknown, a3: unknown) => b(a(state, a1, a2, a3), a1, a2, a3);
    }

    if (a) {
        return a;
    }

    throw new Error('Missing arguments');
}) as unknown as CreateSelectorFunction;

type CacheKey = { id: number };

type MemoizedCombiner = {
    hasResult: boolean;
    inputs: unknown[];
    result: unknown;
};

const CACHE_KEY = '__cacheKey__';

/**
 * Like {@link createSelector}, but memoizes the combiner result: it is recomputed only when one of the
 * input selector results or extra arguments changes (compared with `Object.is`).
 *
 * The cache is kept per store: the state object carries a `__cacheKey__` that survives state updates
 * (they copy the state with a spread), so selectors shared between several stores don't evict each other.
 */
export const createSelectorMemoized: CreateSelectorFunction = ((...selectors: AnySelector[]) => {
    const combiner = selectors.at(-1) as AnySelector;
    const inputSelectors = selectors.slice(0, -1);
    const nSelectors = inputSelectors.length || 1;
    // (s1, s2, ..., sN, a1, a2, a3) => { ... }
    const argsLength = combiner.length - nSelectors;

    if (argsLength > 3) {
        throw new Error('Unsupported number of arguments');
    }

    const cache = new WeakMap<CacheKey, MemoizedCombiner>();
    let nextCacheId = 1;

    return (state: Record<string, unknown>, a1: unknown, a2: unknown, a3: unknown) => {
        let cacheKey = state[CACHE_KEY] as CacheKey | undefined;
        if (!cacheKey) {
            cacheKey = { id: nextCacheId };
            state[CACHE_KEY] = cacheKey;
            nextCacheId += 1;
        }

        let memo = cache.get(cacheKey);
        if (!memo) {
            memo = { hasResult: false, inputs: [], result: undefined };
            cache.set(cacheKey, memo);
        }

        const extraArgs = [a1, a2, a3].slice(0, Math.max(argsLength, 0));
        const inputs =
            inputSelectors.length === 0
                ? [state, ...extraArgs]
                : [...inputSelectors.map((selector) => selector(state, a1, a2, a3)), ...extraArgs];

        if (
            memo.hasResult &&
            inputs.length === memo.inputs.length &&
            inputs.every((input, index) => Object.is(input, memo.inputs[index]))
        ) {
            return memo.result;
        }

        memo.result = combiner(...inputs);
        memo.inputs = inputs;
        memo.hasResult = true;
        return memo.result;
    };
}) as unknown as CreateSelectorFunction;
