const invalidOverflowDisplayValues = new Set(['inline', 'contents']);

export function isOverflowElement(element: Element): boolean {
    const { overflow, overflowX, overflowY, display } = getComputedStyle(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && !invalidOverflowDisplayValues.has(display);
}
