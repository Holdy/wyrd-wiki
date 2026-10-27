// The options panel. Loaded on demand from index.html (the first time the options button is pressed), so the
// main page carries none of it. The page only needs to know how to apply the saved choices at start-up; see
// the small script at the top of index.html's head, which reads the same key.
//
// The model: all options live in one JSON object in localStorage under KEY, grouped by section,
//   { "visuals": { "grain": true, "edges": false } }
// A missing value means the option's default. To add an option, add an item to a section below; to add a
// section, add one to SECTIONS. An item's `cls` is put on <html> while the option is OFF, for the CSS to use.
const KEY = "wyrd-options";

export const SECTIONS = [
  {
    id: "visuals",
    title: "Visuals",
    items: [
      { id: "grain", label: "Grainy layer", hint: "The fine fibres and larger stains in the paper.", default: true, cls: "no-grain" },
      { id: "edges", label: "Dark edges", hint: "The scorched darkening round the window's edge.", default: true, cls: "no-edges" },
    ],
  },
];

/** The saved options object as stored (possibly empty, never throws). */
function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && typeof saved === "object" ? saved : {};
  } catch (e) {
    return {};
  }
}

function write(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage blocked: the choice lasts until the page closes */ }
}

/** The value of one option, falling back to its default. */
export function get(section, item) {
  const saved = read()[section.id];
  const value = saved && saved[item.id];
  return typeof value === "boolean" ? value : item.default;
}

/** Save one option and apply it to the page. */
export function set(section, item, value) {
  const all = read();
  all[section.id] = Object.assign({}, all[section.id], { [item.id]: value });
  write(all);
  apply(section, item, value);
}

function apply(section, item, value) {
  if (item.cls) document.documentElement.classList.toggle(item.cls, !value);
}

/** Apply every saved option to the page. */
export function applyAll() {
  SECTIONS.forEach((s) => s.items.forEach((i) => apply(s, i, get(s, i))));
}

const CSS = `
#options-panel {
  border: 1px solid rgba(107, 74, 43, 0.6);
  border-radius: 4px;
  background: #f6ead0;
  color: #3b2614;
  font-family: "IM Fell English", Georgia, serif;
  font-size: 1.1rem;
  line-height: 1.5;
  padding: 1.2rem 1.5rem 1rem;
  width: min(26rem, calc(100vw - 32px));
  box-shadow: 0 6px 28px rgba(60, 35, 10, 0.4);
}
#options-panel::backdrop { background: rgba(60, 35, 10, 0.35); }
#options-panel h2 { font: normal 1.5rem "IM Fell English SC", Georgia, serif; color: #8a2a1a; margin: 0 0 0.6rem; }
#options-panel h3 { font: normal 1.15rem "IM Fell English SC", Georgia, serif; letter-spacing: 0.04em; color: #8a2a1a;
  margin: 1rem 0 0.3rem; border-bottom: 1px dashed rgba(107, 74, 43, 0.45); }
#options-panel label { display: flex; gap: 0.7rem; align-items: baseline; padding: 0.3rem 0; cursor: pointer; }
#options-panel input { accent-color: #8a2a1a; flex: none; }
#options-panel small { display: block; font-style: italic; color: #6b4a2b; font-size: 0.9rem; line-height: 1.3; }
#options-panel button { font: inherit; color: #8a2a1a; background: none; border: 1px solid rgba(107, 74, 43, 0.6);
  border-radius: 3px; padding: 0.1rem 0.9rem; margin-top: 1rem; cursor: pointer; }
#options-panel button:hover { color: #3b2614; }
`;

let dialog = null;

function build() {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  dialog = document.createElement("dialog");
  dialog.id = "options-panel";
  dialog.setAttribute("aria-labelledby", "options-title");
  const title = document.createElement("h2");
  title.id = "options-title";
  title.textContent = "Options";
  dialog.appendChild(title);

  SECTIONS.forEach((section) => {
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    dialog.appendChild(heading);
    section.items.forEach((item) => {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = get(section, item);
      box.addEventListener("change", () => set(section, item, box.checked));
      const text = document.createElement("span");
      text.textContent = item.label;
      if (item.hint) {
        const hint = document.createElement("small");
        hint.textContent = item.hint;
        text.appendChild(hint);
      }
      label.append(box, text);
      dialog.appendChild(label);
    });
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());
  dialog.appendChild(close);
  // a click on the backdrop (the dialog element itself, outside its content) closes it too
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
}

export function openOptions() {
  if (!dialog) build();
  dialog.showModal();
}
