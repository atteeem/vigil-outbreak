// Disease reference data: names, causative agents and the keywords the extractor uses
// (lib/ingestion/extract.ts normalises case, hyphens and apostrophes, so "West-Nile" matches "west nile").
// Loaded by the seed and, non-destructively, by `npm run db:reference` (upserts diseases only).

export interface DiseaseRef {
  slug: string;
  name: string;
  pathogen: string | null;
  pathogenType: string;
  category: string;
  keywords: string[];
  description: string | null;
}

export const DISEASES: DiseaseRef[] = [
  { slug: "plague", name: "Plague", pathogen: "Yersinia pestis", pathogenType: "BACTERIUM", category: "ZOONOTIC", keywords: ["plague", "pneumonic plague", "bubonic plague", "septicemic plague", "yersinia pestis", "y. pestis"], description: "Bacterial zoonosis caused by Yersinia pestis. Pneumonic plague (lung infection) can spread person-to-person via respiratory droplets; treatable with antibiotics if started early." },
  { slug: "ebola", name: "Ebola disease", pathogen: "Orthoebolavirus spp. (incl. Bundibugyo virus)", pathogenType: "VIRUS", category: "HEMORRHAGIC", keywords: ["ebola", "bundibugyo", "ebolavirus", "orthoebolavirus"], description: "Severe viral haemorrhagic disease. Bundibugyo virus has no licensed vaccine or therapeutic." },
  { slug: "marburg", name: "Marburg virus disease", pathogen: "Orthomarburgvirus marburgense", pathogenType: "VIRUS", category: "HEMORRHAGIC", keywords: ["marburg"], description: null },
  { slug: "mpox", name: "Mpox", pathogen: "Monkeypox virus (MPXV)", pathogenType: "VIRUS", category: "ZOONOTIC", keywords: ["mpox", "monkeypox", "monkeypox virus", "mpxv", "clade ib", "clade ia", "clade iib"], description: null },
  { slug: "avian-influenza", name: "Avian influenza", pathogen: "Influenza A virus (e.g. A(H5N1))", pathogenType: "VIRUS", category: "RESPIRATORY", keywords: ["avian influenza", "bird flu", "highly pathogenic avian influenza", "hpai", "h5n1", "h5n6", "h5n8", "h7n9", "h9n2", "h5n2", "h10n3", "a(h5n1)", "a(h5n6)", "a(h9n2)", "a(h7n9)", "a(h10n3)", "influenza a(h5", "zoonotic influenza", "swine influenza", "variant influenza", "a(h1n2)v", "a(h3n2)v"], description: null },
  { slug: "yellow-fever", name: "Yellow fever", pathogen: "Yellow fever virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["yellow fever"], description: null },
  { slug: "cholera", name: "Cholera", pathogen: "Vibrio cholerae", pathogenType: "BACTERIUM", category: "ENTERIC", keywords: ["cholera", "vibrio cholerae"], description: null },
  { slug: "measles", name: "Measles", pathogen: "Measles virus", pathogenType: "VIRUS", category: "VACCINE_PREVENTABLE", keywords: ["measles"], description: null },
  { slug: "dengue", name: "Dengue", pathogen: "Dengue virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["dengue"], description: null },
  { slug: "nipah", name: "Nipah virus infection", pathogen: "Nipah virus", pathogenType: "VIRUS", category: "ZOONOTIC", keywords: ["nipah"], description: null },
  { slug: "mers", name: "MERS", pathogen: "MERS-CoV", pathogenType: "VIRUS", category: "RESPIRATORY", keywords: ["mers", "mers-cov", "middle east respiratory syndrome"], description: null },
  { slug: "covid-19", name: "COVID-19", pathogen: "SARS-CoV-2", pathogenType: "VIRUS", category: "RESPIRATORY", keywords: ["covid-19", "covid", "sars-cov-2", "coronavirus disease"], description: null },
  { slug: "anthrax", name: "Anthrax", pathogen: "Bacillus anthracis", pathogenType: "BACTERIUM", category: "ZOONOTIC", keywords: ["anthrax", "bacillus anthracis"], description: null },
  { slug: "meningitis", name: "Meningococcal disease", pathogen: "Neisseria meningitidis", pathogenType: "BACTERIUM", category: "VACCINE_PREVENTABLE", keywords: ["meningitis", "meningococcal", "neisseria meningitidis", "invasive meningococcal disease"], description: null },
  { slug: "diphtheria", name: "Diphtheria", pathogen: "Corynebacterium diphtheriae", pathogenType: "BACTERIUM", category: "VACCINE_PREVENTABLE", keywords: ["diphtheria"], description: null },
  { slug: "polio", name: "Poliomyelitis", pathogen: "Poliovirus", pathogenType: "VIRUS", category: "VACCINE_PREVENTABLE", keywords: ["polio", "poliovirus", "poliomyelitis", "cvdpv2", "wpv1"], description: null },
  { slug: "lassa", name: "Lassa fever", pathogen: "Lassa virus", pathogenType: "VIRUS", category: "HEMORRHAGIC", keywords: ["lassa"], description: null },
  { slug: "cchf", name: "Crimean-Congo haemorrhagic fever", pathogen: "CCHF virus", pathogenType: "VIRUS", category: "HEMORRHAGIC", keywords: ["crimean-congo", "crimean congo haemorrhagic fever", "crimean congo hemorrhagic fever", "cchf"], description: null },
  { slug: "chikungunya", name: "Chikungunya", pathogen: "Chikungunya virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["chikungunya"], description: null },
  { slug: "oropouche", name: "Oropouche virus disease", pathogen: "Oropouche virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["oropouche"], description: null },
  { slug: "west-nile", name: "West Nile virus infection", pathogen: "West Nile virus (Orthoflavivirus nilense)", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["west nile", "west nile virus", "west nile fever", "west nile neuroinvasive disease", "wnv", "wnnd"], description: "Mosquito-borne flavivirus; most infections are asymptomatic, about 1% cause neuroinvasive disease. Seasonal transmission in Europe (June–November)." },
  { slug: "usutu", name: "Usutu virus infection", pathogen: "Usutu virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["usutu"], description: null },
  { slug: "tick-borne-encephalitis", name: "Tick-borne encephalitis", pathogen: "Tick-borne encephalitis virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["tick borne encephalitis", "tick-borne encephalitis", "tbe", "tbev"], description: null },
  { slug: "japanese-encephalitis", name: "Japanese encephalitis", pathogen: "Japanese encephalitis virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["japanese encephalitis"], description: null },
  { slug: "zika", name: "Zika virus disease", pathogen: "Zika virus", pathogenType: "VIRUS", category: "VECTOR_BORNE", keywords: ["zika", "zika virus"], description: null },
  { slug: "rift-valley-fever", name: "Rift Valley fever", pathogen: "Rift Valley fever virus", pathogenType: "VIRUS", category: "ZOONOTIC", keywords: ["rift valley fever", "rvf"], description: null },
  { slug: "malaria", name: "Malaria", pathogen: "Plasmodium spp.", pathogenType: "PARASITE", category: "VECTOR_BORNE", keywords: ["malaria", "plasmodium"], description: null },
  { slug: "hantavirus", name: "Hantavirus infection", pathogen: "Orthohantavirus spp.", pathogenType: "VIRUS", category: "ZOONOTIC", keywords: ["hantavirus", "hantavirus pulmonary syndrome", "haemorrhagic fever with renal syndrome", "hemorrhagic fever with renal syndrome", "andes virus"], description: null },
  { slug: "rabies", name: "Rabies", pathogen: "Rabies lyssavirus", pathogenType: "VIRUS", category: "ZOONOTIC", keywords: ["rabies", "lyssavirus"], description: null },
  { slug: "leptospirosis", name: "Leptospirosis", pathogen: "Leptospira spp.", pathogenType: "BACTERIUM", category: "ZOONOTIC", keywords: ["leptospirosis", "leptospira"], description: null },
  { slug: "legionnaires", name: "Legionnaires' disease", pathogen: "Legionella pneumophila", pathogenType: "BACTERIUM", category: "RESPIRATORY", keywords: ["legionnaires", "legionnaires' disease", "legionellosis", "legionella"], description: null },
  { slug: "tularaemia", name: "Tularaemia", pathogen: "Francisella tularensis", pathogenType: "BACTERIUM", category: "ZOONOTIC", keywords: ["tularaemia", "tularemia", "francisella tularensis"], description: null },
  { slug: "q-fever", name: "Q fever", pathogen: "Coxiella burnetii", pathogenType: "BACTERIUM", category: "ZOONOTIC", keywords: ["q fever", "coxiella"], description: null },
  { slug: "brucellosis", name: "Brucellosis", pathogen: "Brucella spp.", pathogenType: "BACTERIUM", category: "ZOONOTIC", keywords: ["brucellosis", "brucella"], description: null },
  { slug: "salmonellosis", name: "Salmonellosis", pathogen: "Salmonella spp.", pathogenType: "BACTERIUM", category: "ENTERIC", keywords: ["salmonellosis", "salmonella"], description: null },
  { slug: "listeriosis", name: "Listeriosis", pathogen: "Listeria monocytogenes", pathogenType: "BACTERIUM", category: "ENTERIC", keywords: ["listeriosis", "listeria"], description: null },
  { slug: "stec", name: "Shiga toxin-producing E. coli infection", pathogen: "STEC / EHEC", pathogenType: "BACTERIUM", category: "ENTERIC", keywords: ["stec", "ehec", "shiga toxin producing", "e. coli o157", "escherichia coli o157", "haemolytic uraemic syndrome", "hemolytic uremic syndrome"], description: null },
  { slug: "shigellosis", name: "Shigellosis", pathogen: "Shigella spp.", pathogenType: "BACTERIUM", category: "ENTERIC", keywords: ["shigellosis", "shigella"], description: null },
  { slug: "hepatitis-a", name: "Hepatitis A", pathogen: "Hepatitis A virus", pathogenType: "VIRUS", category: "ENTERIC", keywords: ["hepatitis a"], description: null },
  { slug: "hepatitis-e", name: "Hepatitis E", pathogen: "Hepatitis E virus", pathogenType: "VIRUS", category: "ENTERIC", keywords: ["hepatitis e"], description: null },
  { slug: "typhoid", name: "Typhoid fever", pathogen: "Salmonella Typhi", pathogenType: "BACTERIUM", category: "ENTERIC", keywords: ["typhoid", "salmonella typhi", "enteric fever"], description: null },
  { slug: "botulism", name: "Botulism", pathogen: "Clostridium botulinum toxin", pathogenType: "TOXIN", category: "OTHER", keywords: ["botulism"], description: null },
  { slug: "pertussis", name: "Pertussis", pathogen: "Bordetella pertussis", pathogenType: "BACTERIUM", category: "VACCINE_PREVENTABLE", keywords: ["pertussis", "whooping cough"], description: null },
  { slug: "mumps", name: "Mumps", pathogen: "Mumps virus", pathogenType: "VIRUS", category: "VACCINE_PREVENTABLE", keywords: ["mumps"], description: null },
  { slug: "igas", name: "Invasive group A streptococcal disease", pathogen: "Streptococcus pyogenes", pathogenType: "BACTERIUM", category: "OTHER", keywords: ["invasive group a streptococcal", "igas", "group a streptococcus", "streptococcus pyogenes", "scarlet fever"], description: null },
  { slug: "rsv", name: "Respiratory syncytial virus infection", pathogen: "Respiratory syncytial virus", pathogenType: "VIRUS", category: "RESPIRATORY", keywords: ["respiratory syncytial virus", "rsv"], description: null },
  { slug: "influenza", name: "Seasonal influenza", pathogen: "Influenza A/B viruses", pathogenType: "VIRUS", category: "RESPIRATORY", keywords: ["seasonal influenza", "influenza"], description: "Generic influenza; suppressed when avian/zoonotic influenza is recognised in the same text." },
  { slug: "tuberculosis", name: "Tuberculosis", pathogen: "Mycobacterium tuberculosis", pathogenType: "BACTERIUM", category: "RESPIRATORY", keywords: ["tuberculosis", "multidrug resistant tb", "mdr tb", "xdr tb"], description: null },
  { slug: "candida-auris", name: "Candidozyma (Candida) auris", pathogen: "Candidozyma auris", pathogenType: "FUNGUS", category: "OTHER", keywords: ["candida auris", "candidozyma auris", "c. auris"], description: null },
  { slug: "sudan-virus", name: "Sudan virus disease", pathogen: "Orthoebolavirus sudanense", pathogenType: "VIRUS", category: "HEMORRHAGIC", keywords: ["sudan virus disease", "sudan ebolavirus"], description: null },
];
