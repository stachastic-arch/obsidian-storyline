/**
 * Instant tooltip utility — attaches a zero-delay tooltip to any element.
 *
 * Uses a real DOM element appended to document.body, positioned via
 * getBoundingClientRect().  This avoids Obsidian's slow built-in tooltip
 * (~500 ms delay) and CSS ::after flicker issues.
 *
 * Usage:
 *   import { attachTooltip } from '../components/Tooltip';
 *   attachTooltip(myButton, 'Bold');
 */

const TOOLTIP_CLASS = 'sl-instant-tooltip';

/**
 * Attach an instant tooltip to `el`.
 * The tooltip appears below the element on mouseenter and is removed on
 * mouseleave or click.  Any stale tooltips left behind by DOM re-renders
 * are cleaned up automatically.
 */
export function attachTooltip(el: HTMLElement, text: string): void {
    let tip: HTMLDivElement | null = null;

    const remove = () => {
        if (tip) { tip.remove(); tip = null; }
    };

    el.addEventListener('mouseenter', () => {
        // Remove any stale tooltips (e.g. from toolbar re-renders)
        document.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach(t => t.remove());

        tip = document.createElement('div');
        tip.className = TOOLTIP_CLASS;
        tip.textContent = text;
        document.body.appendChild(tip);

        const rect = el.getBoundingClientRect();
        tip.style.left = `${rect.left + rect.width / 2}px`;
        tip.style.top = `${rect.bottom + 4}px`;
    });

    el.addEventListener('mouseleave', remove);
    el.addEventListener('click', remove);
}
