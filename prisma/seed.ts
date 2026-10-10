// Seed: reference data (diseases, sources) + a small set of SOURCED outbreak records.
//
// Every seeded fact cites the publication it came from. Facts were compiled on 2026-10-08 from the cited
// publications as surfaced through web search (the build environment's network policy blocked direct access
// to who.int, ecdc.europa.eu and most news sites), so seeded rows carry `extractedBy: "SEED"` and media claims
// stay UNVERIFIED. Publication times are taken from the URL/date line; where only a date is known the time is
// set to 12:00 UTC and marked "(date only)". Re-running the seed replaces seeded outbreaks; ingested articles
// are kept.
import "dotenv/config";
import { prisma } from "../lib/db";
import { canonicalizeUrl, titleHash } from "../lib/ingestion/normalize";
import { DISEASES } from "./reference/diseases";
import { ensureTrackedEvents } from "../lib/tracked/store";

const D = (iso: string) => new Date(iso);
const intervalMinutes = Number(process.env.INGESTION_INTERVAL_MINUTES) || 15;

// Disease reference data lives in prisma/reference/diseases.ts (also loaded by `npm run db:reference`).

// Automatic sources. Only the WHO DON endpoint is enabled by default: its URL is documented by WHO. ECDC and CDC
// feed URLs could not be confirmed from this environment, so those sources ship disabled with an empty/candidate
// URL until an operator verifies them with "Test endpoint" in /admin/sources.
const AUTO_SOURCES = [
  { slug: "who-don", name: "WHO Disease Outbreak News (API)", organization: "World Health Organization", kind: "OFFICIAL", adapter: "WHO_DON_API", url: "https://www.who.int/api/news/diseaseoutbreaknews", homepage: "https://www.who.int/emergencies/disease-outbreak-news", enabled: true, notes: "Endpoint and fields documented by WHO at https://www.who.int/api/news/diseaseoutbreaknews/sfhelp (OData; $orderby=PublicationDate desc, $top/$skip paging). Enabled because WHO documents it; live response not yet observed from the build environment (egress blocked) — run `npm run verify:sources`." },
  { slug: "cdc-content", name: "CDC Content Services API (media search: outbreak)", organization: "US Centers for Disease Control and Prevention", kind: "OFFICIAL", adapter: "CDC_CONTENT_API", url: "https://tools.cdc.gov/api/v2/resources/media?q=outbreak&max=50", homepage: "https://tools.cdc.gov/api/docs/info.aspx", enabled: false, notes: "Format established from CDC's published API documentation and its OpenAPI definition (results[] + meta.pagination). Query (q=outbreak) is a starting point. Disabled until a live Test succeeds." },
  { slug: "ecdc-news", name: "ECDC news (RSS)", organization: "European Centre for Disease Prevention and Control", kind: "OFFICIAL", adapter: "RSS", url: "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed", homepage: "https://www.ecdc.europa.eu/en/rss-feeds", enabled: false, notes: "Candidate URL reported by a third-party feed directory for ECDC's “News” feed; confirm against https://www.ecdc.europa.eu/en/rss-feeds, Test, then enable." },
  { slug: "ecdc-cdtr", name: "ECDC Communicable Disease Threats Report (RSS)", organization: "European Centre for Disease Prevention and Control", kind: "OFFICIAL", adapter: "RSS", url: null, homepage: "https://www.ecdc.europa.eu/en/rss-feeds", enabled: false, notes: "Listed on ECDC's RSS page under Epidemiological information; feed URL not confirmed. Copy it from https://www.ecdc.europa.eu/en/rss-feeds, Test, then enable." },
  { slug: "cdc-han", name: "CDC Health Alert Network (RSS)", organization: "US Centers for Disease Control and Prevention", kind: "OFFICIAL", adapter: "RSS", url: null, homepage: "https://www.cdc.gov/han/", enabled: false, notes: "HAN offers an RSS subscription on its landing page; URL not confirmed from the build environment." },
  { slug: "cdc-travel-notices", name: "CDC Travel Health Notices (RSS)", organization: "US Centers for Disease Control and Prevention", kind: "OFFICIAL", adapter: "RSS", url: "https://wwwnc.cdc.gov/travel/rss/notices.xml", homepage: "https://wwwnc.cdc.gov/travel/notices", enabled: false, notes: "Candidate URL (unverified). Test before enabling." },
];

// Provenance-only sources for seeded/manually entered articles.
const MANUAL_SOURCES: [slug: string, name: string, organization: string, kind: "OFFICIAL" | "MEDIA" | "AGGREGATOR", homepage: string][] = [
  ["ecdc-manual", "ECDC (manual entry)", "European Centre for Disease Prevention and Control", "OFFICIAL", "https://www.ecdc.europa.eu"],
  ["who-manual", "WHO (manual entry)", "World Health Organization", "OFFICIAL", "https://www.who.int"],
  ["who-afro-manual", "WHO AFRO (manual entry)", "WHO Regional Office for Africa", "OFFICIAL", "https://www.afro.who.int"],
  ["ukhsa-manual", "UKHSA (manual entry)", "UK Health Security Agency", "OFFICIAL", "https://www.gov.uk/government/organisations/uk-health-security-agency"],
  ["nathnac-manual", "NaTHNaC / TravelHealthPro (manual entry)", "National Travel Health Network and Centre (UK)", "AGGREGATOR", "https://travelhealthpro.org.uk"],
  ["reuters", "Reuters", "Reuters", "MEDIA", "https://www.reuters.com"],
  ["moscow-times", "The Moscow Times", "The Moscow Times", "MEDIA", "https://www.themoscowtimes.com"],
  ["euronews", "Euronews", "Euronews", "MEDIA", "https://www.euronews.com"],
  ["meduza", "Meduza", "Meduza", "MEDIA", "https://meduza.io/en"],
  ["cnn", "CNN", "CNN", "MEDIA", "https://www.cnn.com"],
  ["aljazeera", "Al Jazeera", "Al Jazeera", "MEDIA", "https://www.aljazeera.com"],
  ["newsweek", "Newsweek", "Newsweek", "MEDIA", "https://www.newsweek.com"],
  ["irish-times", "The Irish Times", "The Irish Times", "MEDIA", "https://www.irishtimes.com"],
  ["cbs", "CBS News", "CBS News", "MEDIA", "https://www.cbsnews.com"],
  ["kyiv-independent", "The Kyiv Independent", "The Kyiv Independent", "MEDIA", "https://kyivindependent.com"],
  ["nbc", "NBC News", "NBC News", "MEDIA", "https://www.nbcnews.com"],
  ["science", "Science", "American Association for the Advancement of Science", "MEDIA", "https://www.science.org"],
];

type ArticleSeed = { key: string; source: string; url: string; title: string; summary: string; publishedAt: Date; countries: string[]; diseases: string[]; locationText?: string; geoPrecision?: string; verification?: string };

const RU_ARTICLES: ArticleSeed[] = [
  { key: "mt-1002", source: "moscow-times", url: "https://www.themoscowtimes.com/2026/10/02/nearly-200-people-under-observation-after-irkutsk-lab-worker-dies-from-plague-a93857", title: "Nearly 200 People Under Observation After Irkutsk Lab Worker Dies From Plague", summary: "Reports that nearly 200 people were placed under observation after the death of an Irkutsk anti-plague institute laboratory worker. The headline's attribution of the death to plague was not confirmed by Russian health authorities.", publishedAt: D("2026-10-02T12:00:00Z"), countries: ["RU"], diseases: ["plague"], locationText: "Irkutsk, Irkutsk Oblast", geoPrecision: "CITY" },
  { key: "cnn-1004", source: "cnn", url: "https://www.cnn.com/2026/10/04/europe/russia-laboratory-plague-accident-intl", title: "Dozens quarantined after researcher at Russian plague laboratory dies of ‘unknown’ infection", summary: "Reports quarantines after a researcher at a Russian plague laboratory died of an infection described officially as of unknown origin.", publishedAt: D("2026-10-04T12:00:00Z"), countries: ["RU"], diseases: ["plague"] },
  { key: "meduza-1005", source: "meduza", url: "https://meduza.io/en/feature/2026/10/05/hospitals-in-irkutsk-impose-quarantines-after-an-employee-at-an-anti-plague-institute-dies-russia-s-public-health-agency-says-she-died-of-pneumonia-and-the-epidemiological-situation-remains-stable", title: "Hospitals in Irkutsk impose quarantines after an employee at an anti-plague institute dies; Rospotrebnadzor says she died of pneumonia and the epidemiological situation remains ‘stable’", summary: "Rospotrebnadzor attributes the death to pneumonia, says no microorganisms linked to the employee's professional activity were found, and describes the epidemiological situation in Irkutsk Oblast, Irkutsk and Shelekhov as stable.", publishedAt: D("2026-10-05T12:00:00Z"), countries: ["RU"], diseases: [], locationText: "Irkutsk / Shelekhov, Irkutsk Oblast", geoPrecision: "CITY" },
  { key: "aj-1005", source: "aljazeera", url: "https://www.aljazeera.com/news/2026/10/5/russian-lab-worker-dies-of-suspected-plague-in-siberia-us-monitoring-case", title: "Russian lab worker dies of suspected plague in Siberia; US monitoring case", summary: "Reports the death of a laboratory worker in Siberia from suspected plague and that the United States is monitoring the case.", publishedAt: D("2026-10-05T12:00:00Z"), countries: ["RU", "US"], diseases: ["plague"] },
  { key: "it-1005", source: "irish-times", url: "https://www.irishtimes.com/world/middle-east/2026/10/05/mystery-death-at-russian-plague-research-institute-sparks-quarantine-measures-across-siberia/", title: "US ‘monitoring’ suspected case of plague in Russia after lab worker dies", summary: "US Secretary of State Marco Rubio said he did not think the incident was cause for alarm.", publishedAt: D("2026-10-05T12:00:00Z"), countries: ["RU", "US"], diseases: ["plague"] },
  { key: "en-1005", source: "euronews", url: "https://www.euronews.com/2026/10/05/situation-under-control-russian-authorities-reassure-public-after-plague-reports-in-siberi", title: "Russia denies lab worker died of plague as quarantine in Siberia stays in place", summary: "Russian authorities deny the worker died of plague; quarantine measures remain in place.", publishedAt: D("2026-10-05T12:00:00Z"), countries: ["RU"], diseases: ["plague"] },
  { key: "nw-1005", source: "newsweek", url: "https://www.newsweek.com/russias-response-to-suspected-plague-outbreak-under-scrutiny-12523852", title: "Russia's response to suspected plague outbreak under scrutiny", summary: "Carries a WHO statement: WHO is aware of reports that a laboratory worker in Irkutsk died of severe pneumonia; no cause has been officially confirmed and testing is reportedly underway; based on unofficial information the risk to the general population appears low; the assessment will be updated as information becomes available. Publication time approximate (date only, inferred).", publishedAt: D("2026-10-05T18:00:00Z"), countries: ["RU"], diseases: ["plague"] },
  { key: "ecdc-1006", source: "ecdc-manual", url: "https://www.ecdc.europa.eu/en/news-events/ecdc-closely-monitoring-situation-following-case-pneumonia-unknown-origin-russia", title: "ECDC closely monitoring situation following case of pneumonia of unknown origin in Russia", summary: "ECDC is closely monitoring the reported death of a laboratory worker in Irkutsk. Based on the limited information available there are no reports of secondary cases and no evidence of sustained human-to-human transmission. ECDC notes there is little travel between Irkutsk and the EU/EEA.", publishedAt: D("2026-10-06T12:00:00Z"), countries: ["RU"], diseases: [], locationText: "Irkutsk, Irkutsk Oblast", geoPrecision: "CITY", verification: "VERIFIED" },
  { key: "en-1006", source: "euronews", url: "https://www.euronews.com/2026/10/06/russia-denies-plague-death-but-quarantines-hundreds-without-explanation", title: "Russia denies plague death but quarantines hundreds without explanation", summary: "Between 189 and 197 contacts were placed under observation and quarantine according to independent and regional media. Initial tests among contacts returned negative. Rospotrebnadzor said some people tested positive for colds or COVID-19, but no pathogens causing dangerous infections were found.", publishedAt: D("2026-10-06T12:00:00Z"), countries: ["RU"], diseases: ["plague", "covid-19"] },
  { key: "reuters-1006", source: "reuters", url: "https://www.reuters.com/business/healthcare-pharmaceuticals/what-do-we-know-about-plague-institute-lab-workers-death-russia-2026-10-06/", title: "What do we know about the plague institute lab worker's death in Russia?", summary: "Reuters explainer on the death of a laboratory worker at the Irkutsk anti-plague institute (6 October 2026). Content could not be machine-read from the build environment; open the original for details.", publishedAt: D("2026-10-06T12:00:00Z"), countries: ["RU"], diseases: ["plague"] },
  { key: "nbc-1006", source: "nbc", url: "https://www.nbcnews.com/world/russia/russia-says-no-plague-found-contacts-siberian-lab-worker-died-rcna601805", title: "Russia says no plague found in contacts of Siberian lab worker who died", summary: "WHO said Russian health officials told it no plague case had been recorded in Irkutsk and that no plague or other high-threat pathogen had been found among the woman's close contacts; WHO was awaiting confirmation from the Russian side. Rospotrebnadzor reported two COVID-19 and two rhinovirus infections among contacts and no plague, with about 60% of the identified group tested so far.", publishedAt: D("2026-10-06T13:00:00Z"), countries: ["RU", "US"], diseases: ["plague", "covid-19"] },
  { key: "science-1006", source: "science", url: "https://www.science.org/content/article/possible-plague-death-siberian-lab-baffles-scientists", title: "Possible plague death at a Siberian lab baffles scientists", summary: "Plague researchers interviewed consider the risk of a large outbreak close to zero; the realistic worst case is a localized cluster. If a lab worker did die of plague, it would point to shortcomings at the lab that need investigation. (Expert opinion; does not report a confirmed diagnosis.)", publishedAt: D("2026-10-06T12:00:00Z"), countries: ["RU"], diseases: ["plague"] },
  { key: "ki-1005", source: "kyiv-independent", url: "https://kyivindependent.com/plague-death-triggers-quarantine-mask-mandates-in-russias-irkutsk-region-in-siberia/", title: "Plague death triggers quarantine, mask mandates in Russia's Irkutsk region in Siberia", summary: "Reports quarantine measures and a mask mandate (including at the Irkutsk Aluminium Plant in Shelekhov). Headline's attribution to plague is not officially confirmed. Publication date approximate.", publishedAt: D("2026-10-05T12:00:00Z"), countries: ["RU"], diseases: ["plague"], locationText: "Shelekhov, Irkutsk Oblast", geoPrecision: "CITY" },
];

const OTHER_ARTICLES: ArticleSeed[] = [
  { key: "don617", source: "who-don", url: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON617", title: "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo", summary: "As of 7 September 2026, the Democratic Republic of the Congo has reported 6757 confirmed cases, including 3267 deaths (crude CFR 48.3%). WHO assesses the national risk as very high.", publishedAt: D("2026-09-10T12:00:00Z"), countries: ["CD"], diseases: ["ebola"], verification: "VERIFIED" },
  { key: "who-ebola-sit", source: "who-manual", url: "https://www.who.int/emergencies/situations/ebola-outbreak---drc-2026", title: "Ebola outbreak - DRC 2026 (WHO situation page)", summary: "WHO situation summary: as of 21 September 2026, 7773 confirmed cases and 3759 confirmed deaths in the DRC. The outbreak remains a public health emergency of international concern (Emergency Committee, 18 August 2026). Publication time approximate.", publishedAt: D("2026-09-24T12:00:00Z"), countries: ["CD"], diseases: ["ebola"], verification: "VERIFIED" },
  { key: "nathnac", source: "nathnac-manual", url: "https://travelhealthpro.org.uk/outbreaks", title: "NaTHNaC outbreak surveillance — Ebola disease (Bundibugyo virus), DRC", summary: "Secondary compilation: 8067 confirmed Ebola disease (Bundibugyo virus) cases and 3901 deaths as of 26 September 2026, across seven provinces. Not a primary WHO/MoH publication.", publishedAt: D("2026-09-29T12:00:00Z"), countries: ["CD"], diseases: ["ebola"] },
  { key: "mpox-69", source: "who-manual", url: "https://www.who.int/publications/m/item/multi-country-outbreak-of-mpox--external-situation-report--69---14-september-2026", title: "Multi-country outbreak of mpox, External situation report #69 - 14 September 2026", summary: "Cases increasing in the Democratic Republic of the Congo; clade Ib has reached previously unaffected areas of the country. Case counts are not captured in this record.", publishedAt: D("2026-09-14T12:00:00Z"), countries: ["CD"], diseases: ["mpox"], verification: "VERIFIED" },
  { key: "ukhsa-w38", source: "ukhsa-manual", url: "https://www.gov.uk/government/publications/outbreaks-under-monitoring-in-2026/outbreaks-under-monitoring-week-38-week-ending-20-september-2026", title: "Outbreaks under monitoring: week 38 (week ending 20 September 2026)", summary: "UKHSA's weekly list includes an avian influenza A(H5N1) notification from Bangladesh reported on 30 August 2026. Whether it concerns human or animal infection, and any counts, are not captured in this record.", publishedAt: D("2026-09-23T12:00:00Z"), countries: ["BD"], diseases: ["avian-influenza"], verification: "VERIFIED" },
  { key: "afro-w36", source: "who-afro-manual", url: "https://www.afro.who.int/health-topics/disease-outbreaks/outbreaks-and-other-emergencies-updates", title: "WHO AFRO weekly bulletin on outbreaks and other emergencies — week 36 (31 August – 6 September 2026)", summary: "The week-36 bulletin covers yellow fever in Côte d'Ivoire and mpox in Kenya. Counts are not captured in this record. Publication time approximate.", publishedAt: D("2026-09-09T12:00:00Z"), countries: ["CI", "KE"], diseases: ["yellow-fever", "mpox"], verification: "VERIFIED" },
  { key: "who-uganda-end", source: "who-manual", url: "https://www.who.int/emergencies/situations/ebola-outbreak---drc-2026#uganda", title: "End of the Ebola disease (Bundibugyo virus) outbreak in Uganda declared", summary: "On 27 August 2026, WHO and the Africa Centres for Disease Control and Prevention declared the end of the outbreak in Uganda (as summarised on WHO's 2026 Ebola situation page).", publishedAt: D("2026-08-27T12:00:00Z"), countries: ["UG"], diseases: ["ebola"], verification: "VERIFIED" },
];

async function main() {
  for (const d of DISEASES) {
    const data = { ...d, keywords: JSON.stringify(d.keywords) };
    await prisma.disease.upsert({ where: { slug: d.slug }, update: data, create: data });
  }
  for (const s of AUTO_SOURCES) {
    const existing = await prisma.source.findUnique({ where: { slug: s.slug } });
    // Re-seeding never overwrites an operator's URL/enabled choice; it only fills a URL that is still empty.
    await prisma.source.upsert({ where: { slug: s.slug }, update: { name: s.name, organization: s.organization, kind: s.kind, adapter: s.adapter, homepage: s.homepage, notes: s.notes, ...(existing && !existing.url && s.url ? { url: s.url } : {}) }, create: { ...s, pollIntervalMinutes: intervalMinutes } });
  }
  for (const [slug, name, organization, kind, homepage] of MANUAL_SOURCES) {
    await prisma.source.upsert({ where: { slug }, update: { name, organization, kind }, create: { slug, name, organization, kind, adapter: "MANUAL", homepage, enabled: false, notes: "Provenance record for manually entered / seeded articles. Not polled." } });
  }

  const diseases = new Map((await prisma.disease.findMany()).map((d) => [d.slug, d.id]));
  const sources = new Map((await prisma.source.findMany()).map((s) => [s.slug, s]));

  const SEED_SLUGS = ["russia-irkutsk-2026", "ebola-bundibugyo-drc-2026", "ebola-bundibugyo-uganda-2026", "mpox-clade-ib-drc-2026", "avian-influenza-h5n1-bangladesh-2026", "yellow-fever-cote-divoire-2026"];
  // Never destroy analyst work: if the seeded outbreaks already exist, keep them (and their edits, verifications and
  // linked evidence) unless the operator explicitly asks for a reset.
  const existingSeeded = await prisma.outbreak.count({ where: { slug: { in: SEED_SLUGS } } });
  if (existingSeeded > 0 && !process.argv.includes("--reset-seeded-outbreaks")) {
    console.log(`Seeded outbreaks already present (${existingSeeded}); kept as they are. Reference data refreshed. Use --reset-seeded-outbreaks to recreate them.`);
    for (const c of await ensureTrackedEvents()) console.log(`Tracked events: ${c}`);
    return;
  }
  await prisma.outbreak.deleteMany({ where: { slug: { in: SEED_SLUGS } } });

  const articleIds = new Map<string, string>();
  for (const a of [...RU_ARTICLES, ...OTHER_ARTICLES]) {
    const src = sources.get(a.source)!;
    const canonicalUrl = canonicalizeUrl(a.url);
    const sourceType = src.kind === "OFFICIAL" ? "OFFICIAL" : "MEDIA";
    const data = {
      sourceId: src.id, url: a.url, canonicalUrl, title: a.title, summary: a.summary, titleHash: titleHash(a.title), publishedAt: a.publishedAt, language: "en",
      countryCodes: JSON.stringify(a.countries), diseaseSlugs: JSON.stringify(a.diseases), locationText: a.locationText ?? null, geoPrecision: a.geoPrecision ?? (a.countries.length ? "COUNTRY" : "UNKNOWN"),
      reviewStatus: "ACCEPTED", sourceType, verificationStatus: a.verification ?? "UNVERIFIED", fetchedAt: new Date("2026-10-08T03:30:00Z"), origin: "SEED",
      raw: JSON.stringify({ seeded: true, note: "Compiled from search results on 2026-10-08; not fetched by the pipeline." }),
    };
    const row = await prisma.sourceArticle.upsert({ where: { canonicalUrl }, update: data, create: data });
    await prisma.evidenceClaim.deleteMany({ where: { articleId: row.id, extractedBy: "SEED" } });
    articleIds.set(a.key, row.id);
  }
  const A = (k: string) => articleIds.get(k)!;

  // ---------------------------------------------------------------- Russia / Irkutsk investigation
  const ru = await prisma.outbreak.create({
    data: {
      slug: "russia-irkutsk-2026",
      title: "Fatal pneumonia of undetermined cause — Irkutsk anti-plague institute worker",
      summary:
        "A 28-year-old laboratory technician at the Irkutsk Anti-Plague Research Institute was hospitalised on 29 September and died on 2 October 2026 in Shelekhov, near Irkutsk. WHO describes the death as severe pneumonia with no officially confirmed cause. Media reports of pneumonic plague (Yersinia pestis — a bacterium) after an alleged laboratory accident have NOT been confirmed: Rospotrebnadzor attributes the death to pneumonia of unknown origin, denies any accident, and reports no dangerous pathogens among tested contacts. ECDC reports no known secondary cases and no evidence of sustained human-to-human transmission. On 6 October WHO said Russian officials reported no recorded plague case and no high-threat pathogen among close contacts, and that it was awaiting confirmation from Russia. This is a confirmed death; it is not a confirmed plague death.",
      suspectedDiseaseId: diseases.get("plague"),
      classification: "UNCONFIRMED_INVESTIGATION",
      pathogenStatus: "UNDER_INVESTIGATION",
      countryCode: "RU",
      countryName: "Russia",
      firstReportedAt: D("2026-10-02T12:00:00Z"),
      eventStartDate: D("2026-09-29T00:00:00Z"),
      lastVerifiedAt: D("2026-10-06T13:00:00Z"),
      featured: true,
      published: true,
      locations: {
        create: [
          { name: "Shelekhov", admin1: "Irkutsk Oblast", countryCode: "RU", lat: 52.2104, lng: 104.0975, precision: "CITY", role: "INVESTIGATION_SITE", notes: "Shelekhov district hospital: place of death; hospital placed under quarantine. City-level coordinates.", firstReportedAt: D("2026-10-02T12:00:00Z"), sourceArticleId: A("mt-1002") },
          { name: "Irkutsk Anti-Plague Research Institute", admin1: "Irkutsk Oblast", countryCode: "RU", lat: 52.2869, lng: 104.305, precision: "CITY", role: "INVESTIGATION_SITE", notes: "Patient's workplace. Coordinates are Irkutsk city centre, not the institute building.", firstReportedAt: D("2026-10-02T12:00:00Z"), sourceArticleId: A("mt-1002") },
        ],
      },
    },
  });

  await prisma.investigationStatusHistory.createMany({
    data: [
      { outbreakId: ru.id, fromClassification: null, toClassification: "UNCONFIRMED_INVESTIGATION", fromPathogenStatus: null, toPathogenStatus: "SUSPECTED", reason: "Opened from media reports of a laboratory worker's death attributed (unofficially) to pneumonic plague. Single case; no confirmed pathogen.", effectiveAt: D("2026-10-02T12:00:00Z"), actor: "seed", sourceArticleId: A("mt-1002") },
      { outbreakId: ru.id, fromClassification: "UNCONFIRMED_INVESTIGATION", toClassification: "UNCONFIRMED_INVESTIGATION", fromPathogenStatus: "SUSPECTED", toPathogenStatus: "UNDER_INVESTIGATION", reason: "Rospotrebnadzor (4 Oct) attributes the death to pneumonia of unknown origin and reports no microorganisms linked to the worker's professional activity; plague neither confirmed nor formally ruled out.", effectiveAt: D("2026-10-05T12:00:00Z"), actor: "seed", sourceArticleId: A("meduza-1005") },
    ],
  });

  type Obs = Parameters<typeof prisma.outbreakObservation.create>[0]["data"];
  const ruObs: Omit<Obs, "outbreak">[] = [
    { metric: "DEATHS", value: 1, deathCauseConfirmed: false, isCumulative: true, scope: "Irkutsk Oblast", asOfDate: D("2026-10-02T00:00:00Z"), reportedAt: D("2026-10-05T18:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO statement (via Newsweek)", notes: "Death from severe pneumonia confirmed. Cause NOT laboratory-attributed to plague.", sourceArticleId: A("nw-1005") },
    { metric: "UNDER_OBSERVATION", value: 200, isCumulative: true, asOfDate: D("2026-10-02T00:00:00Z"), reportedAt: D("2026-10-02T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "The Moscow Times", notes: "\"Nearly 200\" people under observation. Observation is not infection.", sourceArticleId: A("mt-1002") },
    { metric: "UNDER_OBSERVATION", value: 189, valueHigh: 197, isCumulative: true, asOfDate: D("2026-10-05T00:00:00Z"), reportedAt: D("2026-10-06T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "Euronews, citing independent and regional media", notes: "197 contacts identified; 189 placed under observation in medical facilities. Observation is not infection.", sourceArticleId: A("en-1006") },
    { metric: "HOSPITALIZED", value: 100, isCumulative: true, asOfDate: D("2026-10-05T00:00:00Z"), reportedAt: D("2026-10-05T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "Media reports", notes: "\"More than 100\" contacts reportedly held in hospital wards for observation — not patients with confirmed infection.", sourceArticleId: A("aj-1005") },
  ];
  for (const o of ruObs) await prisma.outbreakObservation.create({ data: { ...o, outbreakId: ru.id } as Obs });

  const ruUpdates = [
    { kind: "MEDIA_REPORT", title: "Alleged laboratory accident (broken test tube)", body: "Independent outlet Lyudi Baikala (People of Baikal) reported that the technician accidentally broke a test tube containing plague bacteria on 25 September. Not confirmed by any authority; Rospotrebnadzor denies an accident occurred.", occurredAt: D("2026-09-25T00:00:00Z"), publishedAt: D("2026-10-02T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "DISPUTED", attributedTo: "Lyudi Baikala (as cited by international media)", sourceArticleId: A("mt-1002") },
    { kind: "DEVELOPMENT", title: "Patient hospitalised", body: "The laboratory technician was hospitalised on 29 September, according to news reports.", occurredAt: D("2026-09-29T00:00:00Z"), publishedAt: D("2026-10-02T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "Media reports", sourceArticleId: A("mt-1002") },
    { kind: "DEVELOPMENT", title: "Death in Shelekhov; nearly 200 placed under observation", body: "The worker died in hospital in Shelekhov early on 2 October. Media reported nearly 200 people placed under observation. Media headlines attributed the death to plague; no authority confirmed this.", occurredAt: D("2026-10-02T00:00:00Z"), publishedAt: D("2026-10-02T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "The Moscow Times", sourceArticleId: A("mt-1002") },
    { kind: "OFFICIAL_STATEMENT", title: "Regional statements referencing plague later softened or deleted", body: "Buryatia governor Alexei Tsydenov reportedly said the woman died from an unspecified form of plague; the statement was later softened. Local officials warned people not to visit Shelekhov citing \"unofficial information\" about a human plague case, then deleted the message. Irkutsk governor Igor Kobzev has referred only to a \"particularly dangerous infection\".", occurredAt: null, publishedAt: D("2026-10-04T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "DISPUTED", attributedTo: "Regional officials, as reported by media", sourceArticleId: A("cnn-1004") },
    { kind: "OFFICIAL_STATEMENT", title: "Rospotrebnadzor: pneumonia of unknown origin; no accident", body: "Rospotrebnadzor said the worker died of pneumonia of unknown origin, that tests of her biological material found no microorganisms linked to her professional activity, and that no accident involving pathogenic microorganisms occurred at the institute. It described the epidemiological situation in Irkutsk Oblast, Irkutsk and Shelekhov as stable.", occurredAt: D("2026-10-04T00:00:00Z"), publishedAt: D("2026-10-05T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "Rospotrebnadzor (via Meduza)", sourceArticleId: A("meduza-1005") },
    { kind: "MEASURE", title: "Shelekhov hospital quarantined; institute staff isolated; mask mandate", body: "The Shelekhov district hospital was placed under quarantine (no admissions or discharges) pending a special commission. More than 60 institute employees were reportedly isolated inside the building. A mask mandate was introduced at the Irkutsk Aluminium Plant in Shelekhov. Rospotrebnadzor head Anna Popova travelled from Moscow.", occurredAt: null, publishedAt: D("2026-10-05T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "Media reports", sourceArticleId: A("ki-1005") },
    { kind: "OFFICIAL_STATEMENT", title: "WHO: no confirmed cause; risk to general population appears low", body: "WHO said it was aware of reports that a laboratory worker in Irkutsk died of severe pneumonia overnight into 2 October, that no cause had been officially confirmed and testing was reportedly underway, and that based on unofficial information the public health risk to the general population appears low. WHO has asked Russia which pathogen caused the pneumonia.", occurredAt: null, publishedAt: D("2026-10-05T18:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO spokesperson (via Newsweek)", sourceArticleId: A("nw-1005") },
    { kind: "OFFICIAL_STATEMENT", title: "US: not \"cause for alarm\"", body: "US Secretary of State Marco Rubio said he did not think the incident was cause for alarm; US agencies are monitoring.", occurredAt: null, publishedAt: D("2026-10-05T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "The Irish Times", sourceArticleId: A("it-1005") },
    { kind: "OFFICIAL_STATEMENT", title: "ECDC: no secondary cases, no sustained human-to-human transmission", body: "ECDC is closely monitoring the situation. Based on the limited information available, there are no reports of secondary cases and no evidence of sustained human-to-human transmission. There is little travel between Irkutsk and the EU/EEA.", occurredAt: null, publishedAt: D("2026-10-06T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "ECDC", sourceArticleId: A("ecdc-1006") },
    { kind: "OFFICIAL_STATEMENT", title: "WHO: Russia reports no plague case recorded; WHO awaiting confirmation", body: "WHO said Russian health officials told it that no plague case had been recorded in Irkutsk and that no plague or other high-threat pathogen had reportedly been found among the woman's close contacts. WHO said it was still awaiting confirmation from the Russian side.", occurredAt: null, publishedAt: D("2026-10-06T13:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO (via NBC News)", sourceArticleId: A("nbc-1006") },
    { kind: "DEVELOPMENT", title: "Contact testing: 2 COVID-19, 2 rhinovirus, no plague (about 60% tested)", body: "Rospotrebnadzor said laboratory testing of close contacts identified two cases of COVID-19 and two cases of rhinovirus infection; plague was not detected. About 60% of the identified contact group had been tested at the time of the statement.", occurredAt: null, publishedAt: D("2026-10-06T13:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "Rospotrebnadzor (via NBC News)", sourceArticleId: A("nbc-1006") },
    { kind: "MEDIA_REPORT", title: "Experts: risk of a large outbreak close to zero", body: "Plague researchers interviewed by Science consider a large outbreak very unlikely; the realistic worst case is a localized cluster. They note that a laboratory-acquired plague death, if confirmed, would indicate failures at the lab requiring investigation.", occurredAt: null, publishedAt: D("2026-10-06T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "Science (expert interviews)", sourceArticleId: A("science-1006") },
    { kind: "DEVELOPMENT", title: "Contacts: initial tests negative for dangerous pathogens", body: "Initial tests among contacts returned negative. Rospotrebnadzor said some contacts tested positive for common colds or COVID-19, but no pathogens of dangerous infections were found.", occurredAt: null, publishedAt: D("2026-10-06T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "Rospotrebnadzor (via Euronews)", sourceArticleId: A("en-1006") },
  ];
  for (const u of ruUpdates) await prisma.outbreakUpdate.create({ data: { ...u, outbreakId: ru.id } });

  await prisma.riskAssessment.createMany({
    data: [
      { outbreakId: ru.id, organization: "WHO", scope: "General population", level: "LOW", statement: "Based on unofficial information, the public health risk to the general population appears to be low; to be updated as information becomes available.", publishedAt: D("2026-10-05T18:00:00Z"), verificationStatus: "VERIFIED", sourceArticleId: A("nw-1005") },
      { outbreakId: ru.id, organization: "WHO (reported)", scope: "Irkutsk / Russian Federation / WHO European Region", level: "LOW_TO_MODERATE", statement: "Reported tiered assessment: moderate-to-low for Irkutsk, low for the Russian Federation, very low for the WHO European Region. Primary WHO publication not located — provenance unconfirmed.", publishedAt: D("2026-10-06T12:00:00Z"), verificationStatus: "UNVERIFIED", sourceArticleId: null },
      { outbreakId: ru.id, organization: "ECDC", scope: "EU/EEA", level: "NOT_ASSESSED", statement: "No formal risk level stated in the cited text. No reports of secondary cases; no evidence of sustained human-to-human transmission; little travel between Irkutsk and the EU/EEA.", publishedAt: D("2026-10-06T12:00:00Z"), verificationStatus: "VERIFIED", sourceArticleId: A("ecdc-1006") },
    ],
  });

  const C = (articleKey: string, claimType: string, text: string, sourceType: string, verificationStatus: string, attributedTo: string, extra: Record<string, unknown> = {}) => ({ articleId: A(articleKey), outbreakId: ru.id, claimType, text, sourceType, verificationStatus, attributedTo, extractedBy: "SEED", publishedAt: [...RU_ARTICLES].find((a) => a.key === articleKey)!.publishedAt, ...extra });
  await prisma.evidenceClaim.createMany({
    data: [
      C("mt-1002", "PATHOGEN_ID", "The worker died from plague.", "MEDIA", "DISPUTED", "The Moscow Times (headline)", { conflictNote: "Contradicted by Rospotrebnadzor (pneumonia of unknown origin) and by WHO (no confirmed cause).", reviewedAt: D("2026-10-05T12:00:00Z") }),
      C("cnn-1004", "PATHOGEN_ID", "The woman died from an unspecified form of plague.", "OFFICIAL", "DISPUTED", "Buryatia governor Alexei Tsydenov (reported; later softened)", { conflictNote: "Regional official statement later softened; federal health authority does not confirm plague.", reviewedAt: D("2026-10-05T12:00:00Z") }),
      C("meduza-1005", "PATHOGEN_ID", "Death attributed to pneumonia of unknown origin; no microorganisms linked to the worker's professional activity found.", "OFFICIAL", "VERIFIED", "Rospotrebnadzor", { reviewedAt: D("2026-10-05T12:00:00Z") }),
      C("mt-1002", "OTHER", "The technician broke a test tube containing plague bacteria on 25 September.", "MEDIA", "DISPUTED", "Lyudi Baikala (as cited)", { conflictNote: "Rospotrebnadzor states no accident involving pathogenic microorganisms occurred at the institute.", reviewedAt: D("2026-10-05T12:00:00Z") }),
      C("meduza-1005", "STATEMENT", "No accident involving pathogenic microorganisms occurred at the institute.", "OFFICIAL", "DISPUTED", "Rospotrebnadzor", { conflictNote: "Contradicts the Lyudi Baikala account of a broken test tube; no independent investigation reported.", reviewedAt: D("2026-10-05T12:00:00Z") }),
      C("meduza-1005", "OTHER", "Alternative account: the patient was admitted after returning from Thailand.", "MEDIA", "UNVERIFIED", "Regional media (as summarised by international outlets)"),
      C("mt-1002", "OBSERVATION_COUNT", "Nearly 200 people under observation.", "MEDIA", "UNVERIFIED", "The Moscow Times", { metric: "UNDER_OBSERVATION", value: 200, conflictNote: "Later reports give 189 under observation of 197 identified contacts.", reviewedAt: D("2026-10-06T12:00:00Z") }),
      C("en-1006", "OBSERVATION_COUNT", "Between 189 and 197 contacts placed under observation and quarantine.", "MEDIA", "UNVERIFIED", "Euronews, citing independent and regional media", { metric: "UNDER_OBSERVATION", value: 189 }),
      C("en-1006", "STATEMENT", "No pathogens of dangerous infections found among tested contacts; some positive for colds or COVID-19.", "OFFICIAL", "VERIFIED", "Rospotrebnadzor (via Euronews)", { reviewedAt: D("2026-10-06T12:00:00Z") }),
      C("nbc-1006", "STATEMENT", "No plague case recorded in Irkutsk; no plague or other high-threat pathogen among close contacts (WHO awaiting confirmation from Russia).", "OFFICIAL", "VERIFIED", "WHO (via NBC News)", { reviewedAt: D("2026-10-06T13:00:00Z") }),
      C("nbc-1006", "STATEMENT", "Contact testing found 2 COVID-19 and 2 rhinovirus infections and no plague; about 60% of identified contacts tested so far.", "OFFICIAL", "VERIFIED", "Rospotrebnadzor (via NBC News)", { reviewedAt: D("2026-10-06T13:00:00Z") }),
      C("nbc-1006", "PATHOGEN_ID", "The illness was initially described as a typical acute respiratory viral infection.", "OFFICIAL", "DISPUTED", "Rospotrebnadzor (early statement, as reported)", { conflictNote: "Superseded by Rospotrebnadzor's later description of pneumonia of unknown origin.", reviewedAt: D("2026-10-06T13:00:00Z") }),
      C("ecdc-1006", "STATEMENT", "No reports of secondary cases and no evidence of sustained human-to-human transmission.", "OFFICIAL", "VERIFIED", "ECDC", { reviewedAt: D("2026-10-06T12:00:00Z") }),
      C("nw-1005", "RISK_ASSESSMENT", "Risk to the general population appears low (based on unofficial information).", "OFFICIAL", "VERIFIED", "WHO spokesperson", { reviewedAt: D("2026-10-05T18:00:00Z"), conflictNote: "A tiered WHO assessment (moderate-to-low for Irkutsk) circulates without a located primary source." }),
    ],
  });
  await prisma.sourceArticle.updateMany({ where: { id: { in: RU_ARTICLES.map((a) => A(a.key)) } }, data: { outbreakId: ru.id } });

  // ---------------------------------------------------------------- Other sourced records
  const drc = await prisma.outbreak.create({
    data: {
      slug: "ebola-bundibugyo-drc-2026", title: "Ebola disease (Bundibugyo virus) — Democratic Republic of the Congo",
      summary: "Laboratory-confirmed outbreak of Ebola disease caused by Bundibugyo virus, declared a public health emergency of international concern on 17 May 2026 and still a PHEIC after the 18 August Emergency Committee. Bundibugyo virus has no licensed vaccine or treatment. Figures below are WHO's; a newer secondary compilation is shown separately.",
      diseaseId: diseases.get("ebola"), classification: "CONFIRMED_WIDESPREAD", pathogenStatus: "CONFIRMED", countryCode: "CD", countryName: "Democratic Republic of the Congo",
      firstReportedAt: D("2026-05-17T12:00:00Z"), lastVerifiedAt: D("2026-09-24T12:00:00Z"), published: true,
      locations: { create: [{ name: "Democratic Republic of the Congo", countryCode: "CD", lat: -2.9, lng: 23.6, precision: "COUNTRY", role: "AFFECTED_AREA", notes: "Country-level marker: provincial distribution not captured in this record (reported across seven provinces).", firstReportedAt: D("2026-05-17T12:00:00Z"), sourceArticleId: A("don617") }] },
    },
  });
  await prisma.investigationStatusHistory.create({ data: { outbreakId: drc.id, toClassification: "CONFIRMED_WIDESPREAD", toPathogenStatus: "CONFIRMED", reason: "Confirmed outbreak declared a PHEIC by the WHO Director-General on 17 May 2026.", effectiveAt: D("2026-05-17T12:00:00Z"), actor: "seed" } });
  for (const o of [
    { metric: "CONFIRMED_CASES", value: 6757, asOfDate: D("2026-09-07T00:00:00Z"), reportedAt: D("2026-09-10T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO DON 2026-DON617", sourceArticleId: A("don617") },
    { metric: "DEATHS", value: 3267, deathCauseConfirmed: true, asOfDate: D("2026-09-07T00:00:00Z"), reportedAt: D("2026-09-10T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO DON 2026-DON617", sourceArticleId: A("don617") },
    { metric: "CONFIRMED_CASES", value: 7773, asOfDate: D("2026-09-21T00:00:00Z"), reportedAt: D("2026-09-24T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO situation summary", sourceArticleId: A("who-ebola-sit") },
    { metric: "DEATHS", value: 3759, deathCauseConfirmed: true, asOfDate: D("2026-09-21T00:00:00Z"), reportedAt: D("2026-09-24T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO situation summary", notes: "Confirmed deaths.", sourceArticleId: A("who-ebola-sit") },
    { metric: "CONFIRMED_CASES", value: 8067, asOfDate: D("2026-09-26T00:00:00Z"), reportedAt: D("2026-09-29T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "NaTHNaC (secondary compilation)", notes: "Secondary compilation; not promoted to the headline.", sourceArticleId: A("nathnac") },
    { metric: "DEATHS", value: 3901, asOfDate: D("2026-09-26T00:00:00Z"), reportedAt: D("2026-09-29T12:00:00Z"), sourceType: "MEDIA", verificationStatus: "UNVERIFIED", attributedTo: "NaTHNaC (secondary compilation)", sourceArticleId: A("nathnac") },
  ]) await prisma.outbreakObservation.create({ data: { ...o, isCumulative: true, scope: "Democratic Republic of the Congo", outbreakId: drc.id } });
  await prisma.outbreakUpdate.createMany({ data: [
    { outbreakId: drc.id, kind: "OFFICIAL_STATEMENT", title: "Declared a public health emergency of international concern", body: "On 17 May 2026 the WHO Director-General determined that the outbreak constitutes a PHEIC.", occurredAt: D("2026-05-17T00:00:00Z"), publishedAt: D("2026-05-17T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO" },
    { outbreakId: drc.id, kind: "OFFICIAL_STATEMENT", title: "Emergency Committee: remains a PHEIC", body: "The outbreak remains a PHEIC following the Emergency Committee meeting of 18 August 2026.", occurredAt: D("2026-08-18T00:00:00Z"), publishedAt: D("2026-08-18T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO" },
    { outbreakId: drc.id, kind: "DEVELOPMENT", title: "WHO DON: 6757 confirmed cases, 3267 deaths", body: "As of 7 September 2026: 6757 confirmed cases including 3267 deaths (crude CFR 48.3%). National risk assessed as very high.", occurredAt: D("2026-09-07T00:00:00Z"), publishedAt: D("2026-09-10T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO DON 2026-DON617", sourceArticleId: A("don617") },
    { outbreakId: drc.id, kind: "DEVELOPMENT", title: "WHO: 7773 confirmed cases, 3759 confirmed deaths", body: "WHO situation summary as of 21 September 2026.", occurredAt: D("2026-09-21T00:00:00Z"), publishedAt: D("2026-09-24T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO", sourceArticleId: A("who-ebola-sit") },
  ] });
  await prisma.riskAssessment.create({ data: { outbreakId: drc.id, organization: "WHO", scope: "National (DRC)", level: "VERY_HIGH", statement: "WHO assesses the risk at national level as very high (DON617).", publishedAt: D("2026-09-10T12:00:00Z"), verificationStatus: "VERIFIED", sourceArticleId: A("don617") } });
  await prisma.sourceArticle.updateMany({ where: { id: { in: [A("don617"), A("who-ebola-sit"), A("nathnac")] } }, data: { outbreakId: drc.id } });

  const ug = await prisma.outbreak.create({
    data: {
      slug: "ebola-bundibugyo-uganda-2026", title: "Ebola disease (Bundibugyo virus) — Uganda", summary: "WHO and Africa CDC declared the end of the outbreak in Uganda on 27 August 2026. This record was opened from the end-of-outbreak declaration; earlier reporting and case counts have not been ingested.",
      diseaseId: diseases.get("ebola"), classification: "RESOLVED", pathogenStatus: "CONFIRMED", countryCode: "UG", countryName: "Uganda", firstReportedAt: D("2026-08-27T12:00:00Z"), resolvedAt: D("2026-08-27T12:00:00Z"), lastVerifiedAt: D("2026-08-27T12:00:00Z"), published: true,
      locations: { create: [{ name: "Uganda", countryCode: "UG", lat: 1.4, lng: 32.3, precision: "COUNTRY", role: "AFFECTED_AREA", notes: "Country-level marker.", firstReportedAt: D("2026-08-27T12:00:00Z"), sourceArticleId: A("who-uganda-end") }] },
    },
  });
  await prisma.investigationStatusHistory.create({ data: { outbreakId: ug.id, toClassification: "RESOLVED", toPathogenStatus: "CONFIRMED", reason: "End of outbreak declared by WHO and Africa CDC.", effectiveAt: D("2026-08-27T12:00:00Z"), actor: "seed", sourceArticleId: A("who-uganda-end") } });
  await prisma.outbreakUpdate.create({ data: { outbreakId: ug.id, kind: "RECLASSIFICATION", title: "End of outbreak declared", body: "WHO and the Africa Centres for Disease Control and Prevention declared the end of the Ebola disease (Bundibugyo virus) outbreak in Uganda.", occurredAt: D("2026-08-27T00:00:00Z"), publishedAt: D("2026-08-27T12:00:00Z"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: "WHO / Africa CDC", sourceArticleId: A("who-uganda-end") } });
  await prisma.sourceArticle.update({ where: { id: A("who-uganda-end") }, data: { outbreakId: ug.id } });

  const simple = async (slug: string, title: string, summary: string, disease: string, classification: string, cc: string, cname: string, lat: number, lng: number, articleKey: string, publishedAt: Date, statusReason: string) => {
    const o = await prisma.outbreak.create({
      data: { slug, title, summary, diseaseId: diseases.get(disease), classification, pathogenStatus: "CONFIRMED", countryCode: cc, countryName: cname, firstReportedAt: publishedAt, lastVerifiedAt: publishedAt, published: true,
        locations: { create: [{ name: cname, countryCode: cc, lat, lng, precision: "COUNTRY", role: "AFFECTED_AREA", notes: "Country-level marker; sub-national distribution not captured.", firstReportedAt: publishedAt, sourceArticleId: A(articleKey) }] } },
    });
    await prisma.investigationStatusHistory.create({ data: { outbreakId: o.id, toClassification: classification, toPathogenStatus: "CONFIRMED", reason: statusReason, effectiveAt: publishedAt, actor: "seed", sourceArticleId: A(articleKey) } });
    await prisma.outbreakUpdate.create({ data: { outbreakId: o.id, kind: "DEVELOPMENT", title, body: summary, publishedAt, sourceType: "OFFICIAL", verificationStatus: "VERIFIED", attributedTo: [...OTHER_ARTICLES].find((a) => a.key === articleKey)!.title, sourceArticleId: A(articleKey) } });
    await prisma.sourceArticle.update({ where: { id: A(articleKey) }, data: { outbreakId: o.id } });
  };
  await simple("mpox-clade-ib-drc-2026", "Mpox (clade Ib) — Democratic Republic of the Congo", "WHO's multi-country mpox situation report #69 (14 September 2026) notes increasing cases in the DRC and spread of clade Ib to previously unaffected areas. Case counts not captured in this record.", "mpox", "CONFIRMED_WIDESPREAD", "CD", "Democratic Republic of the Congo", -4.4, 15.3, "mpox-69", D("2026-09-14T12:00:00Z"), "Ongoing laboratory-confirmed multi-country outbreak (WHO sitrep #69).");
  await simple("avian-influenza-h5n1-bangladesh-2026", "Avian influenza A(H5N1) notification — Bangladesh", "UKHSA's outbreaks-under-monitoring list (week 38) includes an avian influenza A(H5N1) notification from Bangladesh reported on 30 August 2026. Human/animal scope and counts not captured.", "avian-influenza", "CONFIRMED_LOCALIZED", "BD", "Bangladesh", 23.7, 90.4, "ukhsa-w38", D("2026-09-23T12:00:00Z"), "Notification of A(H5N1) listed by UKHSA.");
  await simple("yellow-fever-cote-divoire-2026", "Yellow fever — Côte d'Ivoire", "Listed in WHO AFRO's weekly bulletin on outbreaks and other emergencies, week 36 (31 August – 6 September 2026). Counts not captured.", "yellow-fever", "CONFIRMED_LOCALIZED", "CI", "Côte d'Ivoire", 7.5, -5.5, "afro-w36", D("2026-09-09T12:00:00Z"), "Listed as an ongoing event by WHO AFRO.");

  await prisma.adminAuditLog.create({ data: { action: "seed", entityType: "system", details: JSON.stringify({ outbreaks: SEED_SLUGS.length }), actor: "seed" } });
  for (const c of await ensureTrackedEvents()) console.log(`Tracked events: ${c}`);
  console.log(`Seeded ${DISEASES.length} diseases, ${AUTO_SOURCES.length + MANUAL_SOURCES.length} sources, ${SEED_SLUGS.length} outbreaks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
