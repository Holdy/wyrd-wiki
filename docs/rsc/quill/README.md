Quill titles: text drawn as if written with a fixed-angle quill nib.

- `src/*.ts` is the library's source (the font's strokes are in `glyphs.ts` and `blackletter.ts`).
  `npm run quill` compiles it to the `.js` files sitting beside this README (needs `npm install` once
  for TypeScript). Edit the TypeScript, not those `.js` files.
- `word.js` is the page's own part, not compiled from anything: it lays a title out as one
  inline-block per word, each a canvas with the real text over it in transparent type, then draws
  it or writes it with the pen. Used by `writeTitle()` in `index.html`.
- `demo/` is a test page for the font: `npm run quill-demo`, then open http://localhost:8001/demo/
