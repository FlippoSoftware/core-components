// biome-ignore-all lint/suspicious/noExplicitAny: selector maps are heterogeneous by design.
import { Store } from './Store';

/**
 * A selector registered in a {@link ComponentStore}: takes the state and up to three arguments.
 */
export type SelectorFunction<State> = (state: State, ...args: any[]) => any;

type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

export type SelectorArgs<S> = S extends (...params: infer Params) => unknown ? Tail<Params> : never;

/**
 * Typed `select(key, ...args)` method for a selector map.
 */
export type SelectMethod<Selectors extends Record<PropertyKey, SelectorFunction<any>>> = <Key extends keyof Selectors>(
    key: Key,
    ...args: SelectorArgs<Selectors[Key]>
) => ReturnType<Selectors[Key]>;

export type ObserveSelector<State> = (state: State) => unknown;

type MaybeCallable = (...args: any[]) => any;

/**
 * Keys of the context whose values are functions (callbacks that adapters keep up to date).
 */
export type ContextFunctionKeys<Context> = {
    [Key in keyof Context]-?: Extract<Context[Key], MaybeCallable> extends never ? never : Key;
}[keyof Context];

/**
 * Keys of the state that accept `undefined`.
 */
export type KeysAllowingUndefined<State> = {
    [Key in keyof State]-?: undefined extends State[Key] ? Key : never;
}[keyof State];

/**
 * A framework-agnostic store for component state machines.
 *
 * On top of {@link Store} it provides:
 * - a non-reactive `context` (callbacks, element refs, timers, registries),
 * - named selectors (`select`, `getSelector`) that adapters subscribe to,
 * - synchronisation of controlled values coming from the outside (`syncControlledValue`),
 * - `observe`, to react to changes of a derived value.
 *
 * Framework adapters extend it with their own subscription primitives
 * (e.g. the React `ReactStore` adds `useState`, `useControlledProp`, `useContextCallback`).
 */
export class ComponentStore<
    State extends object,
    Context = Record<string, never>,
    Selectors extends Record<string, SelectorFunction<State>> = Record<string, never>
> extends Store<State> {
    /**
     * Non-reactive values such as element refs, callbacks, timers, etc.
     */
    public readonly context: Context;

    /**
     * Keeps track of which keys received a controlled value. Used to warn about
     * switching between controlled and uncontrolled modes.
     */
    private readonly controlledValues = new Map<keyof State, boolean>();

    private readonly selectors: Selectors | undefined;

    /**
     * @param state Initial state of the store.
     * @param context Non-reactive context values.
     * @param selectors Optional named selectors.
     */
    constructor(state: State, context: Context = {} as Context, selectors?: Selectors) {
        super(state);
        this.context = context;
        this.selectors = selectors;
    }

    /**
     * Returns the selector registered under `key`.
     * Adapters use it to subscribe to the derived value.
     */
    public getSelector<Key extends keyof Selectors>(key: Key): Selectors[Key] {
        const selector = this.selectors?.[key];
        if (!selector) {
            throw new Error(`Flippo UI: selector "${String(key)}" is not registered in the store.`);
        }
        return selector;
    }

    /**
     * Gets the current value from the store using a selector with the provided key.
     *
     * @param key Key of the selector to use.
     */
    public select = ((key: keyof Selectors, a1?: unknown, a2?: unknown, a3?: unknown) => {
        return this.getSelector(key)(this.state, a1, a2, a3);
    }) as SelectMethod<Selectors>;

    /**
     * Synchronizes a single external value into the store.
     */
    public syncValue<Key extends keyof State>(key: Key, value: State[Key]) {
        if (this.state[key] !== value) {
            this.set(key, value);
        }
    }

    /**
     * Synchronizes a single external value into the store and returns a cleanup that
     * resets it to `undefined` (e.g. when the part that owns the value unmounts).
     */
    public syncValueWithCleanup<Key extends KeysAllowingUndefined<State>>(key: Key, value: State[Key]) {
        this.syncValue(key, value);
        return () => {
            this.set(key, undefined as State[Key]);
        };
    }

    /**
     * Synchronizes multiple external values into the store.
     */
    public syncValues(values: Partial<State>) {
        this.update(values);
    }

    /**
     * Synchronizes a controllable value (e.g. the `open` prop) into the store.
     * - If `controlled` is not `undefined`, the store's state at `key` is updated to match it.
     * - If `controlled` is `undefined`, the key is uncontrolled and the store keeps its own value.
     *
     * Local writes to a controlled key are not blocked: the owner is expected to call this method
     * again with the next controlled value (this matches the current React behaviour).
     */
    public syncControlledValue<Key extends keyof State>(key: Key, controlled: State[Key] | undefined) {
        const isControlled = controlled !== undefined;

        if (process.env.NODE_ENV !== 'production') {
            const previouslyControlled = this.controlledValues.get(key);
            if (previouslyControlled !== undefined && previouslyControlled !== isControlled) {
                // biome-ignore lint/suspicious/noConsole: development-only warning.
                console.error(
                    `A component is changing the ${isControlled ? '' : 'un'}controlled state of ${String(key)} to be ${
                        isControlled ? 'un' : ''
                    }controlled. Elements should not switch from uncontrolled to controlled (or vice versa).`
                );
            }
            this.controlledValues.set(key, isControlled);
        }

        if (isControlled && !Object.is(this.state[key], controlled)) {
            this.setState({ ...this.state, [key]: controlled });
        }
    }

    /**
     * Whether a controlled value was last synchronized for `key`.
     * Only tracked in development builds.
     */
    public isControlled(key: keyof State): boolean {
        return this.controlledValues.get(key) === true;
    }

    /**
     * Assigns a value (usually a callback) to the non-reactive context.
     */
    public setContextValue<Key extends keyof Context>(key: Key, value: Context[Key]) {
        (this.context as Context)[key] = value;
    }

    /**
     * Returns a setter for a specific key of the state.
     * Handy for passing element setters to adapters (e.g. as ref callbacks).
     */
    public createSetter<Key extends keyof State>(key: Key): (value: State[Key]) => void {
        return (value) => {
            this.set(key, value);
        };
    }

    /**
     * Observes changes of a value derived from the store and calls the listener when it changes.
     * The listener is called immediately with the current value.
     *
     * @param selector Key of a registered selector or a selector function.
     * @param listener Listener called with the new and the previous value.
     * @returns A function to stop observing.
     */
    public observe<Key extends keyof Selectors>(
        selector: Key,
        listener: (newValue: ReturnType<Selectors[Key]>, oldValue: ReturnType<Selectors[Key]>, store: this) => void
    ): () => void;

    public observe<S extends ObserveSelector<State>>(
        selector: S,
        listener: (newValue: ReturnType<S>, oldValue: ReturnType<S>, store: this) => void
    ): () => void;

    public observe(selector: keyof Selectors | ObserveSelector<State>, listener: (newValue: any, oldValue: any, store: this) => void) {
        const selectFn: ObserveSelector<State> =
            typeof selector === 'function' ? selector : (this.getSelector(selector) as ObserveSelector<State>);

        let prevValue = selectFn(this.state);

        listener(prevValue, prevValue, this);

        return this.subscribe((nextState) => {
            const nextValue = selectFn(nextState);
            if (!Object.is(prevValue, nextValue)) {
                const oldValue = prevValue;
                prevValue = nextValue;
                listener(nextValue, oldValue, this);
            }
        });
    }
}
