// Rebuilds the continent folders in docs from the research data in the local-llm-agent project.
//
//   bun tools/import-stories.ts [--source ~/projects/local-llm-agent] [--dry-run]
//
// Every `<subject>-data-targets/**/*.md` (or `<subject>-targets/`, as weeping-statue is named, or `<subject>-target-data/`, as screaming-skull is) there holding stories is read, filed
// by its file name (see parseName), and written under docs/<continent> as one .md and
// one HTML page per story and an HTML page per place, with the home page and 404.html
// at the top of the site. Each hand-written docs/mirabilia/**/*.md also gets its HTML page.
// See "Importing stories" in README.md.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sourceArg = args.indexOf("--source");
const sourceRoot =
  sourceArg >= 0 ? args[sourceArg + 1] : path.join(homedir(), "projects", "local-llm-agent");
const siteRoot = path.join(import.meta.dir, "..", "docs");
const outRoot = siteRoot;
const SITE = "https://wyrd.wiki";
const STORIES_URL = "/";
// On the home page: the old addresses were /index.html?/<path> (and search engines still have some), so they go to /<path>.
const OLD_ADDRESS_REDIRECT = `if ((location.pathname === "/" || location.pathname === "/index.html") && location.search.charAt(1) === "/")
      location.replace(location.search.slice(1) + location.hash);`;

const CONTINENTS = ["Africa", "Antarctica", "Asia", "Europe", "North_America", "Oceania", "South_America"];

const COUNTRY_CONTINENT: Record<string, string> = {};
function continent(name: string, countries: string) {
  for (const c of countries.split(";")) COUNTRY_CONTINENT[c.trim()] = name;
}
continent("Africa", "Algeria;Angola;Benin;Botswana;Burkina Faso;Burundi;Cameroon;Cape Verde;Central African Republic;Chad;Comoros;Democratic Republic of the Congo;Republic of the Congo;Djibouti;Egypt;Equatorial Guinea;Eritrea;Eswatini;Ethiopia;Gabon;Gambia;Ghana;Guinea;Guinea-Bissau;Ivory Coast;Kenya;Lesotho;Liberia;Libya;Madagascar;Malawi;Mali;Mauritania;Mauritius;Morocco;Mozambique;Namibia;Niger;Nigeria;Rwanda;Sao Tome and Principe;Senegal;Seychelles;Sierra Leone;Somalia;South Africa;South Sudan;Sudan;Tanzania;Togo;Tunisia;Uganda;Zambia;Zimbabwe");
continent("Antarctica", "Antarctica");
continent("Asia", "Afghanistan;Armenia;Azerbaijan;Bahrain;Bangladesh;Bhutan;Brunei;Cambodia;China;Georgia;India;Indonesia;Iran;Iraq;Israel;Japan;Jordan;Kazakhstan;Kuwait;Kyrgyzstan;Laos;Lebanon;Malaysia;Maldives;Mongolia;Myanmar;Nepal;North Korea;Oman;Pakistan;Palestine;Philippines;Qatar;Saudi Arabia;Singapore;South Korea;Sri Lanka;Syria;Taiwan;Tajikistan;Thailand;Timor-Leste;Turkey;Turkmenistan;United Arab Emirates;Uzbekistan;Vietnam;Yemen");
continent("Europe", "Albania;Andorra;Austria;Belarus;Belgium;Bosnia and Herzegovina;Bulgaria;Croatia;Cyprus;Czechia;Denmark;Estonia;Finland;France;Germany;Greece;Hungary;Iceland;Ireland;Italy;Kosovo;Latvia;Liechtenstein;Lithuania;Luxembourg;Malta;Moldova;Monaco;Montenegro;Netherlands;North Macedonia;Norway;Poland;Portugal;Romania;Russia;San Marino;Serbia;Slovakia;Slovenia;Spain;Sweden;Switzerland;Ukraine;Vatican City;United Kingdom;England;Scotland;Wales;Northern Ireland");
continent("North_America", "Antigua and Barbuda;Bahamas;Barbados;Belize;Canada;Costa Rica;Cuba;Dominica;Dominican Republic;El Salvador;Grenada;Guatemala;Haiti;Honduras;Jamaica;Mexico;Nicaragua;Panama;Saint Kitts and Nevis;Saint Lucia;Saint Vincent and the Grenadines;Trinidad and Tobago;United States");
continent("Oceania", "Australia;Fiji;Kiribati;Marshall Islands;Micronesia;Nauru;New Zealand;Palau;Papua New Guinea;Samoa;Solomon Islands;Tonga;Tuvalu;Vanuatu");
continent("South_America", "Argentina;Bolivia;Brazil;Chile;Colombia;Ecuador;Guyana;Paraguay;Peru;Suriname;Uruguay;Venezuela");

// Files named "Region, UK" carry no constituent country, so say which one a region is in.
const UK_REGION_COUNTRY: Record<string, string> = {};
function ukRegions(country: string, regions: string) {
  for (const r of regions.split(";")) UK_REGION_COUNTRY[r.trim().toLowerCase()] = country;
}
ukRegions("England", "City of London;Bedfordshire;Berkshire;Bristol;Buckinghamshire;Cambridgeshire;Cheshire;Cornwall;Cumberland;Cumbria;Derbyshire;Devon;Dorset;Durham;County Durham;East Sussex;Essex;Gloucestershire;Greater London;London;Greater Manchester;Hampshire;Herefordshire;Hertfordshire;Huntingdonshire;Isle of Wight;Kent;Lancashire;Leicestershire;Lincolnshire;Merseyside;Middlesex;Norfolk;Northamptonshire;Northumberland;Nottinghamshire;Oxfordshire;Rutland;Shropshire;Somerset;South Yorkshire;Staffordshire;Suffolk;Surrey;Sussex;Tyne and Wear;Warwickshire;West Midlands;West Sussex;West Yorkshire;Westmorland;Wiltshire;Worcestershire;Yorkshire;North Yorkshire;East Riding of Yorkshire;Isles of Scilly");
ukRegions("Scotland", "Aberdeenshire;Angus;Argyll;Ayrshire;Banffshire;Berwickshire;Bute;Caithness;Clackmannanshire;Dumfriesshire;Dumfries and Galloway;Dunbartonshire;East Lothian;Fife;Inverness-shire;Kincardineshire;Kinross-shire;Kirkcudbrightshire;Lanarkshire;Midlothian;Moray;Nairnshire;Orkney;Peeblesshire;Perthshire;Renfrewshire;Ross and Cromarty;Ross-shire;Roxburghshire;Selkirkshire;Shetland;Stirlingshire;Sutherland;West Lothian;Western Isles;Wigtownshire;Highland;Scottish Borders;Edinburgh;Glasgow;Aberdeen;Dundee");
ukRegions("Wales", "Anglesey;Brecknockshire;Caernarfonshire;Cardiganshire;Carmarthenshire;Denbighshire;Flintshire;Glamorgan;Gwent;Gwynedd;Merionethshire;Monmouthshire;Montgomeryshire;Pembrokeshire;Powys;Radnorshire;Ceredigion;Clwyd;Dyfed;Cardiff;Swansea;Newport");
ukRegions("Northern Ireland", "Antrim;Armagh;Down;Fermanagh;Londonderry;Tyrone;County Antrim;County Armagh;County Down;County Fermanagh;County Londonderry;County Tyrone;Derry");

const LOWER_WORDS = new Set(["and", "of", "the", "on", "upon", "in", "with"]);
function titleCase(text: string): string {
  return text
    .split(" ")
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const COUNTRY_ALIASES: Record<string, string> = { uk: "United Kingdom", usa: "United States", congo: "Republic of the Congo", "cabo verde": "Cape Verde" };
function countryName(raw: string): string {
  return COUNTRY_ALIASES[raw.toLowerCase()] ?? raw;
}

const warnings: string[] = [];
const warn = (msg: string) => warnings.push(msg);

type Filing = { continent: string; country: string; region?: string; place?: string };

// "Afghanistan" is a country; "Alabama, USA" a region; "Acle,norfolk,uk" and
// "Airdrie, Alberta, Canada" are settlements.
function parseName(fileBase: string): Filing | undefined {
  const parts = fileBase.split(",").map((p) => p.trim());
  let country = countryName(parts[parts.length - 1]);
  let region: string | undefined;
  let place: string | undefined;
  if (parts.length >= 2) {
    region = titleCase(parts[parts.length - 2]);
    if (parts.length >= 3) place = parts.slice(0, -2).join(", ");
  }
  if (country.toLowerCase().endsWith(" copy")) return undefined; // stray duplicates of a county file
  if (country === "United Kingdom" && region) {
    const constituent = UK_REGION_COUNTRY[region.toLowerCase()];
    if (!constituent) {
      warn(`${fileBase}: no constituent country known for UK region "${region}"`);
      return undefined;
    }
    country = constituent;
  }
  const cont = COUNTRY_CONTINENT[country];
  if (!cont) {
    warn(`${fileBase}: no continent known for country "${country}"`);
    return undefined;
  }
  return { continent: cont, country, region, place };
}

// File names: spaces become "_"; directory names are the lower-case, hyphenated form (as the page expects).
const fileName = (name: string) => name.replace(/[\/\\?%#:"*<>|]/g, "").replace(/\s+/g, "_");
const dirName = (name: string) => fileName(name).toLowerCase().replace(/_/g, "-");
// Letters that aren't an accent on a plain letter, so normalising doesn't reach them.
const PLAIN_LETTERS: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", ð: "d", đ: "d", þ: "th", ł: "l", ı: "i" };
const slugify = (text: string) =>
  text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[ßæœøðđþłı]/g, (c) => PLAIN_LETTERS[c])
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const htmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Story = { text: string; title: string; tags: string[]; subject: string };

function parseStory(chunk: string, subject: string): Story | undefined {
  const text = chunk.trim();
  const sections: Record<string, string> = {};
  let current = "";
  for (const line of text.split("\n")) {
    const m = line.match(/^#+\s*([a-z-]+)\s*$/i);   // "#summary", or Markdown style "## Summary" (a few stories)
    if (m) {
      current = m[1].toLowerCase();
      sections[current] = "";
    } else if (current) {
      sections[current] += line + "\n";
    }
  }
  // like the page, take the first non-blank line (a record with no later headings has everything under #title)
  const title = sections["title"]?.split("\n").map((l) => l.trim()).find(Boolean);
  if (!title) return undefined;
  const tags = (sections["tags"] ?? "").split(/[,\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!sections["summary"]) warn(`"${title}" (${subject}) has no #summary section`);
  return { text, title, tags, subject };
}

async function walk(dir: string, match = /\.md$/): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, match)));
    else if (match.test(entry.name)) out.push(full);
  }
  return out;
}

// A node in the output tree; `stories` are those filed at that level. A settlement's story files
// sit beside its region's; its directory holds only its index page.
type Node = { name: string; dir: string; isPlace: boolean; children: Map<string, Node>; stories: Story[] };
const child = (parent: Node, name: string, isPlace = false): Node => {
  const key = name.toLowerCase();
  let node = parent.children.get(key);
  if (!node) {
    node = { name, dir: isPlace ? parent.dir : path.join(parent.dir, dirName(name)), isPlace, children: new Map(), stories: [] };
    parent.children.set(key, node);
  }
  return node;
};

const root: Node = { name: "", dir: outRoot, isPlace: false, children: new Map(), stories: [] };
for (const c of CONTINENTS) child(root, c);

const sourceDirs = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && /-target(s|-data)$/.test(e.name))
  .map((e) => e.name)
  .sort();
let storyCount = 0;
for (const sourceDir of sourceDirs) {
  const subject = sourceDir.replace(/(-data)?-targets$|-target-data$/, "");
  for (const file of await walk(path.join(sourceRoot, sourceDir))) {
    const stories = (await readFile(file, "utf8"))
      .split(/^---\s*$/m)
      .map((chunk) => parseStory(chunk, subject))
      .filter((s): s is Story => !!s);
    if (!stories.length) continue;
    const filing = parseName(path.basename(file, ".md"));
    if (!filing) {
      warn(`skipped ${stories.length} stories in ${path.relative(sourceRoot, file)}`);
      continue;
    }
    let node = child(child(root, filing.continent), filing.country);
    if (filing.region) node = child(node, filing.region);
    if (filing.place) node = child(node, filing.place, true);
    node.stories.push(...stories);
    storyCount += stories.length;
  }
}

const isHidden = (s: Story) => s.tags.includes("skip") || s.tags.includes("duplicate") || s.tags.includes("invalid");
// A place is listed by its parent only if it, or something under it, has a story to show.
const hasPage = (n: Node): boolean => n.stories.some((s) => !isHidden(s)) || [...n.children.values()].some(hasPage);
type Link = { title: string; href: string };

const HOME_TAGLINE = "A gazetteer of folklore, filed by place";
const HOME_TEXT = [
  "Here are set down the tales of the land: of wells and hollow hills, of drowned bells and things that walk the old roads at dusk. Each story is filed by the place where it was told, from the whole world down to a single village.",
  "Choose a realm from the list to begin.",
];

// The address of a page: a story has no ".html", a place ends in "/".
const urlOf = (parts: string[]) => STORIES_URL + parts.map(encodeURIComponent).join("/");
const placeTitle = (name: string) => fileName(name).replace(/_/g, " ");
// A paragraph, with *asterisks* as italics (rsc/js/site.js puts them back to draw the page).
const inline = (text: string) => text.split(/\*([^*]+)\*/).map((part, i) => (i % 2 ? `<em>${htmlEscape(part)}</em>` : htmlEscape(part))).join("");
const paragraphs = (text: string) => text.trim().split(/\n\s*\n/).filter(Boolean);
// A list of links, one to a line, at the given indent.
const linkList = (open: string, close: string, links: Link[], at: string) =>
  links.length ? [at + open, ...links.map((l) => `${at}  <li><a href="${htmlEscape(l.href)}">${htmlEscape(l.title)}</a></li>`), at + close].join("\n") : at + open + close;
// The page's main view, one element to a line.
const article = (attrs: string, ...lines: string[]) => [`      <article id="view" class="story" ${attrs}>`, ...lines.filter(Boolean), "      </article>"].join("\n");

// A story's sections, read as the headings fall: any heading line starts a section.
function storySections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#+\s*(.*)$/);
    if (m) {
      current = m[1].trim().toLowerCase();
      sections[current] = "";
    } else if (current) {
      sections[current] += line + "\n";
    }
  }
  return sections;
}

function describe(text: string): string {
  const flat = text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (flat.length <= 155) return flat;
  return flat.slice(0, 155).replace(/\s+\S*$/, "") + "…";
}

// Every page: the content is plain HTML, so it can be read without JavaScript. rsc/js/bootstrap.js, first in the body,
// hides it and adds everything else a page needs (the scripts, the fonts); rsc/js/site.js redraws it, reading it back
// with readPage().
function page(o: { title: string; description: string; url: string; crumbs: Link[]; menu: Link[]; view: string; noindex?: boolean; script?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(o.title)}</title>
  <meta name="description" content="${htmlEscape(o.description)}">
${o.noindex ? `  <meta name="robots" content="noindex">` : `  <link rel="canonical" href="${htmlEscape(SITE + o.url)}">`}
${o.script ? `  <script>\n    ${o.script}\n  </script>\n` : ""}  <link rel="stylesheet" href="/rsc/site.css">
</head>
<body>
  <script src="/rsc/js/bootstrap.js"></script>
  <div class="layout">
    <aside aria-label="Options at this level">
      <nav class="breadcrumb-panel" aria-label="Breadcrumb">
${linkList(`<ol id="breadcrumb-panel-list">`, "</ol>", o.crumbs, "        ")}
      </nav>
      <div id="tag-image"></div>
${linkList(`<ul class="realms" id="options">`, "</ul>", o.menu, "      ")}
    </aside>
    <main>
${o.view}
    </main>
  </div>
</body>
</html>
`;
}

function storyPage(s: Story, url: string, crumbs: Link[], menu: Link[]): string {
  const sections = storySections(s.text);
  const block = (name: string, heading: string) =>
    sections[name]?.trim() ? [`        <div class="${name}">`, `          <h2>${heading}</h2>`, ...paragraphs(sections[name]).map((p) => `          <p>${inline(p)}</p>`), "        </div>"].join("\n") : "";
  return page({
    title: `${s.title} — Wyrd Wiki`,
    description: describe(sections["summary"] ?? "") || s.title,
    url, crumbs, menu,
    view: article(`data-page="story" data-tags="${htmlEscape(s.tags.join(", "))}"`, `        <h1>${htmlEscape(s.title)}</h1>`, block("summary", "Summary"), block("details", "Details")),
  });
}

function placePage(title: string, url: string, crumbs: Link[], menu: Link[], tales: Link[], hint: string): string {
  return page({
    title: `${title} — Wyrd Wiki`,
    description: `Folklore of ${title}: a gazetteer of tales, filed by place.`,
    url, crumbs, menu,
    view: article(`data-page="place"`, `        <h1>${htmlEscape(title)}</h1>`, hint && `        <p class="hint">${hint}</p>`,
      tales.length ? `        <h2>Tales of ${htmlEscape(title)}</h2>\n${linkList(`<ul class="realms">`, "</ul>", tales, "        ")}` : ""),
  });
}

const files = new Map<string, string>();
const stats = { storiesFiled: 0, visible: 0, numbered: 0, places: 0 };
// Hidden stories get a .md but no page. They are named last, so they never move a page's address.
const hiddenStories: { story: Story; dir: string; names: Set<string> }[] = [];

// A file name for a story in a directory, numbered if it is taken. `used` also holds the names of the directories there,
// so a story can't take a place's address (GitHub Pages can't tell /norfolk/norwich the story from norwich/ the place).
function storyName(title: string, used: Set<string>): string {
  const base = slugify(title) || "story";
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  if (name !== base) stats.numbered++;
  used.add(name);
  return name;
}

// `crumbs` lead to the node's parent; `used` is the file names taken in the directory its stories go in.
function emit(node: Node, urlParts: string[], crumbs: Link[], used: Set<string>) {
  const kids = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const own = [...new Map(node.stories.map((s) => [s.text, s])).values()].sort(
    (a, b) => a.title.localeCompare(b.title) || a.subject.localeCompare(b.subject),
  );
  stats.storiesFiled += own.length;

  const here = node.name ? [...urlParts, dirName(node.name)] : [];
  const url = node.name ? urlOf(here) + "/" : "/";
  const inHere = node.name ? [...crumbs, { title: placeTitle(node.name), href: url }] : [{ title: "Wyrd Wiki", href: "/" }];
  const names = node.isPlace ? used : new Set(["index", ...kids.map((k) => dirName(k.name))]);
  // A place's stories sit beside its parent's, so their addresses leave out the place.
  const storyDir = node.isPlace ? urlParts : here;
  const tales = own.filter((s) => !isHidden(s)).map((s) => {
    const name = storyName(s.title, names);
    return { story: s, name, link: { title: s.title, href: urlOf([...storyDir, name]) } };
  });
  for (const t of tales) files.set(path.join(node.dir, `${t.name}.md`), t.story.text + "\n");
  for (const s of own.filter(isHidden)) hiddenStories.push({ story: s, dir: node.dir, names });
  const taleLinks = tales.map((t) => t.link);
  stats.visible += tales.length;

  if (node.isPlace) {
    if (!tales.length) return;
    for (const t of tales) {
      const menu = taleLinks.filter((l) => l !== t.link);
      files.set(path.join(node.dir, `${t.name}.html`), storyPage(t.story, t.link.href, inHere, menu));
    }
    files.set(path.join(node.dir, dirName(node.name), "index.html"), placePage(placeTitle(node.name), url, crumbs, taleLinks, [], "Choose a story from the list."));
    stats.places++;
    return;
  }

  // A country or region's own tales are listed in the main area of its page; once one is open they join the menu.
  const listed = (node.name ? kids.filter(hasPage) : kids).map((k) => ({ title: placeTitle(k.name), href: urlOf([...here, dirName(k.name)]) + "/" }));
  for (const t of tales) {
    const menu = [...listed, ...taleLinks.filter((l) => l !== t.link)];
    files.set(path.join(node.dir, `${t.name}.html`), storyPage(t.story, t.link.href, inHere, menu));
  }
  if (!node.name) {
    const view = article(`data-page="home"`, "        <h1>Wyrd Wiki</h1>", `        <p class="subtitle">${htmlEscape(HOME_TAGLINE)}</p>`,
      ["        <div class=\"summary\">", ...HOME_TEXT.map((p) => `          <p>${inline(p)}</p>`), "        </div>"].join("\n"));
    files.set(path.join(siteRoot, "index.html"), page({ title: "Wyrd Wiki", description: HOME_TAGLINE, url, crumbs: [], menu: listed, view, script: OLD_ADDRESS_REDIRECT }));
    files.set(path.join(siteRoot, "404.html"), page({
      title: "Nothing found here — Wyrd Wiki", description: "That place is not in the gazetteer.", url: "/", crumbs: inHere, menu: listed, noindex: true,
      view: article(`data-page="missing"`, "        <h1>Nothing found here</h1>", `        <p class="hint">That place is not in the gazetteer.</p>`),
    }));
  } else if (listed.length || tales.length || CONTINENTS.includes(node.name)) {
    const hint = tales.length ? (listed.length ? "Choose a place from the list, or one of the tales below." : "") : listed.length ? "Choose a place from the list." : "";
    files.set(path.join(node.dir, "index.html"), placePage(placeTitle(node.name), url, crumbs, listed, taleLinks, hint));
    stats.places++;
  }
  for (const k of kids) emit(k, here, inHere, names);
}
emit(root, [], [], new Set());
for (const { story, dir, names } of hiddenStories) files.set(path.join(dir, `${storyName(story.title, names)}.md`), story.text + "\n");

// The mirabilia are written by hand: each docs/mirabilia/<group>/<name>.md makes the page beside it.
const mirabilia = (await walk(path.join(siteRoot, "mirabilia"), /\.md$/).catch(() => [])).sort();
const entries: { file: string; parts: string[]; story: Story }[] = [];
for (const file of mirabilia) {
  const story = parseStory(await readFile(file, "utf8"), "mirabilia");
  if (story) entries.push({ file, parts: path.relative(siteRoot, file).replace(/\.md$/, "").split(path.sep), story });
  else warn(`${path.relative(siteRoot, file)} has no #title`);
}
for (const { file, parts, story } of entries) {
  const folders = parts.slice(0, -1);
  const crumbs = [{ title: "Wyrd Wiki", href: "/" }, ...folders.map((f, i) => ({ title: titleCase(f.replace(/-/g, " ")), href: urlOf(folders.slice(0, i + 1)) + "/" }))];
  const menu = entries.filter((e) => e.file !== file && path.dirname(e.file) === path.dirname(file)).map((e) => ({ title: e.story.title, href: urlOf(e.parts) }));
  files.set(file.replace(/\.md$/, ".html"), storyPage(story, urlOf(parts), crumbs, menu));
}

// Report and write.
// only the continent folders: the rest of docs is not generated
const existing = (await Promise.all(CONTINENTS.map((c) => walk(path.join(outRoot, dirName(c)), /\.(md|xml|html)$/).catch(() => [])))).flat();
let written = 0;
let changed = 0;
for (const [file, content] of [...files].sort()) {
  const old = existsSync(file) ? await readFile(file, "utf8") : undefined;
  if (old === content) continue;
  changed++;
  if (!dryRun) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    written++;
  }
}

// Everything in the continent folders is generated, so what this run didn't produce has gone from the source.
const orphans = existing.filter((f) => !files.has(f));
if (!dryRun) for (const f of orphans) await rm(f);
console.log(`${storyCount} stories read from ${sourceDirs.length} subjects, ${stats.storiesFiled} filed after removing identical copies`);
console.log(`${stats.visible} story pages, ${hiddenStories.length} hidden stories with no page, ${stats.numbered} numbered because the name was taken`);
console.log(`${stats.places} place pages`);
console.log(`${files.size} files generated, ${changed} ${dryRun ? "would change" : "written"}`);
if (orphans.length) console.log(`${orphans.length} old files ${dryRun ? "would be removed" : "removed"}`);
if (warnings.length) console.log(`warnings:\n  ${warnings.join("\n  ")}`);
