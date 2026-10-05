import type { LabelableController } from '~@components/labelable/root/LabelableController';

/**
 * Props of `<Field.Label>`: id, `htmlFor` and prevention of text selection on double click.
 */
export function getFieldLabelProps(labelable: LabelableController) {
    return {
        id: labelable.labelId,
        htmlFor: labelable.controlId ?? undefined,
        onMouseDown(event: MouseEvent) {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.('button,input,select,textarea')) {
                return;
            }

            // Prevent text selection when double clicking label.
            if (!event.defaultPrevented && event.detail > 1) {
                event.preventDefault();
            }
        }
    };
}
