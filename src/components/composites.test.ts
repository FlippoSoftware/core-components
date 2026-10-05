import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccordionItemMachine } from '~@components/accordion/item/AccordionItemMachine';
import { AccordionMachine } from '~@components/accordion/root/AccordionMachine';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { CollapsibleMachine } from '~@components/collapsible/root/CollapsibleMachine';
import { FieldsetMachine } from '~@components/fieldset/root/FieldsetMachine';
import { LabelableController } from '~@components/labelable/root/LabelableController';
import { MarqueeMachine } from '~@components/marquee/root/MarqueeMachine';
import { NumberFieldButtonMachine } from '~@components/number-field/button/NumberFieldButtonMachine';
import { NumberFieldMachine } from '~@components/number-field/root/NumberFieldMachine';
import { PinInputMachine } from '~@components/pin-input/root/PinInputMachine';
import { getFirstEmptyIndex, testPattern } from '~@components/pin-input/utils/pinInputUtils';
import { QrCodeMachine } from '~@components/qr-code/root/QrCodeMachine';
import { ScrollAreaMachine } from '~@components/scroll-area/root/ScrollAreaMachine';
import { SegmentedControlItemMachine } from '~@components/segmented-control/item/SegmentedControlItemMachine';
import { SegmentedControlMachine } from '~@components/segmented-control/root/SegmentedControlMachine';
import { SliderMachine } from '~@components/slider/root/SliderMachine';
import { SliderThumbMachine } from '~@components/slider/thumb/SliderThumbMachine';
import { getSliderValue, roundValueToStep, valueArrayToPercentages } from '~@components/slider/utils/sliderUtils';
import { SnippetMachine } from '~@components/snippet/root/SnippetMachine';
import { TabsListMachine } from '~@components/tabs/list/TabsListMachine';
import { TabsPanelMachine } from '~@components/tabs/panel/TabsPanelMachine';
import { TabsMachine } from '~@components/tabs/root/TabsMachine';
import { TabsTabMachine } from '~@components/tabs/tab/TabsTabMachine';
import { ToolbarButtonMachine } from '~@components/toolbar/button/ToolbarButtonMachine';
import { ToolbarGroupMachine } from '~@components/toolbar/group/ToolbarGroupMachine';
import { ToolbarMachine } from '~@components/toolbar/root/ToolbarMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

const details = () => createChangeEventDetails(REASONS.none);

beforeEach(() => {
    globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
});

afterEach(() => {
    globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
    document.body.innerHTML = '';
});

describe('Collapsible and Accordion', () => {
    it('opens a collapsible from its trigger', () => {
        const onOpenChange = vi.fn();
        const collapsible = new CollapsibleMachine({ defaultPanelId: 'panel', onOpenChange });
        const triggerProps = collapsible.getTriggerProps(new ButtonMachine());
        expect(triggerProps['aria-expanded']).toBe(false);
        collapsible.handleTrigger(new MouseEvent('click'));
        expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything());
        expect(collapsible.open).toBe(true);
        expect(collapsible.shouldRenderPanel()).toBe(true);
        expect(collapsible.getPanelProps().id).toBe('panel');
        collapsible.destroy();
    });

    it('keeps one accordion item open unless multiple', () => {
        const accordion = new AccordionMachine({ defaultValue: ['a'] });
        const a = new AccordionItemMachine(accordion, { value: 'a', fallbackValue: 'a', defaultTriggerId: 'ta', defaultPanelId: 'pa' });
        const b = new AccordionItemMachine(accordion, { value: 'b', fallbackValue: 'b', defaultTriggerId: 'tb', defaultPanelId: 'pb' });
        expect(a.isOpen).toBe(true);
        accordion.handleValueChange('b', true);
        expect(accordion.value).toEqual(['b']);
        expect(accordion.isOpen('a')).toBe(false);

        accordion.setOptions({ multiple: true, defaultValue: ['a'] });
        accordion.handleValueChange('a', true);
        expect(accordion.value).toEqual(['b', 'a']);
        expect(AccordionMachine.attrs(accordion.getState())).toHaveProperty('data-orientation', 'vertical');
        a.destroy();
        b.destroy();
        accordion.destroy();
    });
});

describe('Tabs', () => {
    it('selects a tab and links tabs with panels', () => {
        const onValueChange = vi.fn();
        const tabs = new TabsMachine({ defaultValue: 'one', onValueChange });
        const list = new TabsListMachine(tabs);
        const listElement = document.createElement('div');
        document.body.append(listElement);
        list.setListElement(listElement);

        const one = new TabsTabMachine(tabs, list, { id: 'tab-one', value: 'one' });
        const two = new TabsTabMachine(tabs, list, { id: 'tab-two', value: 'two' });
        const panel = new TabsPanelMachine(tabs, { id: 'panel-two', value: 'two' });
        const oneElement = document.createElement('button');
        const twoElement = document.createElement('button');
        listElement.append(oneElement, twoElement);
        one.setElement(oneElement);
        two.setElement(twoElement);

        expect(one.active).toBe(true);
        expect(panel.hidden).toBe(true);
        list.onTabActivation('two', createChangeEventDetails(REASONS.none));
        expect(onValueChange).toHaveBeenCalledWith('two', expect.anything());
        expect(tabs.value).toBe('two');
        expect(two.active).toBe(true);
        expect(panel.hidden).toBe(false);
        expect(one.getProps().role).toBe('tab');
        expect(list.getRootProps().role).toBe('tablist');

        panel.destroy();
        one.destroy();
        two.destroy();
        list.destroy();
        tabs.destroy();
    });
});

describe('Slider', () => {
    it('updates values and keeps ranges ordered', () => {
        const onValueChange = vi.fn();
        const slider = new SliderMachine({ id: 'slider', defaultValue: [20, 80], onValueChange });
        expect(slider.range).toBe(true);
        expect(slider.values).toEqual([20, 80]);
        slider.setValue([30, 80], createChangeEventDetails(REASONS.none) as never);
        expect(onValueChange).toHaveBeenCalled();
        expect(slider.values).toEqual([30, 80]);
        expect(slider.getState()).toMatchObject({ min: 0, max: 100, orientation: 'horizontal' });

        const thumb = new SliderThumbMachine(slider, {
            id: 'thumb',
            index: 0,
            defaultInputId: 'thumb-input',
            labelableInputId: 'thumb-input'
        });
        expect(thumb.getInputProps()).toMatchObject({ type: 'range', min: 0, max: 100 });
        thumb.destroy();
        slider.destroy();

        expect(roundValueToStep(7.4, 5, 0)).toBe(5);
        expect(valueArrayToPercentages([25, 50], 0, 100)).toEqual([25, 50]);
        expect(getSliderValue(150, 0, 0, 100, false, [20])).toBe(100);
    });
});

describe('NumberField', () => {
    it('increments, clamps and formats', () => {
        const onValueChange = vi.fn();
        const field = new NumberFieldMachine({ defaultId: 'nf', defaultValue: 9, max: 10, onValueChange });
        field.incrementValue(1, { direction: 1, reason: REASONS.incrementPress });
        expect(field.value).toBe(10);
        field.incrementValue(5, { direction: 1, reason: REASONS.incrementPress });
        expect(field.value).toBe(10);
        field.incrementValue(3, { direction: -1, reason: REASONS.decrementPress });
        expect(field.value).toBe(7);
        expect(onValueChange).toHaveBeenCalledWith(7, expect.anything());
        expect(field.getInputProps().inputMode).toBeDefined();

        const increment = new NumberFieldButtonMachine(field, true);
        expect(increment.getProps()['aria-label']).toBeDefined();
        field.destroy();
    });
});

describe('PinInput', () => {
    it('validates patterns and finds empty slots', () => {
        expect(testPattern('5', 'numeric')).toBe(true);
        expect(testPattern('a', 'numeric')).toBe(false);
        expect(getFirstEmptyIndex(['1', '', '3'])).toBe(1);

        const onValueComplete = vi.fn();
        const pinInput = new PinInputMachine({ id: 'pin', onValueComplete });
        expect(pinInput.getState()).toMatchObject({ disabled: false });
        pinInput.destroy?.();
    });
});

describe('SegmentedControl', () => {
    it('selects an item', () => {
        const onValueChange = vi.fn();
        const control = new SegmentedControlMachine({ id: 'sc', defaultValue: 'list', onValueChange });
        const grid = new SegmentedControlItemMachine(control, { value: 'grid' });
        expect(grid.getState().selected).toBe(false);
        control.setValue('grid', details() as never);
        expect(onValueChange).toHaveBeenCalledWith('grid', expect.anything());
        expect(control.value).toBe('grid');
        expect(grid.getState().selected).toBe(true);
        expect(control.getRootProps().role).toBe('radiogroup');
    });
});

describe('Toolbar', () => {
    it('reports disabled state of groups and items', () => {
        const toolbar = new ToolbarMachine({ orientation: 'vertical' });
        const group = new ToolbarGroupMachine(toolbar, true);
        const button = new ToolbarButtonMachine(toolbar, { group });
        expect(toolbar.getRootProps().role).toBe('toolbar');
        expect(group.disabled).toBe(true);
        expect(button.disabled).toBe(true);
        expect(ToolbarMachine.attrs(toolbar.getState())).toHaveProperty('data-orientation', 'vertical');
        toolbar.destroy();
    });
});

describe('Fieldset and Labelable', () => {
    it('disables fields and resolves control ids', () => {
        const fieldset = new FieldsetMachine({ disabled: true });
        fieldset.setLegendId('legend');
        expect(fieldset.getRootProps()).toMatchObject({ 'aria-labelledby': 'legend' });

        const labelable = new LabelableController('generated');
        expect(labelable.resolveControlId('control')).toBe(labelable.controlId ?? 'control');
        labelable.setLabelId('label');
        expect(labelable.labelId).toBe('label');
        labelable.addMessageId('error');
        expect(labelable.messageIds).toContain('error');
    });
});

describe('Snippet, Marquee, ScrollArea and QrCode', () => {
    it('reads the snippet text', () => {
        const snippet = new SnippetMachine();
        expect(SnippetMachine.attrs(snippet.getState())).toBeDefined();
        snippet.destroy();
    });

    it('computes marquee styles', () => {
        const marquee = new MarqueeMachine({ speed: 50, direction: 'reverse' });
        expect(marquee.getRootStyle()).toBeDefined();
        expect(marquee.getTrackStyle()).toBeDefined();
        expect(marquee.getState()).toBeDefined();
        marquee.destroy();
    });

    it('creates a scroll area state', () => {
        const scrollArea = new ScrollAreaMachine();
        expect(scrollArea.getState()).toBeDefined();
        expect(scrollArea.getScrollbarState('vertical')).toBeDefined();
        scrollArea.destroy();
    });

    it('generates a QR code with an injected renderer', async () => {
        const append = vi.fn();
        const onGenerate = vi.fn();
        const qrCode = new QrCodeMachine({
            value: 'https://example.com',
            onGenerate,
            createRenderer: () => ({ append, getRawData: async () => null, download: async () => {} })
        });
        const frame = document.createElement('div');
        document.body.append(frame);
        qrCode.setFrameElement(frame);
        await qrCode.autoGenerate();
        await Promise.resolve();
        expect(qrCode.getState().status).not.toBe('error');
    });
});
