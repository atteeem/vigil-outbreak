# Regression fixtures from the 2026-10 Windows verification run

Reconstructed from the issues reported after the first successful real-network run of `npm run verify:sources`
(WHO DON + 11 ECDC feeds verified; CDC Content Services SCHEMA_MISMATCH). They reproduce the reported cases in
the publishers' formats; they are not byte-for-byte copies of the live responses (those were not shared).

| Fixture | Reported problem |
|---|---|
| `ecdc-rss-index.html` (in ../) | "Skip to main content" discovered as an RSS feed |
| `who-don-nipah.json` | "Nipah virus infection – Bangladesh" tagged BD, IN, MY, PH, SG, MM |
| `ecdc-mixed-feed.xml` | West Nile virus not recognised; guidance, podcasts and general publications treated as outbreaks |
| CDC variants (inline in tests) | CDC Content Services SCHEMA_MISMATCH — response variants the adapter now accepts and diagnoses |
