# Comments

Write the absolute minimum number of comments. Prefer self-explanatory code —
clear names, small functions, obvious structure — over comments that describe
what the code does.

**Comments are single-line.** In 99% of cases, code that looks like it needs a
block needs a better name instead.

- A comment must fit on **one line** (100 cols). A short multi-line block is
  permitted only for a genuinely non-obvious external constraint — an upstream
  library's behaviour, a database engine rule — and must be the shortest
  statement of that constraint, not an essay.
- Do **not** add comments that restate the code (`// increment i`, `// fetch the user`).
- Do **not** add JSDoc/TSDoc blocks — no `@param`, no `@returns`. The signature is
  the documentation. The only exception is a public API convention this repo
  already requires.
- Do **not** comment a class, module, guard, or decorator to restate its own name.
- Do **not** leave narration, section-header, or "explain my reasoning" comments.
- Record only the **why**, never the what — and only when the why cannot be
  derived from reading the file.

Before writing a comment, try in order: a better name, a smaller function, a
named constant. Write the comment only if all three fail.

If code is unclear, the reviewer will ask — do not pre-empt that with comments.
This applies to code Claude writes or edits; leave existing comments alone unless
they are wrong or the surrounding code is being rewritten.
