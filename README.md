# dsh-terminal-wrap

A DSH web plugin that makes the **full shell command** visible in terminal cards:
it wraps instead of clipping, caps the command banner at five lines, and
syntax-highlights the command.

## The problem

DSH's `TerminalBlock` draws a command on a single line:

```css
.command {
  white-space: var(--dsl-terminal-command-whitespace, pre);
  overflow: hidden;
  text-overflow: ellipsis;
}
```

A command wider than the card is clipped with `…`, and the banner only scrolls
vertically, so the rest of the command is unreachable without copying it.
Wrapping is opt-in through that CSS variable, and only the Background-jobs panel
opts in.

## What it does

**Host half** (`lib/index.js`) — contributes two declarations to `index.html`
through the `webserver/index-inject` table the theme plugin also uses:

- `[data-terminal] { --dsl-terminal-command-whitespace: pre-wrap }` — the command
  wraps instead of being clipped (the ellipsis never engages once it wraps).
- The command banner is capped at **5 lines** (`--dsl-terminal-line-height`,
  which each card rebinds) and then scrolls; the status pill and copy control are
  sticky against that scroll.

The output region is untouched: it keeps its own whitespace policy and scrolls.

**Client half** (`lib/client.js`) — tokenizes each command line and replaces its
text with tinted spans, because a command is one plain text node and CSS cannot
tokenize. Classes and colors:

| class | shell construct | light | dark |
|---|---|---|---|
| `dshhl-cmd` | command names and launchers | `#8250df` | `#d2a8ff` |
| `dshhl-kw` | `if`, `then`, `do`, `for`, `source`, … | `#cf222e` | `#ff7b72` |
| `dshhl-flag` | `-la`, `--long` | `#0550ae` | `#79c0ff` |
| `dshhl-string` | `'…'`, `"…"`, `$'…'` | `#0a7d33` | `#7ee787` |
| `dshhl-variable` | `$HOME`, `${…}`, `$(…)`, `` `…` ``, `NAME=` | `#953800` | `#ffa657` |
| `dshhl-number` | bare numbers, `2` of `2>&1` | `#0550ae` | `#79c0ff` |
| `dshhl-op` | `\|`, `&&`, `;`, `>`, `>>`, `>&`, `=` | `#1b7c83` | `#56d4dd` |
| `dshhl-comment` | `# …` (italic) | `#6e7781` | `#8b949e` |

Dark values are selected with `body[data-ds-dark-theme]`, the attribute DSH's own
theme bootstrap toggles.

### How it survives re-renders

React owns the command span, so the highlighter never re-renders it: it only
rewrites its children and remembers what it painted on the element itself
(`data-dshhl-src` for the source text, `data-dshhl-kids` for the child count). A
re-render that keeps the command text is a no-op; one that replaces the children
is caught by a `MutationObserver` and repainted. Text is preserved exactly —
`tokenize()` output always rebuilds its input, which the test suite asserts.

The command span is located by the CSS-module fragment `_command_`
(`_command_<hash>_<line>`), with a structural fallback (the last element child of
each prompt line) in case that name ever changes.

## Install

```sh
dsh plugin --profile web add github:sirNindo/dsh-terminal-wrap
```

`dsh plugin` runs pnpm inside `~/.dsh/profiles/web`; because this package
declares `dsh.bundle` in `cordis.patch.yml`, its name is appended to
`dsh.profile.bundles` automatically, which is what makes the Loader activate it.
Restart `dsh web` afterwards — a browser refresh alone is not enough.

To wire it up by hand instead:

```sh
cd ~/.dsh/profiles/web
pnpm add github:sirNindo/dsh-terminal-wrap
```

then add `"dsh-terminal-wrap"` to `dsh.profile.bundles` in that same
`package.json` and restart `dsh web`.

## Test

```sh
node --test test/tokenize.test.mjs
```

## Notes

- The host half registers no tool view, so it cannot be shadowed or abdicated by
  another plugin the way a `tool.call.toolview` registration can.
- The client half requires no services (`inject: []`) and imports no modules.
- Takes effect on the next `dsh web` restart; a browser refresh alone is not
  enough.

## License

[MIT](LICENSE)
