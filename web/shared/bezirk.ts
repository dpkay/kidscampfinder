// Maps municipality strings (as stored in the dataset, noise and all) to the Swiss district
// (Bezirk). Canton Zürich has 12 Bezirke; non-ZH municipalities are bucketed under
// "Ausserkanton (<canton>)" — which doubles as a canton filter.
//
// Two layers (built by a research subagent):
//   RAW       — exact dataset strings (incl. scraper noise) → resolved municipality.
//   GAZETTEER — every ZH municipality → its Bezirk, so future/unseen ZH communes resolve
//               via a cleaning fallback without needing a code change.

interface BezirkInfo {
  clean: string;
  canton: string;
  bezirk: string;
  inZH: boolean;
}

const RAW: Record<string, BezirkInfo> = {
  "Aadorf": { clean: "Aadorf", canton: "TG", bezirk: "Münchwilen", inZH: false },
  "Aathal": { clean: "Seegräben", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Adliswil": { clean: "Adliswil", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Aesch": { clean: "Aesch", canton: "ZH", bezirk: "Dietikon", inZH: true },
  "Aesch bei Neftenbach": { clean: "Neftenbach", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Affoltern am Albis": { clean: "Affoltern am Albis", canton: "ZH", bezirk: "Affoltern", inZH: true },
  "Albisriederstrasse 226": { clean: "Zürich", canton: "ZH", bezirk: "Zürich", inZH: true },
  "Alte Schule": { clean: "", canton: "", bezirk: "", inZH: false },
  "Bachenbülach": { clean: "Bachenbülach", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Bassersdorf": { clean: "Bassersdorf", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Bauma": { clean: "Bauma", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Benzenschwil": { clean: "Merenschwand", canton: "AG", bezirk: "Muri", inZH: false },
  "Beringen": { clean: "Beringen", canton: "SH", bezirk: "Schaffhausen", inZH: false },
  "Bonstetten": { clean: "Bonstetten", canton: "ZH", bezirk: "Affoltern", inZH: true },
  "Bubikon": { clean: "Bubikon", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Buchs": { clean: "Buchs", canton: "ZH", bezirk: "Dielsdorf", inZH: true },
  "Bäretswil": { clean: "Bäretswil", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Bülach": { clean: "Bülach", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Cham": { clean: "Cham", canton: "ZG", bezirk: "", inZH: false },
  "Dielsdorf": { clean: "Dielsdorf", canton: "ZH", bezirk: "Dielsdorf", inZH: true },
  "Dietikon": { clean: "Dietikon", canton: "ZH", bezirk: "Dietikon", inZH: true },
  "Dietlikon": { clean: "Dietlikon", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Dorf ZH": { clean: "Dorf", canton: "ZH", bezirk: "Andelfingen", inZH: true },
  "Dübendorf": { clean: "Dübendorf", canton: "ZH", bezirk: "Uster", inZH: true },
  "Effretikon": { clean: "Illnau-Effretikon", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Eglisau": { clean: "Eglisau", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Elgg": { clean: "Elgg", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Elsau": { clean: "Elsau", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Eschenbach": { clean: "Eschenbach", canton: "SG", bezirk: "See-Gaster", inZH: false },
  "Eschenbach SG": { clean: "Eschenbach", canton: "SG", bezirk: "See-Gaster", inZH: false },
  "Eschlikon": { clean: "Eschlikon", canton: "TG", bezirk: "Münchwilen", inZH: false },
  "Fehraltorf": { clean: "Fehraltorf", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Feldbach": { clean: "Hombrechtikon", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Feusisberg": { clean: "Feusisberg", canton: "SZ", bezirk: "Höfe", inZH: false },
  "Fischenthal": { clean: "Fischenthal", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Frauenfeld": { clean: "Frauenfeld", canton: "TG", bezirk: "Frauenfeld", inZH: false },
  "Fällanden": { clean: "Fällanden", canton: "ZH", bezirk: "Uster", inZH: true },
  "Fällanden Preis": { clean: "Fällanden", canton: "ZH", bezirk: "Uster", inZH: true },
  "Galgenen": { clean: "Galgenen", canton: "SZ", bezirk: "March", inZH: false },
  "Glattbrugg": { clean: "Opfikon", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Gossau ZH": { clean: "Gossau", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Grafstal": { clean: "Lindau", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Greifensee": { clean: "Greifensee", canton: "ZH", bezirk: "Uster", inZH: true },
  "Hettlingen": { clean: "Hettlingen", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Hinwil": { clean: "Hinwil", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Hittnau": { clean: "Hittnau", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Hombrechtikon": { clean: "Hombrechtikon", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Horgen": { clean: "Horgen", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Horgen bei der Glassammelstelle": { clean: "Horgen", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Hünenberg": { clean: "Hünenberg", canton: "ZG", bezirk: "", inZH: false },
  "Illnau-Effretikon": { clean: "Illnau-Effretikon", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Kemptthal": { clean: "Lindau", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Kreis 6": { clean: "Zürich", canton: "ZH", bezirk: "Zürich", inZH: true },
  "Küsnacht": { clean: "Küsnacht", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Lachen": { clean: "Lachen", canton: "SZ", bezirk: "March", inZH: false },
  "Langnau am Albis": { clean: "Langnau am Albis", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Lengnau AG": { clean: "Lengnau", canton: "AG", bezirk: "Zurzach", inZH: false },
  "Marthalen": { clean: "Marthalen", canton: "ZH", bezirk: "Andelfingen", inZH: true },
  "Meilen": { clean: "Meilen", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Menzingen": { clean: "Menzingen", canton: "ZG", bezirk: "", inZH: false },
  "Mettmenstetten": { clean: "Mettmenstetten", canton: "ZH", bezirk: "Affoltern", inZH: true },
  "Mutschellen": { clean: "Berikon", canton: "AG", bezirk: "Bremgarten", inZH: false },
  "Männedorf": { clean: "Männedorf", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Neerach": { clean: "Neerach", canton: "ZH", bezirk: "Dielsdorf", inZH: true },
  "Neftenbach": { clean: "Neftenbach", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Neftenbach Kursort im Wald oberhalb Ödenhof mit anschliessendem Grillieren bei der Eichliwald Hütte": { clean: "Neftenbach", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Neuheim": { clean: "Neuheim", canton: "ZG", bezirk: "", inZH: false },
  "Niederhasli": { clean: "Niederhasli", canton: "ZH", bezirk: "Dielsdorf", inZH: true },
  "Niederweningen": { clean: "Niederweningen", canton: "ZH", bezirk: "Dielsdorf", inZH: true },
  "Oberengstringen": { clean: "Oberengstringen", canton: "ZH", bezirk: "Dietikon", inZH: true },
  "Oberrieden": { clean: "Oberrieden", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Oetwil am See": { clean: "Oetwil am See", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Ohringen": { clean: "Neftenbach", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Ossingen": { clean: "Ossingen", canton: "ZH", bezirk: "Andelfingen", inZH: true },
  "Ottenbach": { clean: "Ottenbach", canton: "ZH", bezirk: "Affoltern", inZH: true },
  "Pfungen": { clean: "Pfungen", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Pfäffikon": { clean: "Pfäffikon", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Pfäffikon SZ": { clean: "Freienbach", canton: "SZ", bezirk: "Höfe", inZH: false },
  "Rafz": { clean: "Rafz", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Rapperswil SG": { clean: "Rapperswil-Jona", canton: "SG", bezirk: "See-Gaster", inZH: false },
  "Rapperswil-Jona": { clean: "Rapperswil-Jona", canton: "SG", bezirk: "See-Gaster", inZH: false },
  "Regensdorf": { clean: "Regensdorf", canton: "ZH", bezirk: "Dielsdorf", inZH: true },
  "Richterswil": { clean: "Richterswil", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Rickenbach Preis": { clean: "Rickenbach", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Rickenbach-Sulz": { clean: "Rickenbach", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Romanshorn": { clean: "Romanshorn", canton: "TG", bezirk: "Arbon", inZH: false },
  "Russikon": { clean: "Russikon", canton: "ZH", bezirk: "Pfäffikon", inZH: true },
  "Rümlang": { clean: "Rümlang", canton: "ZH", bezirk: "Dielsdorf", inZH: true },
  "Rüschlikon": { clean: "Rüschlikon", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Rüti": { clean: "Rüti", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Schlieren": { clean: "Schlieren", canton: "ZH", bezirk: "Dietikon", inZH: true },
  "Schmerikon": { clean: "Schmerikon", canton: "SG", bezirk: "See-Gaster", inZH: false },
  "Schwerzenbach": { clean: "Schwerzenbach", canton: "ZH", bezirk: "Uster", inZH: true },
  "Sekundarschule Birmensdorf-Aesch": { clean: "Birmensdorf", canton: "ZH", bezirk: "Dietikon", inZH: true },
  "Seon": { clean: "Seon", canton: "AG", bezirk: "Lenzburg", inZH: false },
  "Seuzach": { clean: "Seuzach", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Sins": { clean: "Sins", canton: "AG", bezirk: "Muri", inZH: false },
  "Sportcenter Schumacher": { clean: "Dübendorf", canton: "ZH", bezirk: "Uster", inZH: true },
  "Stein am Rhein": { clean: "Stein am Rhein", canton: "SH", bezirk: "Stein", inZH: false },
  "Stäfa": { clean: "Stäfa", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Thalwil": { clean: "Thalwil", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Thalwil Erdgeschoss": { clean: "Thalwil", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Turbenthal": { clean: "Turbenthal", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Uesslingen": { clean: "Uesslingen-Buch", canton: "TG", bezirk: "Frauenfeld", inZH: false },
  "Uesslingen - Iselisberg": { clean: "Uesslingen-Buch", canton: "TG", bezirk: "Frauenfeld", inZH: false },
  "Uetikon am See": { clean: "Uetikon am See", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Urdorf": { clean: "Urdorf", canton: "ZH", bezirk: "Dietikon", inZH: true },
  "Uster": { clean: "Uster", canton: "ZH", bezirk: "Uster", inZH: true },
  "Volketswil": { clean: "Volketswil", canton: "ZH", bezirk: "Uster", inZH: true },
  "Waldhütte Ziegelhöhe": { clean: "Zürich", canton: "ZH", bezirk: "Zürich", inZH: true },
  "Wallisellen": { clean: "Wallisellen", canton: "ZH", bezirk: "Bülach", inZH: true },
  "Wangen (SZ)": { clean: "Wangen", canton: "SZ", bezirk: "March", inZH: false },
  "Wettswil am Albis": { clean: "Wettswil am Albis", canton: "ZH", bezirk: "Affoltern", inZH: true },
  "Wetzikon": { clean: "Wetzikon", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Widen": { clean: "Widen", canton: "AG", bezirk: "Bremgarten", inZH: false },
  "Winterthur": { clean: "Winterthur", canton: "ZH", bezirk: "Winterthur", inZH: true },
  "Wolfhausen": { clean: "Bubikon", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Wolfhausen ZH": { clean: "Bubikon", canton: "ZH", bezirk: "Hinwil", inZH: true },
  "Wollerau": { clean: "Wollerau", canton: "SZ", bezirk: "Höfe", inZH: false },
  "Wädenswil": { clean: "Wädenswil", canton: "ZH", bezirk: "Horgen", inZH: true },
  "Wängi": { clean: "Wängi", canton: "TG", bezirk: "Münchwilen", inZH: false },
  "Zollikerberg": { clean: "Zollikon", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Zollikon": { clean: "Zollikon", canton: "ZH", bezirk: "Meilen", inZH: true },
  "Zug": { clean: "Zug", canton: "ZG", bezirk: "", inZH: false },
  "Zürich": { clean: "Zürich", canton: "ZH", bezirk: "Zürich", inZH: true },
  "Zürich Eingang im Erdgeschoss": { clean: "Zürich", canton: "ZH", bezirk: "Zürich", inZH: true },
  "Zürich Eingang ist im Erdgeschoss": { clean: "Zürich", canton: "ZH", bezirk: "Zürich", inZH: true },
  "Öhningen": { clean: "Öhningen", canton: "DE", bezirk: "Landkreis Konstanz", inZH: false },
};

// Every Canton Zürich municipality → its Bezirk. Fallback for strings not in RAW.
const GAZETTEER: Record<string, string> = {
  "Aeugst am Albis": "Affoltern", "Affoltern am Albis": "Affoltern", "Bonstetten": "Affoltern",
  "Hausen am Albis": "Affoltern", "Hedingen": "Affoltern", "Kappel am Albis": "Affoltern",
  "Knonau": "Affoltern", "Maschwanden": "Affoltern", "Mettmenstetten": "Affoltern",
  "Obfelden": "Affoltern", "Ottenbach": "Affoltern", "Rifferswil": "Affoltern",
  "Stallikon": "Affoltern", "Wettswil am Albis": "Affoltern",
  "Andelfingen": "Andelfingen", "Adlikon": "Andelfingen", "Benken": "Andelfingen",
  "Berg am Irchel": "Andelfingen", "Buch am Irchel": "Andelfingen", "Dachsen": "Andelfingen",
  "Dorf": "Andelfingen", "Feuerthalen": "Andelfingen", "Flaach": "Andelfingen",
  "Flurlingen": "Andelfingen", "Henggart": "Andelfingen", "Kleinandelfingen": "Andelfingen",
  "Laufen-Uhwiesen": "Andelfingen", "Marthalen": "Andelfingen", "Ossingen": "Andelfingen",
  "Rheinau": "Andelfingen", "Stammheim": "Andelfingen", "Thalheim an der Thur": "Andelfingen",
  "Trüllikon": "Andelfingen", "Truttikon": "Andelfingen", "Volken": "Andelfingen",
  "Bachenbülach": "Bülach", "Bassersdorf": "Bülach", "Bülach": "Bülach", "Dietlikon": "Bülach",
  "Eglisau": "Bülach", "Embrach": "Bülach", "Freienstein-Teufen": "Bülach", "Glattfelden": "Bülach",
  "Hochfelden": "Bülach", "Höri": "Bülach", "Hüntwangen": "Bülach", "Kloten": "Bülach",
  "Lufingen": "Bülach", "Nürensdorf": "Bülach", "Oberembrach": "Bülach", "Opfikon": "Bülach",
  "Rafz": "Bülach", "Rorbas": "Bülach", "Wallisellen": "Bülach", "Wasterkingen": "Bülach",
  "Wil": "Bülach", "Winkel": "Bülach",
  "Bachs": "Dielsdorf", "Boppelsen": "Dielsdorf", "Buchs": "Dielsdorf", "Dällikon": "Dielsdorf",
  "Dänikon": "Dielsdorf", "Dielsdorf": "Dielsdorf", "Hüttikon": "Dielsdorf", "Neerach": "Dielsdorf",
  "Niederglatt": "Dielsdorf", "Niederhasli": "Dielsdorf", "Niederweningen": "Dielsdorf",
  "Oberglatt": "Dielsdorf", "Oberweningen": "Dielsdorf", "Otelfingen": "Dielsdorf",
  "Regensberg": "Dielsdorf", "Regensdorf": "Dielsdorf", "Rümlang": "Dielsdorf",
  "Schleinikon": "Dielsdorf", "Schöfflisdorf": "Dielsdorf", "Stadel": "Dielsdorf",
  "Steinmaur": "Dielsdorf", "Weiach": "Dielsdorf",
  "Aesch": "Dietikon", "Birmensdorf": "Dietikon", "Dietikon": "Dietikon", "Geroldswil": "Dietikon",
  "Oberengstringen": "Dietikon", "Oetwil an der Limmat": "Dietikon", "Schlieren": "Dietikon",
  "Uitikon": "Dietikon", "Unterengstringen": "Dietikon", "Urdorf": "Dietikon", "Weiningen": "Dietikon",
  "Bäretswil": "Hinwil", "Bubikon": "Hinwil", "Dürnten": "Hinwil", "Fischenthal": "Hinwil",
  "Gossau": "Hinwil", "Grüningen": "Hinwil", "Hinwil": "Hinwil", "Rüti": "Hinwil",
  "Seegräben": "Hinwil", "Wald": "Hinwil", "Wetzikon": "Hinwil",
  "Adliswil": "Horgen", "Hirzel": "Horgen", "Horgen": "Horgen", "Hütten": "Horgen",
  "Kilchberg": "Horgen", "Langnau am Albis": "Horgen", "Oberrieden": "Horgen",
  "Richterswil": "Horgen", "Rüschlikon": "Horgen", "Schönenberg": "Horgen", "Thalwil": "Horgen",
  "Wädenswil": "Horgen",
  "Erlenbach": "Meilen", "Herrliberg": "Meilen", "Hombrechtikon": "Meilen", "Küsnacht": "Meilen",
  "Männedorf": "Meilen", "Meilen": "Meilen", "Oetwil am See": "Meilen", "Stäfa": "Meilen",
  "Uetikon am See": "Meilen", "Zollikon": "Meilen", "Zumikon": "Meilen",
  "Bauma": "Pfäffikon", "Fehraltorf": "Pfäffikon", "Hittnau": "Pfäffikon",
  "Illnau-Effretikon": "Pfäffikon", "Lindau": "Pfäffikon", "Pfäffikon": "Pfäffikon",
  "Russikon": "Pfäffikon", "Weisslingen": "Pfäffikon", "Wila": "Pfäffikon", "Wildberg": "Pfäffikon",
  "Dübendorf": "Uster", "Egg": "Uster", "Fällanden": "Uster", "Greifensee": "Uster",
  "Maur": "Uster", "Mönchaltorf": "Uster", "Schwerzenbach": "Uster", "Uster": "Uster",
  "Volketswil": "Uster", "Wangen-Brüttisellen": "Uster",
  "Altikon": "Winterthur", "Brütten": "Winterthur", "Dägerlen": "Winterthur",
  "Dättlikon": "Winterthur", "Dinhard": "Winterthur", "Elgg": "Winterthur",
  "Ellikon an der Thur": "Winterthur", "Elsau": "Winterthur", "Hagenbuch": "Winterthur",
  "Hettlingen": "Winterthur", "Neftenbach": "Winterthur", "Pfungen": "Winterthur",
  "Rickenbach": "Winterthur", "Schlatt": "Winterthur", "Seuzach": "Winterthur",
  "Turbenthal": "Winterthur", "Wiesendangen": "Winterthur", "Winterthur": "Winterthur",
  "Zell": "Winterthur",
  "Zürich": "Zürich",
};

// The 12 Canton Zürich districts, canonical order; Ausserkanton/Unbekannt buckets sort last.
export const ZH_BEZIRKE = [
  "Affoltern", "Andelfingen", "Bülach", "Dielsdorf", "Dietikon", "Hinwil",
  "Horgen", "Meilen", "Pfäffikon", "Uster", "Winterthur", "Zürich",
];

export interface CommuneInfo {
  clean: string;
  bezirk: string; // ZH Bezirk, or "Ausserkanton (TG)" etc., or "Unbekannt"
  inZH: boolean;
}

function display(info: BezirkInfo): CommuneInfo {
  return {
    clean: info.clean || "—",
    bezirk: info.inZH ? info.bezirk : `Ausserkanton (${info.canton})`,
    inZH: info.inZH,
  };
}

// Try to recover a ZH municipality from a noisy string by matching the gazetteer against
// progressively shorter leading prefixes (suffix noise like "Uster Turnhalle" → "Uster").
function gazetteerFallback(raw: string): CommuneInfo | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (GAZETTEER[cleaned]) return { clean: cleaned, bezirk: GAZETTEER[cleaned], inZH: true };
  const words = cleaned.split(/[\s,]+/);
  for (let i = words.length - 1; i >= 1; i--) {
    const cand = words.slice(0, i).join(" ");
    if (GAZETTEER[cand]) return { clean: cand, bezirk: GAZETTEER[cand], inZH: true };
  }
  return null;
}

export function communeInfo(raw: string | null): CommuneInfo | null {
  if (!raw) return null;
  const hit = RAW[raw];
  if (hit) {
    if (!hit.clean) return { clean: raw, bezirk: "Unbekannt", inZH: false };
    return display(hit);
  }
  const fb = gazetteerFallback(raw);
  if (fb) return fb;
  return { clean: raw, bezirk: "Unbekannt", inZH: false };
}

export function bezirkSortKey(b: string): string {
  const i = ZH_BEZIRKE.indexOf(b);
  if (i >= 0) return `0${String(i).padStart(2, "0")}`;
  if (b.startsWith("Ausserkanton")) return `1${b}`;
  return `2${b}`;
}
