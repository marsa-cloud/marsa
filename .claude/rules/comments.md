# Comments

Write the absolute minimum number of comments. Prefer self-explanatory code —
clear names, small functions, obvious structure — over comments that describe
what the code does.

- Do **not** add comments that restate the code (`// increment i`, `// fetch the user`).
- Do **not** add JSDoc/TSDoc/docstring blocks unless a public API convention in
  this repo already requires them.
- Do **not** leave narration, section-header, or "explain my reasoning" comments.
- Only keep a comment when it records **why** something non-obvious is done a
  certain way and that rationale cannot be expressed in code (e.g. a workaround
  for an upstream bug, a deliberate deviation from the obvious approach).

If code is unclear, the reviewer will ask — do not pre-empt that with comments.
This applies to code Claude writes or edits; leave existing comments alone unless
they are wrong or the surrounding code is being rewritten.
