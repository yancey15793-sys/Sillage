/**
 * SEED — Import des flux RSS depuis upload/flux_rss.txt
 * - Nettoie les URL (params de tracking), filtre les entrées invalides
 * - Déduplique
 * - Catégorise par heuristiques (9 catégories éditoriales)
 * - Insère en base (idempotent : skip les URL existantes)
 * Usage : bun scripts/seed-feeds.ts
 */
import { db } from "../src/lib/db";

const FILE = "/home/z/my-project/upload/flux_rss.txt";

/* ---------- Catégories ---------- */
export const CATS: Record<string, string> = {
  tech: "Technologie",
  geo: "Géopolitique",
  eco: "Économie",
  sci: "Science",
  enr: "Énergie",
  cul: "Culture",
  sport: "Sport",
  design: "Design & Dev",
  life: "Art de vivre",
};

/* ---------- Règles de catégorisation (ordre = spécificité décroissante) ---------- */
const RULES: [string, string][] = [
  // Multi-sections — règles fines d'abord
  ["reutersbest.com/topic/business-finance", "eco"],
  ["reutersbest.com/topic/markets", "eco"],
  ["reutersbest.com/topic/commodities-energy", "eco"],
  ["reutersbest.com/region", "geo"],
  ["dwh.lequipe.fr", "sport"],
  ["lemidiolympique", "sport"],
  ["bbc.co.uk/sport", "sport"],
  ["theguardian.com/football", "sport"],
  ["theguardian.com/sport/tennis", "sport"],
  ["nytimes.com/athletic", "sport"],
  ["lemonde.fr/geopolitique", "geo"],
  ["lemonde.fr/planete", "enr"],
  ["lemonde.fr/rss/une", "geo"],
  ["20minutes.fr/rss-monde", "geo"],
  ["20minutes.fr/rss-serie", "cul"],
  ["01net.com/actualites/cryptomonnaie", "eco"],
  ["01net.com/jeux-video", "cul"],
  ["journaldunet.com/business", "eco"],
  ["journaldunet.com/decideurs", "eco"],
  ["journaldunet.com/intelligence-artificielle", "tech"],
  ["presse-citron.net/category/crypto", "eco"],
  ["presse-citron.net/category/sciences", "sci"],
  ["presse-citron.net/category/startups", "eco"],
  ["huffingtonpost.fr/culture", "cul"],
  ["huffingtonpost.fr/ecologie", "enr"],
  ["huffingtonpost.fr/france", "geo"],
  ["huffingtonpost.fr/jeux-video", "cul"],
  ["huffingtonpost.fr/sante", "sci"],
  ["huffingtonpost.fr/science", "sci"],
  ["nouvelobs.com/a-la-une", "geo"],
  ["nouvelobs.com/culture", "cul"],
  ["nouvelobs.com/ecologie", "enr"],
  ["nouvelobs.com/jeux-video", "cul"],
  ["nouvelobs.com/sante", "sci"],
  ["nouvelobs.com/sciences", "sci"],
  ["lexpress.fr/rss/culture", "cul"],
  ["lexpress.fr/rss/economie", "eco"],
  ["lexpress.fr/rss/entrepreneurs", "eco"],
  ["lexpress.fr/rss/environnement", "enr"],
  ["lexpress.fr/rss/monde", "geo"],
  ["lexpress.fr/rss/sciences-sante", "sci"],
  ["nytimes.com/athletic", "sport"],
  ["rss.nytimes.com/Dealbook", "eco"],
  ["rss.nytimes.com/Economy", "eco"],
  ["rss.nytimes.com/EnergyEnvironment", "enr"],
  ["rss.nytimes.com/Europe", "geo"],
  ["rss.nytimes.com/HomePage", "geo"],
  ["rss.nytimes.com/Movies", "cul"],
  ["rss.nytimes.com/PersonalTech", "tech"],
  ["rss.nytimes.com/Space", "sci"],
  ["rss.nytimes.com/Technology", "tech"],
  ["rss.nytimes.com/World", "geo"],
  ["rss.nytimes.com/travel", "life"],
  ["nytimes.com/section/arts/music", "cul"],
  ["nytimes.com/section/food", "life"],
  ["nytimes.com/section/health", "sci"],
  ["washingtonpost.com/business/technology", "tech"],
  ["washingtonpost.com/entertainment", "cul"],
  ["washingtonpost.com/lifestyle", "life"],
  ["washingtonpost.com/world", "geo"],
  ["techcrunch.com/category/startups", "eco"],
  ["futura-sciences.com/rss/sante", "sci"],
  ["rfi.fr/tag/g", "geo"],
  ["rfi.fr/fr/monde", "geo"],
  ["rmcsport.bfmtv.com", "sport"],
  ["espn.com/espn/rss/soccer", "sport"],
  ["espn.com/espn/rss/tennis", "sport"],

  // Sport
  ["espn", "sport"], ["lequipe", "sport"], ["eurosport", "sport"], ["marca", "sport"],
  ["skysports", "sport"], ["bleacherreport", "sport"], ["theathletic", "sport"],
  ["hoopshype", "sport"], ["realgm", "sport"], ["basketsession", "sport"],
  ["planet-rugby", "sport"], ["ruck.co.uk", "sport"], ["rugbypass", "sport"],
  ["therugbypaper", "sport"], ["walesonline", "sport"], ["atptour", "sport"],
  ["tennismajors", "sport"], ["wtatennis", "sport"], ["formula1.com", "sport"],
  ["autosport", "sport"], ["motorsport", "sport"], ["f1technical", "sport"],
  ["grandprix.com", "sport"], ["fia.com", "sport"], ["cyclingnews", "sport"],
  ["velonews", "sport"], ["bikeradar", "sport"], ["sofoot", "sport"],

  // Design & Dev
  ["abduzeedo", "design"], ["alistapart", "design"], ["css-tricks", "design"],
  ["smashingmagazine", "design"], ["logrocket", "design"], ["sidebar.io", "design"],
  ["kottke", "design"], ["tympanus.net", "design"], ["itsnicethat", "design"],
  ["designshack", "design"], ["fastcompany", "design"], ["codrops", "design"],

  // Énergie & environnement
  ["climatechangenews", "enr"], ["goodplanet", "enr"], ["novethic", "enr"],
  ["vert.eco", "enr"], ["lefigaro", "eco"],

  // Science & santé
  ["medicalxpress", "sci"], ["sciencedaily", "sci"], ["statnews", "sci"],
  ["nature.com", "sci"], ["newscientist", "sci"], ["futura-sciences", "sci"],
  ["cnrs.fr", "sci"], ["sciencesetavenir", "sci"], ["nasa", "sci"], ["who.int", "sci"],
  ["lequotidiendumedecin", "sci"], ["cnrs", "sci"],

  // Culture
  ["cinefil", "cul"], ["jeuxactu", "cul"], ["allocine", "cul"], ["premiere.fr", "cul"],
  ["variety", "cul"], ["movieintheair", "cul"], ["fabula", "cul"], ["nme.com", "cul"],
  ["pitchfork", "cul"], ["billboard", "cul"], ["diffuser.fm", "cul"],
  ["telerama", "cul"], ["lesinrocks", "cul"], ["regard-est", "cul"],
  ["sputnikmusic", "cul"], ["kotaku", "cul"], ["eurogamer", "cul"],
  ["rockpapershotgun", "cul"], ["gamekult", "cul"], ["jeuxvideo.com", "cul"],
  ["actualitte", "cul"], ["altpress", "cul"], ["themarginalian", "cul"], ["ign.com", "cul"],

  // Art de vivre
  ["food52", "life"], ["epicurious", "life"], ["finedininglovers", "life"],
  ["saveur", "life"], ["seriouseats", "life"], ["lonelyplanet", "life"],
  ["cntraveler", "travel" === "life" ? "life" : "life"], ["nationalgeographic.com/travel", "life"],
  ["routard", "life"], ["geo.fr", "life"], ["atlasobscura", "life"], ["lefooding", "life"],

  // Économie & crypto
  ["hbr.org", "eco"], ["cepr.org", "eco"], ["economicsone", "eco"], ["benzinga", "eco"],
  ["bloomberg", "eco"], ["dowjones", "eco"], ["seekingalpha", "eco"],
  ["tradingeconomics", "eco"], ["investing.com", "eco"], ["nasdaq", "eco"],
  ["forbes", "eco"], ["challenges", "eco"], ["lesechos", "eco"], ["capital.fr", "eco"],
  ["boursorama", "eco"], ["economist", "eco"], ["ft.com", "eco"], ["cnbc", "eco"],
  ["bitcoinmagazine", "eco"], ["cointelegraph", "eco"], ["decrypt.co", "eco"],
  ["coindesk", "eco"], ["theblock.co", "eco"], ["entrepreneur.com", "eco"],
  ["fivethirtyeight", "eco"], ["nasdaq", "eco"],

  // Tech & IA
  ["arstechnica", "tech"], ["techcrunch", "tech"], ["theverge", "tech"],
  ["engadget", "tech"], ["wired.com", "tech"], ["zdnet", "tech"], ["cnet", "tech"],
  ["numerama", "tech"], ["01net", "tech"], ["tomshardware", "tech"], ["pcmag", "tech"],
  ["techradar", "tech"], ["extremetech", "tech"], ["next.ink", "tech"],
  ["silicon.fr", "tech"], ["ladn", "tech"], ["presse-citron", "tech"],
  ["geeky-gadgets", "tech"], ["hnrss", "tech"], ["ycombinator", "tech"],
  ["reddit", "tech"], ["arxiv", "tech"], ["bair.berkeley", "tech"],
  ["huggingface", "tech"], ["openai.com", "tech"], ["anthropic", "tech"],
  ["research.google", "tech"], ["thegradient", "tech"], ["marktechpost", "tech"],
  ["aiacceleratorinstitute", "tech"], ["ai-techpark", "tech"], ["elucid", "tech"],
  ["technologyreview", "tech"], ["nypost.com/business", "eco"],

  // Géopolitique & actualités internationales
  ["reuters", "geo"], ["reutersbest", "geo"], ["courrierinternational", "geo"],
  ["france24", "geo"], ["francetvinfo", "geo"], ["rfi.fr", "geo"],
  ["les-yeux-du-monde", "geo"], ["desk-russie", "geo"], ["opex360", "geo"],
  ["iris-france", "geo"], ["revueconflits", "geo"], ["legrandcontinent", "geo"],
  ["mediapart", "geo"], ["liberation", "geo"], ["humanite", "geo"], ["nypost", "geo"],
  ["actualitte", "cul"],
];

/* ---------- JUNK : URLs à ignorer ---------- */
const JUNK = ["exemple.com", "youtube.com/feeds/videos.xml?channel_id=", "youtube.com/feeds/videos.xml?playlist_id="];

/* ---------- Noms courts par domaine ---------- */
const PRETTY: [string, string][] = [
  ["lemonde.fr", "Le Monde"], ["lesechos.fr", "Les Échos"], ["lefigaro.fr", "Le Figaro"],
  ["lequipe.fr", "L'Équipe"], ["challenges.fr", "Challenges"], ["capital.fr", "Capital"],
  ["liberation.fr", "Libération"], ["mediapart.fr", "Mediapart"], ["humanite.fr", "L'Humanité"],
  ["francetvinfo.fr", "franceinfo"], ["france24.com", "France 24"], ["rfi.fr", "RFI"],
  ["courrierinternational.com", "Courrier International"], ["legrandcontinent.eu", "Le Grand Continent"],
  ["nouvelobs.com", "L'Obs"], ["lexpress.fr", "L'Express"], ["lesinrocks.com", "Les Inrocks"],
  ["telerama.fr", "Télérama"], ["numerama.com", "Numerama"], ["01net.com", "01net"],
  ["jeuxvideo.com", "Jeuxvideo.com"], ["gamekult.com", "Gamekult"], ["allocine.fr", "AlloCiné"],
  ["premiere.fr", "Première"], ["sciencesetavenir.fr", "Sciences et Avenir"],
  ["futura-sciences.com", "Futura Sciences"], ["cnrs.fr", "CNRS"], ["cnrtl", "CNRS"],
  ["huffingtonpost.fr", "Le HuffPost"], ["20minutes.fr", "20 Minutes"],
  ["novethic.fr", "Novethic"], ["vert.eco", "Vert.eco"], ["goodplanet.info", "GoodPlanet"],
  ["climatechangenews.com", "Climate Change News"], ["lequotidiendumedecin.fr", "Le Quotidien du Médecin"],
  ["medicalxpress.com", "Medical Xpress"], ["statnews.com", "STAT News"],
  ["newscientist.com", "New Scientist"], ["nature.com", "Nature"], ["sciencedaily.com", "ScienceDaily"],
  ["nasa.gov", "NASA"], ["who.int", "OMS"], ["arxiv.org", "arXiv (cs.AI)"],
  ["bair.berkeley.edu", "Berkeley BAIR"], ["huggingface.co", "Hugging Face"],
  ["openai.com", "OpenAI"], ["anthropic.com", "Anthropic"], ["research.google", "Google Research"],
  ["thegradient.pub", "The Gradient"], ["marktechpost.com", "MarkTechPost"],
  ["aiacceleratorinstitute.com", "AI Accelerator"], ["ai-techpark.com", "AI TechPark"],
  ["technologyreview.com", "MIT Tech Review"], ["extremetech.com", "ExtremeTech"],
  ["arstechnica.com", "Ars Technica"], ["techcrunch.com", "TechCrunch"],
  ["theverge.com", "The Verge"], ["engadget.com", "Engadget"], ["wired.com", "WIRED"],
  ["zdnet.fr", "ZDNet France"], ["cnet.com", "CNET"], ["pcmag.com", "PCMag"],
  ["techradar.com", "TechRadar"], ["tomshardware.com", "Tom's Hardware"],
  ["next.ink", "Next"], ["silicon.fr", "Silicon"], ["ladn.eu", "L'ADN"],
  ["presse-citron.net", "Presse-citron"], ["geeky-gadgets.com", "Geeky Gadgets"],
  ["journaldunet.com", "Journal du Net"], ["elucid.media", "Elucid Media"],
  ["bloomberg.com", "Bloomberg"], ["ft.com", "Financial Times"], ["economist.com", "The Economist"],
  ["cnbc.com", "CNBC"], ["benzinga.com", "Benzinga"], ["seekingalpha.com", "Seeking Alpha"],
  ["tradingeconomics.com", "Trading Economics"], ["investing.com", "Investing.com"],
  ["nasdaq.com", "Nasdaq"], ["forbes.com", "Forbes"], ["cepr.org", "CEPR"],
  ["economicsone.com", "Economics One"], ["hbr.org", "Harvard Business Review"],
  ["boursorama.com", "Boursorama"], ["dowjones.io", "MarketWatch"],
  ["entrepreneur.com", "Entrepreneur"], ["fivethirtyeight.com", "FiveThirtyEight"],
  ["bitcoinmagazine.com", "Bitcoin Magazine"], ["cointelegraph.com", "Cointelegraph"],
  ["decrypt.co", "Decrypt"], ["coindesk.com", "CoinDesk"], ["theblock.co", "The Block"],
  ["reuters.com", "Reuters"], ["reutersbest.com", "Reuters"],
  ["nytimes.com", "The New York Times"], ["rss.nytimes.com", "The New York Times"],
  ["washingtonpost.com", "The Washington Post"], ["nypost.com", "New York Post"],
  ["theguardian.com", "The Guardian"], ["bbc.co.uk", "BBC Sport"],
  ["skysports.com", "Sky Sports"], ["theathletic.com", "The Athletic"],
  ["bleacherreport.com", "Bleacher Report"], ["espn", "ESPN"], ["marca", "Marca"],
  ["rmcsport.bfmtv.com", "RMC Sport"], ["eurosport.fr", "Eurosport"],
  ["sofoot.com", "So Foot"], ["hoopshype.com", "HoopsHype"],
  ["basketball.realgm.com", "RealGM Basketball"], ["basketsession.com", "Basket Session"],
  ["planet-rugby.com", "Planet Rugby"], ["rugbypass.com", "RugbyPass"],
  ["therugbypaper.co.uk", "The Rugby Paper"], ["ruck.co.uk", "Ruck"],
  ["atptour.com", "ATP Tour"], ["tennismajors.com", "Tennis Majors"],
  ["wtatennis.com", "WTA Tennis"], ["formula1.com", "Formula 1"],
  ["autosport.com", "Autosport"], ["motorsport.com", "Motorsport.com"],
  ["f1technical.net", "F1 Technical"], ["grandprix.com", "Grand Prix"],
  ["fia.com", "FIA"], ["cyclingnews.com", "Cycling News"], ["velonews.com", "VeloNews"],
  ["bikeradar.com", "BikeRadar"], ["lemidiolympique.fr", "Midi Olympique"],
  ["walesonline.co.uk", "Wales Online"],
  ["abduzeedo.com", "Abduzeedo"], ["alistapart.com", "A List Apart"],
  ["css-tricks.com", "CSS-Tricks"], ["smashingmagazine.com", "Smashing Magazine"],
  ["logrocket.com", "LogRocket"], ["sidebar.io", "Sidebar"], ["kottke.org", "kottke.org"],
  ["tympanus.net", "Codrops"], ["itsnicethat.com", "It's Nice That"],
  ["designshack", "Design Shack"], ["fastcompany.com", "Fast Company"],
  ["cinefil.com", "Cinéfil"], ["cinema.jeuxactu.com", "JeuxActu Cinéma"],
  ["variety.com", "Variety"], ["movieintheair.com", "Movie in the Air"],
  ["fabula.org", "Fabula"], ["nme.com", "NME"], ["pitchfork.com", "Pitchfork"],
  ["billboard.com", "Billboard"], ["diffuser.fm", "Diffuser.fm"],
  ["regard-est.com", "Regard Est"], ["sputnikmusic.com", "Sputnik Music"],
  ["kotaku.com", "Kotaku"], ["eurogamer.net", "Eurogamer"],
  ["rockpapershotgun.com", "Rock Paper Shotgun"], ["altpress.com", "Alternative Press"],
  ["actualitte.com", "Actualitté"], ["themarginalian.org", "The Marginalian"],
  ["ign.com", "IGN"], ["feedpress.me/designshack", "Design Shack"],
  ["food52.com", "Food52"], ["epicurious.com", "Epicurious"],
  ["finedininglovers.com", "Fine Dining Lovers"], ["saveur.com", "Saveur"],
  ["seriouseats.com", "Serious Eats"], ["lonelyplanet.com", "Lonely Planet"],
  ["cntraveler.com", "Condé Nast Traveler"], ["nationalgeographic.com", "National Geographic"],
  ["routard.com", "Routard"], ["geo.fr", "GEO"], ["atlasobscura.com", "Atlas Obscura"],
  ["lefooding.com", "Le Fooding"], ["desk-russie.eu", "Desk Russie"],
  ["les-yeux-du-monde.fr", "Les Yeux du Monde"], ["opex360.com", "Opex360"],
  ["iris-france.org", "IRIS"], ["revueconflits.com", "Revue Conflits"],
  ["hnrss.org", "Hacker News"], ["news.ycombinator.com", "Hacker News"],
  ["reddit.com", "Reddit"], ["elucid", "Elucid Media"],
];

/* ---------- Nettoyage d'URL ---------- */
function normalizeUrl(raw: string): string {
  let u = raw.trim();
  // http → https sauf hosts qui le refusent (on garde tel quel en cas de doute : fetch suivra les redirections)
  try {
    const url = new URL(u);
    // params de tracking
    ["itid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "service"].forEach((p) => {
      url.searchParams.delete(p);
    });
    // slash final + query vide
    u = url.toString();
    if (u.endsWith("?")) u = u.slice(0, -1);
  } catch {
    /* URL invalide : on la laisse, elle sera filtrée */
  }
  return u;
}

function isJunk(url: string): boolean {
  return JUNK.some((j) => url.includes(j));
}

function categorize(url: string): string {
  for (const [pattern, cat] of RULES) {
    if (url.includes(pattern)) return cat;
  }
  return "tech"; // défaut raisonnable pour un flux inconnu
}

function prettyName(url: string): string {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return url;
  }
  let base = host;
  for (const [pattern, name] of PRETTY) {
    if (host.includes(pattern) || url.includes(pattern)) {
      base = name;
      break;
    }
  }
  // Section lisible depuis le chemin (ex: /Cyclisme/, nyt/Technology.xml)
  const segments = path.split("/").filter((s) => s && !/^(rss|feeds|feed|xml|api|edito|svc|collections|v1|publish|arc|outboundfeeds|category|main|articles|fr|en|news|actualites)$/i.test(s));
  let section = "";
  if (segments.length) {
    const last = segments[segments.length - 1].replace(/\.(xml|rss|htm|html|aspx)$/i, "").replace(/[-_]/g, " ").trim();
    if (last && base !== last && last.length <= 28 && !/^\d+$/.test(last)) {
      section = last.charAt(0).toUpperCase() + last.slice(1);
    }
  }
  return section ? `${base} · ${section}` : base;
}

/* ---------- Langue ---------- */
function detectLang(url: string): "fr" | "en" {
  const fr = [".fr", "lequipe", "francetvinfo", "20minutes", "courrierinternational", "rfi.fr", "liberation", "mediapart", "humanite", "vert.eco", "legrandcontinent", "rmcsport", "bfmtv", "jeuxactu", "lefooding", "desk-russie", "les-yeux-du-monde", "opex360", "iris-france", "revueconflits", "novethic", "cours", "lefigaro", "challenges", "capital", "lesechos", "01net", "numerama", "jeuxvideo", "gamekult", "allocine", "premiere", "telerama", "lesinrocks", "nouvelobs", "lexpress", "huffingtonpost.fr", "actualitte", "futura-sciences", "sciencesetavenir", "presse-citron", "silicon", "ladn", "zdnet.fr", "eurogamer.net"];
  return fr.some((f) => url.includes(f)) ? "fr" : "en";
}

/* ---------- Main ---------- */
async function main() {
  const fs = await import("fs");
  const raw = fs.readFileSync(FILE, "utf-8");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  let filtered = 0, dupes = 0, inserted = 0;
  const seen = new Set<string>();
  const rows: { url: string; title: string; category: string; language: string }[] = [];

  for (const line of lines) {
    const url = normalizeUrl(line);
    if (isJunk(url)) { filtered++; continue; }
    if (seen.has(url)) { dupes++; continue; }
    seen.add(url);
    rows.push({ url, title: prettyName(url), category: categorize(url), language: detectLang(url) });
  }

  // insertion idempotente
  for (const r of rows) {
    const exists = await db.feed.findUnique({ where: { url: r.url } });
    if (exists) continue;
    await db.feed.create({
      data: { url: r.url, title: r.title, category: r.category, language: r.language },
    });
    inserted++;
  }

  const byCat: Record<string, number> = {};
  (await db.feed.findMany()).forEach((f) => { byCat[f.category] = (byCat[f.category] || 0) + 1; });

  console.log(`Flux lus : ${lines.length} · filtrés (invalides) : ${filtered} · doublons : ${dupes}`);
  console.log(`Insérés : ${inserted} · Total en base : ${Object.values(byCat).reduce((a, b) => a + b, 0)}`);
  console.log("Répartition : ", Object.entries(byCat).map(([k, v]) => `${CATS[k] || k}: ${v}`).join(" · "));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .then(() => process.exit(0));
