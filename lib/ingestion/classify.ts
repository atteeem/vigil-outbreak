// Content classification: what KIND of publication an ingested item is. Only outbreak-relevant kinds are
// associated with outbreaks, yield case-count claims, count in outbreak KPIs and appear in the default feed.
// Rules are deterministic and conservative; analysts can override relevance in /admin/review.

export const CONTENT_TYPES = [
  "OUTBREAK_REPORT",
  "SITUATION_UPDATE",
  "RISK_ASSESSMENT",
  "SURVEILLANCE_REPORT",
  "GUIDANCE",
  "PODCAST_MEDIA",
  "GENERAL_PUBLICATION",
  "CORPORATE",
  "UNCLASSIFIED",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  OUTBREAK_REPORT: "Outbreak report",
  SITUATION_UPDATE: "Situation update",
  RISK_ASSESSMENT: "Risk assessment",
  SURVEILLANCE_REPORT: "Surveillance report",
  GUIDANCE: "Guidance",
  PODCAST_MEDIA: "Podcast / media",
  GENERAL_PUBLICATION: "General publication",
  CORPORATE: "Corporate",
  UNCLASSIFIED: "Unclassified",
};

/** Bump when rules change; `npm run reprocess` re-derives fields for rows with an older version. */
export const CLASSIFIER_VERSION = 1;

export interface ClassifyInput {
  title: string;
  url: string;
  lead: string;
  adapter: string;
  /** Publisher-supplied type hints (e.g. CDC mediaType "Podcast", "Video", "eCard"). */
  hints?: string[];
  diseaseSlugs: string[];
  countryCodes: string[];
  unknownCause: boolean;
}

export interface Classification {
  contentType: ContentType;
  outbreakRelevant: boolean;
  reason: string;
}

const RE = {
  media: /\b(podcasts?|episode|webinars?|videos?|vodcast|audio|infographics?|e-?cards?|photo (story|gallery)|live ?stream|interview series)\b/i,
  mediaUrl: /\/(podcasts?|videos?|webinars?|multimedia|media-library|infographics?)\//i,
  corporate: /\b(procurement|tenders?|call for (tenders|expressions? of interest|applications)|vacanc(y|ies)|recruitment|job opportunit|management board|advisory forum|work programme|single programming|annual (activity )?report of the (director|agency)|budget|governance|press accreditation|newsletter|traineeships?|grant agreement)\b/i,
  guidance: /\b(guidance|guidelines?|guide (to|for)|technical (report|document|guidance)|protocols?|toolkits?|training|e-?learning|course|handbook|manual|checklists?|framework|strategy|operational (tool|considerations)|public health (considerations|advice)|scientific advice|systematic review|literature review|evidence review|methodolog(y|ies)|questions and answers|q ?& ?a|fact ?sheets?|factsheets?|recommendations? (for|on)|how to|preparedness plan|vaccination schedule)\b/i,
  riskAssessment: /\b((rapid )?risk assessment|threat assessment brief|rapid scientific advice)\b/i,
  surveillanceReport: /\b(annual epidemiological report|surveillance (report|atlas|data|summary|overview)|monitoring report|data (portal|dashboard)|epidemiological (data|report) for \d{4}|seasonal surveillance|weekly surveillance)\b/i,
  situation: /\b(communicable disease threats report|epidemiological update|situation (update|report)|disease outbreak news|outbreaks? (of|in|update)|cluster of|cases? (of|in|reported)|deaths?|transmission|notified|detected in|confirmed in|reported in|weekly threats)\b/i,
  outbreakWord: /\b(outbreaks?|epidemic|cluster|cases|deaths|suspected|confirmed)\b/i,
};

export function classifyContent(x: ClassifyInput): Classification {
  const title = x.title;
  const hints = (x.hints ?? []).join(" ");
  if (x.adapter === "WHO_DON_API") return { contentType: "OUTBREAK_REPORT", outbreakRelevant: true, reason: "WHO Disease Outbreak News item (outbreak notice by definition)" };
  if (RE.media.test(title) || RE.media.test(hints) || RE.mediaUrl.test(x.url)) return { contentType: "PODCAST_MEDIA", outbreakRelevant: false, reason: "podcast/video/media item" };
  if (RE.corporate.test(title)) return { contentType: "CORPORATE", outbreakRelevant: false, reason: "corporate/procurement/organisational item" };
  // A title that IS a risk assessment ("Rapid risk assessment: …", "Threat Assessment Brief: …").
  if (/^(rapid )?(risk|threat) assessment( brief)?\b|^rapid scientific advice\b/i.test(title)) return { contentType: "RISK_ASSESSMENT", outbreakRelevant: true, reason: "risk assessment" };
  // Guidance outranks outbreak words in the title ("Guidance for managing mpox outbreaks", "Operational tool on
  // rapid risk assessment methodology" are still guidance).
  if (RE.guidance.test(title)) return { contentType: "GUIDANCE", outbreakRelevant: false, reason: "guidance/technical/training publication" };
  if (RE.riskAssessment.test(title)) return { contentType: "RISK_ASSESSMENT", outbreakRelevant: true, reason: "risk assessment" };
  if (RE.surveillanceReport.test(title)) return { contentType: "SURVEILLANCE_REPORT", outbreakRelevant: false, reason: "routine surveillance/annual report (not an active-event notice)" };
  const subject = x.diseaseSlugs.length > 0 || x.unknownCause;
  if (RE.situation.test(title) || (subject && RE.outbreakWord.test(`${title} ${x.lead}`))) {
    return subject || x.countryCodes.length > 0
      ? { contentType: "SITUATION_UPDATE", outbreakRelevant: true, reason: "reports cases/events" }
      : { contentType: "SITUATION_UPDATE", outbreakRelevant: /communicable disease threats report|weekly threats/i.test(title), reason: "event-style wording without a recognised disease or location" };
  }
  if (subject && x.countryCodes.length > 0) return { contentType: "OUTBREAK_REPORT", outbreakRelevant: true, reason: "names a disease and an event location" };
  return { contentType: "GENERAL_PUBLICATION", outbreakRelevant: false, reason: subject ? "disease topic without an event location or event wording" : "no disease, unknown-cause signal or event wording" };
}
