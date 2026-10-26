// Rebuilds data/stories from the research data in the local-llm-agent project.
//
//   bun tools/import-stories.ts [--source ~/projects/local-llm-agent] [--dry-run]
//
// Every `<subject>-data-targets/**/*.md` there holding stories is read, filed
// by its file name (see parseName), and written under data/stories as place
// files plus sitemaps. See "Importing stories" in README.md.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sourceArg = args.indexOf("--source");
const sourceRoot =
  sourceArg >= 0 ? args[sourceArg + 1] : path.join(homedir(), "projects", "local-llm-agent");
const outRoot = path.join(import.meta.dir, "..", "data", "stories");

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
const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Story = { text: string; title: string; tags: string[]; subject: string };

function parseStory(chunk: string, subject: string): Story | undefined {
  const text = chunk.trim();
  const sections: Record<string, string> = {};
  let current = "";
  for (const line of text.split("\n")) {
    const m = line.match(/^#\s*([a-z-]+)\s*$/i);
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

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// A node in the output tree; `stories` are those filed at that level. A settlement has no directory
// of its own: its files sit beside its region's.
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

const sourceDirs = (await readdir(sourceRoot)).filter((n) => n.endsWith("-data-targets")).sort();
let storyCount = 0;
for (const sourceDir of sourceDirs) {
  const subject = sourceDir.replace(/-data-targets$/, "");
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

const isHidden = (s: Story) => s.tags.includes("skip") || s.tags.includes("duplicate");
// A place is listed by its parent only if it, or something under it, has a story to show.
const hasPage = (n: Node): boolean => n.stories.some((s) => !isHidden(s)) || [...n.children.values()].some(hasPage);
const sitemap = (kind: "urlset" | "sitemapindex", entries: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<${kind} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</${kind}>\n`;

const files = new Map<string, string>();
const stats = { storiesFiled: 0, visible: 0, repeats: 0 };

function emit(node: Node, urlParts: string[]) {
  const kids = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const stem = fileName(node.name);
  const own = [...new Map(node.stories.map((s) => [s.text, s])).values()].sort(
    (a, b) => a.title.localeCompare(b.title) || a.subject.localeCompare(b.subject),
  );
  if (own.length) {
    files.set(path.join(node.dir, `${stem}.md`), own.map((s) => s.text).join("\n\n---\n\n") + "\n");
    stats.storiesFiled += own.length;
  }
  // The same story found under two subjects is filed twice but listed once.
  const seen = new Set<string>();
  const urls = own.filter((s) => !isHidden(s)).flatMap((s) => {
    const slug = slugify(s.title);
    if (seen.has(slug)) {
      stats.repeats++;
      return [];
    }
    seen.add(slug);
    return [`  <url><loc>${xmlEscape(`/index.html?/${urlParts.join("/")}/${slug}`)}</loc></url>`];
  });
  stats.visible += urls.length;
  if (node.isPlace) {
    if (urls.length) files.set(path.join(node.dir, `${stem}.xml`), sitemap("urlset", urls));
    return;
  }
  // A country or region lists the sitemaps below it, then its own stories as <url> entries.
  const listed = kids.filter(hasPage);
  const loc = (k: Node) => (k.isPlace ? "" : `${dirName(k.name)}/`) + `${fileName(k.name)}.xml`;
  const entries = listed.map((k) => `  <sitemap><loc>${loc(k)}</loc></sitemap>`).concat(urls);
  if (!node.name) {
    files.set(path.join(node.dir, "sitemap.xml"), sitemap("sitemapindex", kids.map((k) => `  <sitemap><loc>${loc(k)}</loc></sitemap>`)));
  } else if (entries.length || CONTINENTS.includes(node.name)) {
    files.set(path.join(node.dir, `${stem}.xml`), sitemap("sitemapindex", entries));
  }
  for (const k of kids) emit(k, [...urlParts, dirName(k.name)]);
}
emit(root, []);

// Report and write.
const existing = existsSync(outRoot) ? (await walk(outRoot).catch(() => [])) : [];
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

const orphans = existing.filter((f) => !files.has(f));
console.log(`${storyCount} stories read from ${sourceDirs.length} subjects, ${stats.storiesFiled} filed after removing identical copies`);
console.log(`${stats.visible} stories listed in sitemaps`);
console.log(`${stats.repeats} repeats of a story in the same place are filed but not listed again`);
console.log(`${files.size} files generated, ${changed} ${dryRun ? "would change" : "written"}`);
if (orphans.length) console.log(`existing .md not produced by this run:\n  ${orphans.map((f) => path.relative(outRoot, f)).join("\n  ")}`);
if (warnings.length) console.log(`warnings:\n  ${warnings.join("\n  ")}`);
