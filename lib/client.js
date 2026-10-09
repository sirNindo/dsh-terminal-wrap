/**
 * dsh-terminal-wrap — client half: shell syntax highlighting for the command
 * lines of DSH web terminal cards.
 *
 * The host half (lib/index.js) ships the layout CSS: a long command wraps
 * instead of being clipped, and its banner is capped at five lines. Color
 * cannot be expressed in CSS because a command is one plain text node, so this
 * half tokenizes each command line and replaces the text with tinted spans.
 *
 * React owns the command span. A command's text never changes after its call is
 * created, and every rewrite is guarded by the source text remembered on the
 * element (`data-dshhl-src`) plus the child count it was painted with
 * (`data-dshhl-kids`), so a re-render that keeps the text leaves the colors
 * alone and one that replaces the children is repainted by the observer.
 *
 * @module dsh-terminal-wrap/client
 */
window.__ModuleLoader__.load({
	id: "dsh-terminal-wrap",
	factory: (require) => {
		"use strict";

		var module = { exports: {} };
		var exports = module.exports;

		/** Hashed CSS-module fragment of TerminalBlock's command span (`_command_<hash>_<line>`). */
		var COMMAND_CLASS_FRAGMENT = "_command_";

		/** Attribute holding the plain text a command span was painted from. */
		var SOURCE_ATTR = "data-dshhl-src";

		/** Attribute holding the child count that text was painted into. */
		var KIDS_ATTR = "data-dshhl-kids";

		/** Style tag identity, matching the app's own plugin-CSS convention. */
		var PALETTE_STYLE_ID = "dsh-terminal-wrap/highlight.css";

		/** Shell syntax words; they are never command names. */
		var KEYWORDS = {
			"if": 1, "then": 1, "else": 1, "elif": 1, "fi": 1, "for": 1, "in": 1,
			"do": 1, "done": 1, "while": 1, "until": 1, "case": 1, "esac": 1,
			"function": 1, "select": 1, "return": 1, "exit": 1, "export": 1,
			"local": 1, "declare": 1, "readonly": 1, "set": 1, "unset": 1,
			"shift": 1, "trap": 1, "source": 1, "alias": 1, "unalias": 1,
			"eval": 1, "break": 1, "continue": 1, "time": 1
		};

		/** Words that leave the next word in command position (launchers and openers). */
		var COMMAND_POSITION_WORDS = {
			"sudo": 1, "env": 1, "time": 1, "command": 1, "nice": 1, "nohup": 1,
			"exec": 1, "xargs": 1, "if": 1, "then": 1, "else": 1, "elif": 1,
			"while": 1, "until": 1, "do": 1
		};

		/** Operators that open a new command segment. */
		var SEGMENT_OPERATORS = {
			"|": 1, "||": 1, "|&": 1, "&&": 1, ";": 1, ";;": 1, ";&": 1, ";;&": 1,
			"&": 1, "(": 1, "{": 1, "!": 1
		};

		/** Operators, longest first so `>>` never tokenizes as two `>`. */
		var OPERATORS = [
			";;&", "&>>", ";;", "&&", "||", "|&", ";&", ">>", "<<", ">&", "<&",
			"&>", "<>", ">", "<", "|", ";", "&", "(", ")", "{", "}", "=", "!"
		];

		/** One character of an unquoted word; `=` is excluded because assignments are handled separately. */
		var WORD_CHAR = /[A-Za-z0-9_.\/~^*?@%+:,+-]/;

		/** Token colors: light by default, dark under the app's own dark attribute. */
		var PALETTE = [
			"/* dsh-terminal-wrap: shell token colors for terminal-card commands. */",
			"html [data-terminal] .dshhl-comment{color:#6e7781;font-style:italic}",
			"html [data-terminal] .dshhl-kw{color:#cf222e}",
			"html [data-terminal] .dshhl-cmd{color:#8250df;font-weight:500}",
			"html [data-terminal] .dshhl-flag{color:#0550ae}",
			"html [data-terminal] .dshhl-string{color:#0a7d33}",
			"html [data-terminal] .dshhl-variable{color:#953800}",
			"html [data-terminal] .dshhl-number{color:#0550ae}",
			"html [data-terminal] .dshhl-op{color:#1b7c83}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-comment{color:#8b949e}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-kw{color:#ff7b72}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-cmd{color:#d2a8ff}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-flag{color:#79c0ff}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-string{color:#7ee787}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-variable{color:#ffa657}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-number{color:#79c0ff}",
			"html body[data-ds-dark-theme] [data-terminal] .dshhl-op{color:#56d4dd}"
		].join("\n");

		/**
		 * Split one command line into colored tokens.
		 * @param line - one rendered command line, without a newline.
		 * @returns ordered tokens; an empty `cls` renders as untinted text.
		 */
		function tokenize(line) {
			var tokens = [];
			var index = 0;
			var expectCommand = true;
			var assignmentValue = false;

			function push(cls, text) {
				if (text !== "") tokens.push({ cls: cls, text: text });
			}
			/** Index just past the closing quote; escapes are honored unless single-quoted. */
			function endOfQuoted(from, quote) {
				var at = from;
				while (at < line.length) {
					var ch = line.charAt(at);
					if (ch === "\\" && quote !== "'") { at += 2; continue; }
					if (ch === quote) return at + 1;
					at++;
				}
				return line.length;
			}
			/** Index just past the balancing closer, escape-aware and nesting-aware. */
			function endOfBalanced(from, opener, closer) {
				var depth = 1;
				var at = from;
				while (at < line.length) {
					var ch = line.charAt(at);
					if (ch === "\\") { at += 2; continue; }
					if (ch === opener) depth++;
					else if (ch === closer) { depth--; if (depth === 0) return at + 1; }
					at++;
				}
				return line.length;
			}

			while (index < line.length) {
				var ch = line.charAt(index);

				if (/\s/.test(ch)) {
					var spacedFrom = index;
					while (index < line.length && /\s/.test(line.charAt(index))) index++;
					push("", line.slice(spacedFrom, index));
					continue;
				}

				if (ch === "#" && (index === 0 || /[\s;&|(]/.test(line.charAt(index - 1)))) {
					push("comment", line.slice(index));
					break;
				}

				if (ch === "'" || ch === "\"" || ch === "`") {
					var quotedEnd = endOfQuoted(index + 1, ch);
					push(ch === "`" ? "variable" : "string", line.slice(index, quotedEnd));
					index = quotedEnd;
					expectCommand = false;
					assignmentValue = false;
					continue;
				}

				if (ch === "$") {
					var after = line.charAt(index + 1);
					var varEnd = -1;
					if (after === "{") varEnd = endOfBalanced(index + 2, "{", "}");
					else if (after === "(") varEnd = endOfBalanced(index + 2, "(", ")");
					else if (after === "'" || after === "\"") varEnd = endOfQuoted(index + 2, after);
					else {
						var named = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(index));
						if (named !== null) varEnd = index + named[0].length;
						else if (/^[$?!#*@0-9-]/.test(after)) varEnd = index + 2;
					}
					if (varEnd > index + 1) {
						push("variable", line.slice(index, varEnd));
						index = varEnd;
						expectCommand = false;
						assignmentValue = false;
						continue;
					}
				}

				if (ch === "\\") {
					push("", line.slice(index, index + 2));
					index += 2;
					continue;
				}

				var operator = null;
				for (var at = 0; at < OPERATORS.length; at++) {
					if (line.startsWith(OPERATORS[at], index)) { operator = OPERATORS[at]; break; }
				}
				if (operator !== null) {
					push("op", operator);
					index += operator.length;
					if (operator === "=") { assignmentValue = true; expectCommand = true; }
					else if (SEGMENT_OPERATORS[operator] === 1) { expectCommand = true; assignmentValue = false; }
					else { expectCommand = false; assignmentValue = false; }
					continue;
				}

				if (WORD_CHAR.test(ch)) {
					var wordFrom = index;
					while (index < line.length && WORD_CHAR.test(line.charAt(index))) index++;
					var word = line.slice(wordFrom, index);

					if (line.charAt(index) === "=" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(word)) {
						push("variable", word);
						assignmentValue = true;
						expectCommand = true;
						continue;
					}
					if (/^[0-9]+$/.test(word)) push("number", word);
					else if (word.length > 1 && word.charAt(0) === "-") push("flag", word);
					else if (assignmentValue) { push("", word); assignmentValue = false; expectCommand = true; }
					else if (KEYWORDS[word] === 1) {
						push("kw", word);
						expectCommand = COMMAND_POSITION_WORDS[word] === 1;
					} else if (expectCommand) {
						push("cmd", word);
						// A launcher (`sudo`, `env`, `xargs`, …) is a command too, yet
						// the command it launches still belongs in command position.
						expectCommand = COMMAND_POSITION_WORDS[word] === 1;
					} else push("", word);
					continue;
				}

				// `[` is a command in its own right (`/usr/bin/[`), so it consumes
				// the command position and leaves its tests as plain arguments.
				if (ch === "[" && expectCommand) expectCommand = false;
				push("", ch);
				index++;
			}
			return tokens;
		}

		/**
		 * The command spans this plugin colors.
		 *
		 * The class fragment is a CSS-module artifact; the structural fallback
		 * keeps the plugin working if it is ever renamed: a command span is the
		 * last element child of each prompt line inside the card's header.
		 * @param block - one `[data-terminal]` card root.
		 * @returns its command spans.
		 */
		function commandSpans(block) {
			var found = block.querySelectorAll("[class*=\"" + COMMAND_CLASS_FRAGMENT + "\"]");
			if (found.length > 0) return found;
			var header = block.firstElementChild;
			var prompt = header === null ? null : header.firstElementChild;
			if (prompt === null) return [];
			var spans = [];
			for (var i = 0; i < prompt.children.length; i++) {
				var last = prompt.children[i].lastElementChild;
				if (last !== null && last.tagName === "SPAN") spans.push(last);
			}
			return spans;
		}

		/** Repaint one command span, once per distinct text and child layout. */
		function paint(span) {
			var source = span.textContent;
			if (source === "") return;
			var kids = String(span.childNodes.length);
			if (span.getAttribute(SOURCE_ATTR) === source && span.getAttribute(KIDS_ATTR) === kids) return;
			var tokens = tokenize(source);
			while (span.firstChild !== null) span.removeChild(span.firstChild);
			for (var i = 0; i < tokens.length; i++) {
				var token = tokens[i];
				if (token.cls === "") { span.appendChild(document.createTextNode(token.text)); continue; }
				var tinted = document.createElement("span");
				tinted.className = "dshhl-" + token.cls;
				tinted.textContent = token.text;
				span.appendChild(tinted);
			}
			span.setAttribute(SOURCE_ATTR, source);
			span.setAttribute(KIDS_ATTR, String(span.childNodes.length));
		}

		/** Paint every command line of one terminal card. */
		function highlight(block) {
			var spans = commandSpans(block);
			for (var i = 0; i < spans.length; i++) paint(spans[i]);
		}

		/** Paint one freshly added node when it is, or contains, a terminal card. */
		function highlightWithin(node) {
			if (node.nodeType !== 1) return;
			if (node.matches("[data-terminal]")) highlight(node);
			var blocks = node.querySelectorAll("[data-terminal]");
			for (var i = 0; i < blocks.length; i++) highlight(blocks[i]);
		}

		/** Add the token palette a single time. */
		function injectPalette() {
			if (document.querySelector("style[data-plugin-css=\"" + PALETTE_STYLE_ID + "\"]") !== null) return;
			var tag = document.createElement("style");
			tag.setAttribute("data-plugin", "dsh-terminal-wrap");
			tag.setAttribute("data-plugin-css", PALETTE_STYLE_ID);
			tag.textContent = PALETTE;
			document.head.appendChild(tag);
		}

		/** Paint what is already mounted, then follow rows React adds or rewrites. */
		function start() {
			var root = document.body === null ? document.documentElement : document.body;
			var observer = new MutationObserver(function (records) {
				for (var i = 0; i < records.length; i++) {
					var record = records[i];
					for (var j = 0; j < record.addedNodes.length; j++) highlightWithin(record.addedNodes[j]);
					var target = record.target;
					if (target !== null && target.nodeType === 1 && typeof target.closest === "function") {
						var block = target.closest("[data-terminal]");
						if (block !== null) highlight(block);
					}
				}
			});
			observer.observe(root, { childList: true, subtree: true });
			highlightWithin(root);
		}

		/** Mount the palette and the highlighter. */
		function apply() {
			injectPalette();
			start();
		}

		exports.apply = apply;
		exports.inject = [];
		exports.tokenize = tokenize;
		exports.palette = PALETTE;
		return module.exports;
	}
});
