# Irkutsk investigation — facts awaiting primary-source validation

Record: `/outbreaks/russia-irkutsk-2026` · Classification: **Unconfirmed investigation** · Pathogen status:
**Under laboratory investigation** (plague / *Yersinia pestis*, a bacterium, suspected — not confirmed).

All facts in this record were compiled on 2026-10-08 from **search-engine results about** the cited publications.
The build environment could not open who.int, ecdc.europa.eu, reuters.com or the other publishers directly
(network policy). Every seeded article is therefore labelled **Seeded** and listed under *Primary-source
validation* on the record page until an analyst opens the original and clicks **Mark checked vs primary**
(`/admin/review?status=ACCEPTED`).

## Reclassification rule

Keep the record **unconfirmed** unless an authoritative source (WHO Disease Outbreak News or official WHO
statement, ECDC, or the Russian Federation's Rospotrebnadzor / Ministry of Health) publishes a laboratory result.
- Plague laboratory-confirmed → `pathogenStatus = CONFIRMED`, disease = Plague, classification `CONFIRMED_LOCALIZED`,
  and set `deathCauseConfirmed = true` on the death observation **only if** the death is attributed.
- Plague ruled out → `pathogenStatus = RULED_OUT`; if no outbreak remains, classification `RESOLVED`. The record
  stays public with its history.
Use the admin *Reclassify* form; it appends to the classification history with the evidence link.

## Checklist

| # | Fact as recorded | Recorded via | Primary source to check | Why it matters |
|---|---|---|---|---|
| 1 | ECDC: no reported secondary cases; no evidence of sustained human-to-human transmission; little Irkutsk–EU/EEA travel (6 Oct) | ECDC page (search summary) | [ECDC news item](https://www.ecdc.europa.eu/en/news-events/ecdc-closely-monitoring-situation-following-case-pneumonia-unknown-origin-russia) | Core official assessment; whether ECDC stated a formal risk level (recorded as "not assessed") |
| 2 | WHO: death from severe pneumonia overnight into 2 Oct; no officially confirmed cause; risk to general population appears low | Newsweek | WHO press statement / WHO EURO / any WHO DON on Russia | Drives the confirmed **death** figure (1) and the WHO risk entry |
| 3 | WHO tiered risk: moderate-to-low (Irkutsk), low (Russia), very low (WHO European Region) | Search summary, **no publication located** | WHO DON or WHO EURO statement | Recorded as UNVERIFIED with no source link; delete if no primary exists |
| 4 | WHO (6 Oct): Russia reports no plague case recorded; no plague/high-threat pathogen in close contacts; WHO awaiting confirmation | NBC News | WHO statement | Supports "unconfirmed" |
| 5 | Rospotrebnadzor (4 Oct): pneumonia of unknown origin; no microorganisms linked to the worker's professional activity; no accident at the institute; situation stable | Meduza | rospotrebnadzor.ru / 38.rospotrebnadzor.ru press release | Official cause statement; the "no accident" claim is recorded as DISPUTED |
| 6 | Rospotrebnadzor (6 Oct): contacts — 2 COVID-19, 2 rhinovirus, no plague; ~60% tested | NBC News | Rospotrebnadzor press release | Contact-testing figures (kept as statement, not as case counts) |
| 7 | Rospotrebnadzor early wording: "typical acute respiratory viral infection" | NBC News | Rospotrebnadzor | Recorded as DISPUTED/superseded |
| 8 | Hospitalised 29 Sep; died early 2 Oct in Shelekhov | Media (Moscow Times et al.) | Regional health ministry / Rospotrebnadzor | Chronology dates |
| 9 | ~200 / 189–197 contacts under observation; >100 in hospital wards | Moscow Times, Euronews | Irkutsk Oblast government / Rospotrebnadzor | Observation counts — never case counts; currently MEDIA/UNVERIFIED |
| 10 | Shelekhov district hospital quarantined; >60 institute staff isolated; mask mandate at Irkutsk Aluminium Plant; Anna Popova travelled to Irkutsk | Kyiv Independent, media | Irkutsk Oblast government, Rospotrebnadzor, RUSAL/plant notice | Precautionary measures (UNVERIFIED) |
| 11 | Buryatia head Tsydenov said "unspecified form of plague", later softened; Shelekhov warning later deleted | CNN (search summary) | Original Telegram/website posts (archived) | Key contradictory claim (DISPUTED) |
| 12 | Lyudi Baikala: test tube with plague bacteria broken on 25 Sep | Media citing Lyudi Baikala | Lyudi Baikala original article | Alleged mechanism (DISPUTED) |
| 13 | Alternative account: admitted after returning from Thailand | Search summary | Original regional report | UNVERIFIED |
| 14 | US: Rubio "not cause for alarm"; State Dept cited "reports of a fatal case of suspected pneumonic plague"; CDC: no indication of broader threat to the US | Irish Times, NBC | state.gov / cdc.gov statements | Context only |
| 15 | Reuters explainer (6 Oct) | Title only | reuters.com | Content not read; may contain facts not yet recorded |

## Claims deliberately **not** recorded

- *"The death was later confirmed to be pneumonic plague (Science)."* This wording appeared only in an automated
  search summary. The Science article's own text (6 Oct) says *"if a lab worker did die of plague…"* and reports
  expert opinion, not a diagnosis. Not recorded as a fact.
- Any infection count: no authority has reported a confirmed, probable or suspected case count. Confirmed /
  probable / suspected cases remain **Not reported** (null), not zero.
