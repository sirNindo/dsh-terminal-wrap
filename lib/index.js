/**
 * dsh-terminal-wrap — show the full shell command in DSH web terminal cards.
 *
 * Why this exists: TerminalBlock renders a command on ONE line
 * (`white-space: var(--dsl-terminal-command-whitespace, pre)` plus `overflow:
 * hidden` and `text-overflow: ellipsis`), so a long bash/pwsh command is
 * clipped with an ellipsis and cannot be scrolled back into view. That variable
 * is the supported opt-in for hosts that want wrapping, but only the
 * Background-jobs panel rebinds it, so chat/tool rows stay clipped.
 *
 * What it does: contributes one `style` row to the server-rendered index.html
 * through the same `webserver/index-inject` table the theme plugin uses. It
 * changes no command execution and replaces no tool view.
 */

/** Stable Cordis plugin name. */
export const name = 'terminal-wrap';

/** Command lines shown before the command banner starts scrolling. */
const COMMAND_BANNER_LINES = 5;

/** The banner's own vertical padding from TerminalBlock.module.css (9px each). */
const COMMAND_BANNER_PADDING_PX = 18;

/**
 * Wrapping is scoped to the terminal card root (`[data-terminal]`), so the
 * output region keeps its own whitespace policy. The `html` prefix only exists
 * to outrank the equal-specificity class rules of the app stylesheet when the
 * two ever declare the same variable on the same element.
 */
const CSS = [
  '/* dsh-terminal-wrap: wrap the command instead of clipping it with an ellipsis. */',
  'html [data-terminal]{--dsl-terminal-command-whitespace:pre-wrap}',
  `/* Cap the command banner at ${COMMAND_BANNER_LINES} lines and scroll it; the status pill and copy control stay sticky at its top. */`,
  `html [data-terminal] > :first-child{max-height:calc(${COMMAND_BANNER_LINES} * var(--dsl-terminal-line-height, 22px) + ${COMMAND_BANNER_PADDING_PX}px);overflow-y:auto}`
].join('\n');

/**
 * Contribute the override as one structured index-injection row, read live on
 * every index render.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: CSS });
  });
}
