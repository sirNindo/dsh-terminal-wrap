// Tests for the client half's tokenizer. The load-bearing invariant is that
// tokens rebuild their input exactly: painting replaces a command span's text,
// so anything dropped or duplicated would corrupt the command on screen.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

/** Load the served client bundle in a stub module system and return its exports. */
function loadClientModule() {
  let factory;
  const fakeWindow = {
    __ModuleLoader__: {
      load: (entry) => {
        factory = entry.factory;
      }
    }
  };
  // Same-realm evaluation on purpose: a `node:vm` context would give the
  // factory's arrays a foreign prototype and break strict deep comparisons.
  new Function("window", source)(fakeWindow);
  assert.equal(typeof factory, "function", "the bundle must register one factory");
  return factory(() => {
    throw new Error("the client half must not require other modules");
  });
}

const client = loadClientModule();

/** Commands covering every construct the tokenizer classifies. */
const SAMPLES = [
  'cd /srv/app && ls -la | grep -c "x$" >> out.log',
  "FOO=bar sudo -E npm test",
  'if [ -f x ]; then echo "$HOME/${USER}" # note',
  "head -n 5 file 2>&1",
  "x=$(ls -1) && echo `date`",
  "PATH=/usr/local/bin:$PATH make -j8 2>/dev/null",
  "echo a#b"
];

/** Tokens of one line as [text, class] pairs, whitespace dropped, rebuild asserted. */
function tokensOf(line) {
  const tokens = client.tokenize(line);
  assert.equal(
    tokens.map((token) => token.text).join(""),
    line,
    `tokens must rebuild the input exactly: ${line}`
  );
  return tokens.filter((token) => token.text.trim() !== "").map((token) => [token.text, token.cls]);
}

test("registers apply and declares no service dependencies", () => {
  assert.equal(typeof client.apply, "function");
  assert.deepEqual(client.inject, []);
});

test("classifies commands, arguments, flags, pipes and redirects", () => {
  assert.deepEqual(tokensOf('cd /srv/app && ls -la | grep -c "x$" >> out.log'), [
    ["cd", "cmd"],
    ["/srv/app", ""],
    ["&&", "op"],
    ["ls", "cmd"],
    ["-la", "flag"],
    ["|", "op"],
    ["grep", "cmd"],
    ["-c", "flag"],
    ['"x$"', "string"],
    [">>", "op"],
    ["out.log", ""]
  ]);
});

test("keeps the command position open across launchers and assignments", () => {
  assert.deepEqual(tokensOf("FOO=bar sudo -E npm test"), [
    ["FOO", "variable"],
    ["=", "op"],
    ["bar", ""],
    ["sudo", "cmd"],
    ["-E", "flag"],
    ["npm", "cmd"],
    ["test", ""]
  ]);
});

test("colors keywords, strings, variables and comments", () => {
  assert.deepEqual(tokensOf('if [ -f x ]; then echo "$HOME/${USER}" # note'), [
    ["if", "kw"],
    ["[", ""],
    ["-f", "flag"],
    ["x", ""],
    ["]", ""],
    [";", "op"],
    ["then", "kw"],
    ["echo", "cmd"],
    ['"$HOME/${USER}"', "string"],
    ["# note", "comment"]
  ]);
});

test("numbers a bare count and a file-descriptor redirect", () => {
  assert.deepEqual(tokensOf("head -n 5 file 2>&1"), [
    ["head", "cmd"],
    ["-n", "flag"],
    ["5", "number"],
    ["file", ""],
    ["2", "number"],
    [">&", "op"],
    ["1", "number"]
  ]);
});

test("treats command substitution and backticks as variables", () => {
  assert.deepEqual(tokensOf("x=$(ls -1)"), [["x", "variable"], ["=", "op"], ["$(ls -1)", "variable"]]);
  assert.deepEqual(tokensOf("echo `date +%s`"), [["echo", "cmd"], ["`date +%s`", "variable"]]);
});

test("only starts a comment at a word boundary", () => {
  assert.deepEqual(tokensOf("echo a#b"), [["echo", "cmd"], ["a", ""], ["#", ""], ["b", ""]]);
  assert.deepEqual(tokensOf("echo a #b"), [["echo", "cmd"], ["a", ""], ["#b", "comment"]]);
});

test("returns nothing for an empty line", () => {
  assert.deepEqual(client.tokenize(""), []);
});

test("styles every class the tokenizer emits, and only those", () => {
  const styled = new Set([...client.palette.matchAll(/\.dshhl-([a-z]+)/g)].map((match) => match[1]));
  const emitted = new Set();
  for (const line of SAMPLES) {
    for (const token of client.tokenize(line)) {
      if (token.cls !== "") emitted.add(token.cls);
    }
  }
  assert.deepEqual([...emitted].sort(), [...styled].sort());
});
