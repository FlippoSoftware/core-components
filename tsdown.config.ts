import { defineConfig } from 'tsdown';

const COMPONENTS = [
    'accordion',
    'autocomplete',
    'avatar',
    'button',
    'checkbox',
    'checkbox-card',
    'checkbox-group',
    'collapsible',
    'combobox',
    'composite',
    'context-menu',
    'dialog',
    'drawer',
    'field',
    'fieldset',
    'form',
    'labelable',
    'list',
    'marquee',
    'menu',
    'menubar',
    'meter',
    'navigation-menu',
    'number-field',
    'pin-input',
    'popover',
    'progress',
    'qr-code',
    'radio',
    'radio-card',
    'radio-group',
    'scroll-area',
    'segmented-control',
    'select',
    'separator',
    'slider',
    'snippet',
    'switch',
    'tabs',
    'toast',
    'toggle',
    'toggle-group',
    'toolbar',
    'tooltip'
];
const LIB_MODULES = ['attributes', 'dom', 'events', 'patterns', 'popup', 'positioning', 'props', 'store', 'timers'];

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        lib: 'src/lib/index.ts',
        floating: 'src/packages/floating-ui/index.ts',
        ...Object.fromEntries(LIB_MODULES.map((name) => [name, `src/lib/${name}/index.ts`])),
        ...Object.fromEntries(COMPONENTS.map((name) => [name, `src/components/${name}/index.ts`]))
    },

    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    platform: 'neutral',
    exports: true
});
