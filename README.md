# @flippo-ui/core

Framework-agnostic state machines for [`@flippo-ui/headless-components`](https://github.com/FlippoSoftware/headless-components).

The core holds component state, selectors and transitions without React. Framework packages are thin adapters:
they subscribe to stores, pass DOM elements in and render.

- No `react`, `react-dom` or `@floating-ui/react*` imports (enforced by Biome `noRestrictedImports` and `test/architecture.test.ts`).
- No `window`/`document` access at module level: the package imports in Node.js without a DOM.
- Every module has its own entry point; the package is `sideEffects: false`.

## Install

```sh
pnpm add @flippo-ui/core
```

## Source layout

```
src/
├── components/<component>/   # one folder per part (root/, trigger/, popup/, …), store/, utils/
│                             # data attributes, CSS variables and state attribute mappings in their own files
├── lib/                      # shared code: types and helpers + attributes/, dom/, events/, patterns/,
│                             # popup/, positioning/, props/, store/, timers/
└── packages/floating-ui/     # our fork of @floating-ui/react on top of @floating-ui/dom
```

Imports between these areas use path aliases (`tsconfig.json` `paths`, mirrored in `aliases.ts` for Vitest):
`~@lib/*`, `~@attributes/*`, `~@dom/*`, `~@events/*`, `~@patterns/*`, `~@popup/*`, `~@positioning/*`, `~@props/*`,
`~@store/*`, `~@timers/*`, `~@packages/*`, `~@components/*`. Files of the same component (or of the same `lib` folder)
import each other relatively.

## Entry points

`@flippo-ui/core` re-exports everything; every module and component also has its own entry point.

### Infrastructure

| Entry | Contents |
| --- | --- |
| `@flippo-ui/core/store` | `Store`, `ComponentStore`, `createSelector`, `createSelectorMemoized` |
| `@flippo-ui/core/events` | `REASONS`, `createChangeEventDetails`, `createGenericEventDetails`, `EventEmitter`, `createEventEmitter` |
| `@flippo-ui/core/timers` | `Timeout`, `AnimationFrame` |
| `@flippo-ui/core/dom` | `whenConnected`, `runOnceAnimationsFinish`, `OpenChangeComplete`, `TransitionStatusController`, `PopupAutoResize`, `acquireScrollLock`, `getInternalBackdropProps` |
| `@flippo-ui/core/props` | `mergeProps`, `mergePropsN`, `makeEventPreventable` |
| `@flippo-ui/core/attributes` | `getStyleHookProps`, popup/trigger/transition state attribute mappings |
| `@flippo-ui/core/patterns` | `OpenInteractionType`, `Clipboard` |
| `@flippo-ui/core/lib` | Shared types (`MutableRef`, `ElementProps`, `TransitionStatus`, …), constants, item equality, value labels |
| `@flippo-ui/core/floating` | `FloatingRootStore`, `FloatingTreeStore`, `FocusManager`, interactions (`ClickInteraction`, `DismissInteraction`, `FocusInteraction`, `Hover*Interaction`, `ListNavigationInteraction`, `TypeaheadInteraction`, `ClientPointInteraction`, `getRoleProps`), `safePolygon`, `FloatingDelayGroup`, `FloatingPortalController` |
| `@flippo-ui/core/positioning` | `AnchorPositioner` (on `@floating-ui/dom`) |
| `@flippo-ui/core/popup` | Popup state and selectors, `PopupRootController`, `PopupPositionerController`, `PopupViewportController`, `PopupTriggerRegistration`, `PopupTransitions` |

### Components

| Entry | Machines |
| --- | --- |
| `accordion`, `collapsible` | `AccordionMachine`, `AccordionItemMachine`, `CollapsibleMachine` |
| `autocomplete`, `combobox` | `AutocompleteRootMachine`, `ComboboxRootMachine`, `ComboboxInputMachine`, `ComboboxTriggerMachine`, `ComboboxItemMachine`, `ComboboxListMachine`, `ComboboxPositionerMachine`, `ComboboxPopupMachine`, `ComboboxClearMachine`, chips, `createComboboxFilter` |
| `avatar`, `button`, `separator` | `AvatarMachine`, `AvatarImageLoader`, `AvatarFallbackDelay`, `ButtonMachine`, `getSeparatorProps` |
| `checkbox`, `checkbox-card`, `checkbox-group`, `switch`, `radio`, `radio-card`, `radio-group` | form controls with field integration |
| `composite`, `list`, `toolbar`, `toggle`, `toggle-group`, `segmented-control`, `tabs` | `CompositeRootMachine`, `ListRegistry`, `ToolbarMachine`, `ToggleMachine`, `TabsMachine`, … |
| `context-menu`, `menu`, `menubar` | `MenuRootMachine`, `MenuTriggerMachine`, `MenuPositionerMachine`, `MenuPopupMachine`, menu items, `ContextMenuRootMachine`, `MenubarMachine` |
| `dialog`, `drawer` | `DialogRootMachine`, `DialogTriggerMachine`, `DialogPopupMachine`, `DrawerRootMachine`, `DrawerDragMachine`, `DrawerGesture` |
| `field`, `fieldset`, `form`, `labelable` | `FieldRootMachine`, `FieldControlMachine`, `FieldsetMachine`, `FormController`, `LabelableController` |
| `marquee`, `meter`, `progress`, `qr-code`, `scroll-area`, `snippet` | display components |
| `navigation-menu` | `NavigationMenuRootMachine`, `NavigationMenuTriggerMachine`, list, content, positioner, viewport |
| `number-field`, `pin-input`, `slider` | `NumberFieldMachine`, `PinInputMachine`, `SliderMachine`, `SliderThumbMachine` |
| `popover`, `tooltip` | `PopoverRootMachine`, `PopoverTriggerMachine`, `PopoverPositionerMachine`, `PopoverPopupMachine`, `TooltipRootMachine`, `TooltipTriggerMachine`, `TooltipProviderMachine`, `TooltipMultipleMachine` |
| `select` | `SelectRootMachine`, `SelectTriggerMachine`, `SelectPositionerMachine`, `SelectPopupMachine`, `SelectItemMachine`, `SelectScrollArrowMachine` |
| `toast` | `ToastProviderMachine`, `ToastManager`, `ToastViewportMachine`, `ToastRootMachine` |

Machines follow one shape: `new XMachine(options, setup)`, `setOptions(options)` on every render, `getState()`, a static
`attrs(state)` for data attributes, `getXProps(elementProps)` returning props to spread (compatible with `mergeProps`),
element setters for ref callbacks and `destroy()`.

## Usage without a framework

```ts
import { createChangeEventDetails, REASONS } from '@flippo-ui/core/events';
import { PopoverStore } from '@flippo-ui/core/popover';

const store = new PopoverStore();
store.setContextValue('onOpenChange', (open, details) => {
    if (details.reason === REASONS.outsidePress) {
        details.cancel();
    }
});

const unsubscribe = store.subscribe(() => {
    trigger.setAttribute('aria-expanded', String(store.select('open')));
});

store.setOpen(true, createChangeEventDetails(REASONS.triggerPress, event, trigger));
```

## Adapter contract

`ComponentStore` is the framework-free part of the former `ReactStore` from `@flippo-ui/hooks`. A React adapter extends it
with hooks and nothing else:

```ts
class ReactStore<State extends object, Context, Selectors> extends ComponentStore<State, Context, Selectors> {
    useState(key, a1, a2, a3) {
        return useStore(this, this.getSelector(key), a1, a2, a3); // useSyncExternalStore
    }

    useControlledProp(key, controlled) {
        useIsoLayoutEffect(() => this.syncControlledValue(key, controlled), [key, controlled]);
    }

    useContextCallback(key, fn) {
        this.setContextValue(key, useStableCallback(fn ?? NOOP));
    }

    useStateSetter(key) {
        return React.useCallback(this.createSetter(key), [key]);
    }
}
```

| Former React API | Core API |
| --- | --- |
| `store.useState(key, ...args)` | `store.select(key, ...args)` + subscription to `store.getSelector(key)` |
| `store.useControlledProp(key, value)` | `store.syncControlledValue(key, value)` in a layout effect |
| `store.useSyncedValue(s)` / `useSyncedValueWithCleanup` | `syncValue`, `syncValues`, `syncValueWithCleanup` |
| `store.useContextCallback(key, fn)` | `store.setContextValue(key, fn)` |
| `store.useStateSetter(key)` | `store.createSetter(key)` |
| `React.createRef()` in store context | `MutableRef` (`{ current }`), structurally compatible with `React.RefObject` |
| `ReactDOM.flushSync` inside `setOpen` (Popover, Tooltip) | `store.context.flushSync`; the adapter sets it to `ReactDOM.flushSync` |
| `XStore.useStore(external, initial)` | `useState(() => external ?? new XStore(initial))` in the adapter |
| `PopoverStore.disposeEffect` | `PopoverStore.destroy()` |
| `useTriggerRegistration`, `useTriggerDataForwarding` | `PopupTriggerRegistration` (`setElement` from the ref callback, `sync()` in a layout effect) |
| `useImplicitActiveTrigger` | `ensureImplicitActiveTrigger(store, open)` in a layout effect |
| `useOpenStateTransitions` | `PopupTransitions` (`start()` on mount, `destroy()` on unmount, `flush: ReactDOM.flushSync`) |
| `TooltipStore#useOpen`, `#useMultipleActive` | `selectTooltipOpen`, `selectTooltipMultipleActive` |

Rules for adapters:

1. Stores keep only internal state. Controlled props are synchronized with `syncControlledValue`.
2. Elements reach the core through setters/ref callbacks. Measuring, focusing and `autoUpdate` wait for `whenConnected(element)`.
3. Listeners and timers created by the core are released with `destroy()`.
4. Portals are rendered by the adapter.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm build` | Builds ESM + CJS and type declarations with tsdown |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint:check` / `pnpm lint:fix` | Biome check / fix (`@flippo-software/biome`) |
| `pnpm test` / `pnpm test:coverage` | Vitest (happy-dom); the line coverage threshold is a ratchet (currently 50%, target 85%) |
