import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvatarFallbackDelay } from '~@components/avatar/fallback/AvatarFallbackDelay';
import { AvatarImageLoader } from '~@components/avatar/image/AvatarImageLoader';
import { AvatarMachine } from '~@components/avatar/root/AvatarMachine';
import { CheckboxMachine } from '~@components/checkbox/root/CheckboxMachine';
import { CheckboxGroupMachine } from '~@components/checkbox-group/root/CheckboxGroupMachine';
import { FieldRootMachine } from '~@components/field/root/FieldRootMachine';
import { FormController } from '~@components/form/root/FormController';
import { MeterMachine } from '~@components/meter/root/MeterMachine';
import { ProgressMachine } from '~@components/progress/root/ProgressMachine';
import { RadioMachine } from '~@components/radio/root/RadioMachine';
import { RadioGroupMachine } from '~@components/radio-group/root/RadioGroupMachine';
import { getSeparatorProps } from '~@components/separator/root/getSeparatorProps';
import { SwitchMachine } from '~@components/switch/root/SwitchMachine';
import { ToggleMachine } from '~@components/toggle/root/ToggleMachine';
import { ToggleGroupMachine } from '~@components/toggle-group/root/ToggleGroupMachine';

function clickEvent(target: Element) {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'currentTarget', { value: target });
    return event;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('Checkbox', () => {
    it('toggles through the hidden input and reports state', () => {
        const onCheckedChange = vi.fn();
        const checkbox = new CheckboxMachine({ defaultId: 'cb', name: 'agree', onCheckedChange });
        const control = document.createElement('button');
        const input = document.createElement('input');
        document.body.append(control, input);
        checkbox.setControlElement(control);
        checkbox.setInputElement(input);

        const inputProps = checkbox.getInputProps();
        expect(inputProps.type).toBe('checkbox');
        expect(checkbox.getRootProps().role).toBe('checkbox');

        input.checked = true;
        const change = new Event('change');
        Object.defineProperty(change, 'target', { value: input });
        Object.defineProperty(change, 'currentTarget', { value: input });
        inputProps.onChange(change);

        expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
        expect(checkbox.checked).toBe(true);
        expect(CheckboxMachine.attrs(checkbox.getState())).toHaveProperty('data-checked', '');
        expect(CheckboxMachine.isIndicatorRendered(checkbox.getState())).toBe(true);
    });

    it('groups checkboxes with a parent checkbox', () => {
        const onValueChange = vi.fn();
        const group = new CheckboxGroupMachine({ allValues: ['a', 'b'], defaultValue: ['a'], onValueChange } as never);
        expect(group.value).toEqual(['a']);
        const a = new CheckboxMachine({ defaultId: 'a', value: 'a', group } as never);
        expect(a.checked).toBe(true);
        group.setValue(['a', 'b'], { reason: 'none', event: new Event('x'), cancel() {}, isCanceled: false } as never);
        expect(group.value).toEqual(['a', 'b']);
    });
});

describe('Switch', () => {
    it('reflects the checked state', () => {
        const switchMachine = new SwitchMachine({ defaultId: 'sw', defaultInputId: 'sw-input', defaultChecked: true });
        expect(switchMachine.checked).toBe(true);
        expect(SwitchMachine.attrs(switchMachine.getState())).toHaveProperty('data-checked', '');
        expect(switchMachine.getRootProps().role).toBe('switch');
        expect(switchMachine.getInputProps().checked).toBe(true);
        switchMachine.setOptions({ defaultId: 'sw', defaultInputId: 'sw-input', checked: false });
        expect(switchMachine.checked).toBe(false);
        expect(switchMachine.getUncheckedInputProps()).toBeNull();
    });
});

describe('Toggle and ToggleGroup', () => {
    it('toggles pressed state', () => {
        const onPressedChange = vi.fn();
        const toggle = new ToggleMachine({ onPressedChange });
        const element = document.createElement('button');
        toggle.setElement(element);
        toggle.onClick(clickEvent(element));
        expect(onPressedChange).toHaveBeenCalledWith(true, expect.anything());
        expect(toggle.getState().pressed).toBe(true);
        expect(ToggleMachine.rootAttrs(toggle.getState())).toHaveProperty('data-pressed', '');
        toggle.destroy();
    });

    it('keeps a single pressed value in a group', () => {
        const group = new ToggleGroupMachine({ defaultValue: ['bold'] });
        const italic = new ToggleMachine({ value: 'italic', group });
        const element = document.createElement('button');
        italic.setElement(element);
        italic.onClick(clickEvent(element));
        expect(group.value).toEqual(['italic']);
        expect(group.isPressed('italic')).toBe(true);
        expect(ToggleGroupMachine.rootAttrs(group.getState())).not.toHaveProperty('data-multiple');

        group.setOptions({ multiple: true, defaultValue: ['bold'] });
        group.setGroupValue('bold', true, { reason: 'none', event: new Event('x'), cancel() {}, isCanceled: false } as never);
        expect(group.value).toEqual(['italic', 'bold']);
        italic.destroy();
        group.destroy();
    });
});

describe('Radio', () => {
    it('checks the radio of the group value', () => {
        const onValueChange = vi.fn();
        const group = new RadioGroupMachine({ id: 'rg', name: 'size', onValueChange });
        const small = new RadioMachine({ value: 'small', group, defaultId: 'r1', defaultInputId: 'r1-input' });
        const large = new RadioMachine({ value: 'large', group, defaultId: 'r2', defaultInputId: 'r2-input' });
        const element = document.createElement('button');
        document.body.append(element);
        small.setRadioElement(element);

        expect(small.checked).toBe(false);
        group.setCheckedValue('small', { reason: 'none', event: new Event('x'), cancel() {}, isCanceled: false } as never);
        expect(onValueChange).toHaveBeenCalledWith('small', expect.anything());
        expect(small.checked).toBe(true);
        expect(large.checked).toBe(false);
        expect(RadioMachine.attrs(small.getState())).toHaveProperty('data-checked', '');
        expect(group.getRootProps().role).toBe('radiogroup');
        expect(group.serializedCheckedValue).toBe('small');
        expect(small.getRootProps().role).toBe('radio');

        small.destroy();
        large.destroy();
        group.destroy();
    });
});

describe('Meter, Progress and Separator', () => {
    it('formats values and computes the indicator', () => {
        const meter = new MeterMachine({ value: 30, min: 0, max: 60 });
        expect(meter.getRootProps().role).toBe('meter');
        expect(meter.getRootProps()['aria-valuenow']).toBe(30);
        expect(meter.getIndicatorStyle().width).toBe('50%');
        expect(meter.getValueText()).toContain('30');

        const progress = new ProgressMachine({ value: null });
        expect(progress.getState().status).toBe('indeterminate');
        expect(ProgressMachine.attrs(progress.getState())).toHaveProperty('data-indeterminate', '');
        progress.setOptions({ value: 100 });
        expect(progress.getState().status).toBe('complete');
        expect(progress.getRootProps()['aria-valuenow']).toBe(100);

        expect(getSeparatorProps({ orientation: 'vertical' })).toMatchObject({ role: 'separator', 'aria-orientation': 'vertical' });
    });
});

describe('Avatar', () => {
    it('tracks the image loading status and delays the fallback', () => {
        vi.useFakeTimers();
        const avatar = new AvatarMachine();
        const loader = new AvatarImageLoader(avatar, { src: undefined });
        expect(loader.status).toBe('error');
        expect(avatar.getState().imageLoadingStatus).toBe('error');

        const fallback = new AvatarFallbackDelay(100);
        expect(fallback.isRendered('error')).toBe(false);
        vi.advanceTimersByTime(100);
        expect(fallback.isRendered('error')).toBe(true);
        expect(fallback.isRendered('loaded')).toBe(false);

        loader.destroy();
        fallback.destroy();
        vi.useRealTimers();
    });
});

describe('Field and Form', () => {
    it('validates a field and reports errors to the form', async () => {
        const form = new FormController({ errors: { email: 'Taken' } });
        const field = new FieldRootMachine({
            name: 'email',
            form,
            validationMode: 'onChange',
            validate: (value: unknown) => (value === '' ? 'Required' : null)
        } as never);
        expect(field.name).toBe('email');
        const input = document.createElement('input');
        document.body.append(input);
        field.inputRef.current = input;
        await field.commit('');
        expect(field.getState().valid).toBe(false);
        expect(field.validityData.errors).toContain('Required');
        await field.commit('me@example.com');
        // The form's (server) error keeps the field invalid until it is cleared.
        expect(field.getState().valid).toBe(false);
        form.clearErrors('email');
        await field.commit('me@example.com');
        expect(field.getState().valid).toBe(true);
        field.setTouched(true);
        field.setDirty(true);
        expect(field.getState()).toMatchObject({ touched: true, dirty: true });
    });
});
