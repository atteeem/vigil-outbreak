// Compact country gazetteer: ISO-3166 alpha-2, display name, approximate centroid, extra aliases for text
// matching. Centroids are for COUNTRY-precision markers only — they never imply where cases are.

export interface Country {
  code: string;
  name: string;
  lat: number;
  lng: number;
  aliases: string[];
}

const RAW = `AF|Afghanistan|33.9|67.7|
AL|Albania|41.2|20.2|
DZ|Algeria|28.0|1.7|
AO|Angola|-11.2|17.9|
AR|Argentina|-38.4|-63.6|
AM|Armenia|40.1|45.0|
AU|Australia|-25.3|133.8|
AT|Austria|47.5|14.6|
AZ|Azerbaijan|40.1|47.6|
BD|Bangladesh|23.7|90.4|
BY|Belarus|53.7|28.0|
BE|Belgium|50.5|4.5|
BJ|Benin|9.3|2.3|
BT|Bhutan|27.5|90.4|
BO|Bolivia|-16.3|-63.6|
BA|Bosnia and Herzegovina|43.9|17.7|Bosnia
BW|Botswana|-22.3|24.7|
BR|Brazil|-14.2|-51.9|
BN|Brunei|4.5|114.7|
BG|Bulgaria|42.7|25.5|
BF|Burkina Faso|12.2|-1.6|
BI|Burundi|-3.4|29.9|
KH|Cambodia|12.6|105.0|
CM|Cameroon|7.4|12.4|
CA|Canada|56.1|-106.3|
CF|Central African Republic|6.6|20.9|CAR
TD|Chad|15.5|18.7|
CL|Chile|-35.7|-71.5|
CN|China|35.9|104.2|People's Republic of China
CO|Colombia|4.6|-74.3|
KM|Comoros|-11.9|43.9|
CG|Congo|-0.2|15.8|Republic of the Congo;Congo-Brazzaville
CD|Democratic Republic of the Congo|-4.0|21.8|DRC;DR Congo;Congo-Kinshasa;Dem. Rep. Congo
CR|Costa Rica|9.7|-83.8|
CI|Côte d'Ivoire|7.5|-5.5|Cote d'Ivoire;Ivory Coast
HR|Croatia|45.1|15.2|
CU|Cuba|21.5|-77.8|
CY|Cyprus|35.1|33.4|
CZ|Czechia|49.8|15.5|Czech Republic
DK|Denmark|56.3|9.5|
DJ|Djibouti|11.8|42.6|
DO|Dominican Republic|18.7|-70.2|
EC|Ecuador|-1.8|-78.2|
EG|Egypt|26.8|30.8|
SV|El Salvador|13.8|-88.9|
GQ|Equatorial Guinea|1.6|10.3|
ER|Eritrea|15.2|39.8|
EE|Estonia|58.6|25.0|
SZ|Eswatini|-26.5|31.5|Swaziland
ET|Ethiopia|9.1|40.5|
FJ|Fiji|-17.7|178.1|
FI|Finland|61.9|25.7|
FR|France|46.2|2.2|
GA|Gabon|-0.8|11.6|
GM|Gambia|13.4|-15.3|
GE|Georgia|42.3|43.4|
DE|Germany|51.2|10.5|
GH|Ghana|7.9|-1.0|
GR|Greece|39.1|21.8|
GT|Guatemala|15.8|-90.2|
GN|Guinea|9.9|-9.7|
GW|Guinea-Bissau|11.8|-15.2|
GY|Guyana|4.9|-58.9|
HT|Haiti|19.0|-72.3|
HN|Honduras|15.2|-86.2|
HU|Hungary|47.2|19.5|
IS|Iceland|65.0|-19.0|
IN|India|20.6|79.0|
ID|Indonesia|-0.8|113.9|
IR|Iran|32.4|53.7|
IQ|Iraq|33.2|43.7|
IE|Ireland|53.4|-8.2|
IL|Israel|31.0|34.9|
IT|Italy|41.9|12.6|
JM|Jamaica|18.1|-77.3|
JP|Japan|36.2|138.3|
JO|Jordan|30.6|36.2|
KZ|Kazakhstan|48.0|66.9|
KE|Kenya|-0.0|37.9|
KW|Kuwait|29.3|47.5|
KG|Kyrgyzstan|41.2|74.8|
LA|Laos|19.9|102.5|Lao People's Democratic Republic
LV|Latvia|56.9|24.6|
LB|Lebanon|33.9|35.9|
LS|Lesotho|-29.6|28.2|
LR|Liberia|6.4|-9.4|
LY|Libya|26.3|17.2|
LT|Lithuania|55.2|23.9|
LU|Luxembourg|49.8|6.1|
MG|Madagascar|-18.8|46.9|
MW|Malawi|-13.3|34.3|
MY|Malaysia|4.2|102.0|
MV|Maldives|3.2|73.2|
ML|Mali|17.6|-4.0|
MR|Mauritania|21.0|-10.9|
MU|Mauritius|-20.3|57.6|
MX|Mexico|23.6|-102.6|
MD|Moldova|47.4|28.4|
MN|Mongolia|46.9|103.8|
ME|Montenegro|42.7|19.4|
MA|Morocco|31.8|-7.1|
MZ|Mozambique|-18.7|35.5|
MM|Myanmar|21.9|96.0|Burma
NA|Namibia|-22.9|18.5|
NP|Nepal|28.4|84.1|
NL|Netherlands|52.1|5.3|
NZ|New Zealand|-40.9|174.9|
NI|Nicaragua|12.9|-85.2|
NE|Niger|17.6|8.1|
NG|Nigeria|9.1|8.7|
KP|North Korea|40.3|127.5|Democratic People's Republic of Korea;DPRK
MK|North Macedonia|41.6|21.7|
NO|Norway|60.5|8.5|
OM|Oman|21.5|55.9|
PK|Pakistan|30.4|69.3|
PA|Panama|8.5|-80.8|
PG|Papua New Guinea|-6.3|143.9|
PY|Paraguay|-23.4|-58.4|
PE|Peru|-9.2|-75.0|
PH|Philippines|12.9|121.8|
PL|Poland|51.9|19.1|
PT|Portugal|39.4|-8.2|
QA|Qatar|25.4|51.2|
RO|Romania|45.9|25.0|
RU|Russia|61.5|105.3|Russian Federation;Russian
RW|Rwanda|-1.9|29.9|
SA|Saudi Arabia|23.9|45.1|
SN|Senegal|14.5|-14.5|
RS|Serbia|44.0|21.0|
SL|Sierra Leone|8.5|-11.8|
SG|Singapore|1.35|103.8|
SK|Slovakia|48.7|19.7|
SI|Slovenia|46.2|15.0|
SO|Somalia|5.2|46.2|
ZA|South Africa|-30.6|22.9|
KR|South Korea|35.9|127.8|Republic of Korea
SS|South Sudan|6.9|31.3|
ES|Spain|40.5|-3.7|
LK|Sri Lanka|7.9|80.8|
SD|Sudan|12.9|30.2|
SR|Suriname|3.9|-56.0|
SE|Sweden|60.1|18.6|
CH|Switzerland|46.8|8.2|
SY|Syria|34.8|39.0|Syrian Arab Republic
TW|Taiwan|23.7|121.0|
TJ|Tajikistan|38.9|71.3|
TZ|Tanzania|-6.4|34.9|United Republic of Tanzania
TH|Thailand|15.9|100.99|
TL|Timor-Leste|-8.9|125.7|East Timor
TG|Togo|8.6|0.8|
TT|Trinidad and Tobago|10.7|-61.2|
TN|Tunisia|33.9|9.5|
TR|Türkiye|38.96|35.2|Turkey
TM|Turkmenistan|38.97|59.6|
UG|Uganda|1.4|32.3|Ugandan
UA|Ukraine|48.4|31.2|
AE|United Arab Emirates|23.4|53.8|UAE
GB|United Kingdom|55.4|-3.4|UK;Britain;England;Scotland;Wales
US|United States|37.1|-95.7|USA;United States of America;U.S.
UY|Uruguay|-32.5|-55.8|
UZ|Uzbekistan|41.4|64.6|
VE|Venezuela|6.4|-66.6|
VN|Viet Nam|14.1|108.3|Vietnam
YE|Yemen|15.6|48.5|
ZM|Zambia|-13.1|27.8|
ZW|Zimbabwe|-19.0|29.2|`;

export const COUNTRIES: Country[] = RAW.split("\n").map((line) => {
  const [code, name, lat, lng, aliases] = line.split("|");
  return { code: code!, name: name!, lat: Number(lat), lng: Number(lng), aliases: aliases ? aliases.split(";").filter(Boolean) : [] };
});

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryByCode = (code: string | null | undefined) => (code ? BY_CODE.get(code.toUpperCase()) : undefined);
export const countryName = (code: string) => BY_CODE.get(code)?.name ?? code;

/** Ambiguous names that must not match on their own as a country (Georgia the US state, Niger vs Nigeria
 * handled by word boundaries, "Guinea" inside "Papua New Guinea" handled by longest-first matching). */
const AMBIGUOUS = new Set(["Georgia", "Chad", "Jordan", "Turkey"]);

interface Matcher { code: string; term: string; re: RegExp }
let matchers: Matcher[] | null = null;
function getMatchers(): Matcher[] {
  if (matchers) return matchers;
  const list: Matcher[] = [];
  for (const c of COUNTRIES) {
    for (const term of [c.name, ...c.aliases]) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flags = term.length <= 3 ? "" : "i"; // short codes (UK, USA, DRC) are case-sensitive
      list.push({ code: c.code, term, re: new RegExp(`(?<![\\p{L}-])${escaped}(?![\\p{L}-])`, `u${flags}`) });
    }
  }
  // Longest terms first so "Democratic Republic of the Congo" wins over "Congo" and "Papua New Guinea" over "Guinea".
  matchers = list.sort((a, b) => b.term.length - a.term.length);
  return matchers;
}

/** Finds countries mentioned in free text. Returns ISO codes in order of first appearance. */
export function findCountries(text: string): string[] {
  let working = text;
  const hits: { code: string; index: number }[] = [];
  for (const m of getMatchers()) {
    const found = m.re.exec(working);
    if (!found) continue;
    if (AMBIGUOUS.has(m.term) && !/\b(country|government|ministry|republic)\b/i.test(text)) continue;
    hits.push({ code: m.code, index: found.index });
    // Blank the match so a shorter alias ("Congo") cannot re-match inside a longer one already counted.
    working = working.slice(0, found.index) + " ".repeat(found[0].length) + working.slice(found.index + found[0].length);
  }
  const ordered = hits.sort((a, b) => a.index - b.index).map((h) => h.code);
  return [...new Set(ordered)];
}
