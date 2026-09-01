/**
 * The Council of Ministers, as the Gazette names them and as the press writes
 * them.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS AN ASSERTION, AND IT IS THE ONLY ONE THE NEWS MAP MAKES.
 *
 * Everything else on this map is a count of rows. `scripts/news/db.mjs` stores
 * only what a source said, `prominence.ts` derives a level from where editors
 * put a link, and `fire.ts` refuses to let the one model in this project vote
 * on what is burning. None of that machinery can tell you who the Minister for
 * Revenue is, because no newspaper article states it — so this file states it,
 * out loud, in one place, with the date of the order it comes from.
 *
 * The source is the Gazette list of 02 February 2026, superseding the orders of
 * 21 December 2024, 23 May 2025, 31 July 2025 and 22 December 2025. When there
 * is a reshuffle, this file is the edit. Nothing is re-scraped and nothing is
 * re-derived, which is the whole reason the match is made at read time rather
 * than written into `news.db` — see the header of `lib/news/ministers.ts`.
 * ---------------------------------------------------------------------------
 *
 * WHY EACH ENTRY CARRIES TWO KINDS OF NAME.
 *
 * `formalMr` is what the Gazette prints, under the naming convention that puts
 * the mother's and father's names between the given name and the surname —
 * `श्री. देवेंद्र सरिता गंगाधरराव फडणवीस`. It is here for provenance and is
 * **never matched on**: measured against the 1,086-article corpus, all 41
 * formal names score exactly zero. No newspaper writes them.
 *
 * `aliasesMr` and `aliasesEn` are what the press actually writes, and every one
 * of them was checked against the corpus before it was put here. Deriving them
 * mechanically from the formal name gets 26 of 41 right and fails the rest for
 * reasons no rule would have caught:
 *
 *   - spelling         Gazette `ऊईके`, press `उईके`             (0 hits, then 7)
 *   - hyphenation      Gazette `विखे-पाटील`, press `विखे पाटील`  (0, then 4)
 *   - titles           Gazette `शिवेंद्रसिंह`, press `शिवेंद्रसिंहराजे` (0, then 4)
 *   - familiar form    Gazette `दादाजी भुसे`, press `दादा भुसे`  (0, then 3)
 *   - two spellings    the press writes both `आशिष शेलार` and `आशीष शेलार`
 *
 * The English forms are not a translation convenience. Both mastheads tag their
 * articles bilingually and the Latin form is often the richer of the two —
 * `fadnavis` matches 82 articles where `फडणवीस` matches 75.
 *
 * WHY BARE SURNAMES ARE MOSTLY ABSENT.
 *
 * A surname alone is the tempting alias and it is usually wrong. `पाटील` alone
 * matches 80 articles across three sitting ministers and every other Patil in
 * Maharashtra; `भोसले` pulls in उदयनराजे; `जयस्वाल` is almost always संजीव
 * जयस्वाल of MHADA; `नाईक` is mostly doctors and councillors. `पवार` is the
 * sharpest case — 38 articles, of which the Deputy Chief Minister's are three.
 *
 * A bare surname appears below only where it was measured to be unambiguous in
 * this corpus — where every occurrence of the surname was already an occurrence
 * of the full name. That is a fact about a fortnight of news and not a law, so
 * the rule is written here for whoever re-checks it.
 *
 * WHO IS DELIBERATELY NOT IN THIS FILE.
 *
 * `अजित पवार` is not a minister in this Council and has no entry. The Deputy
 * Chief Minister is `श्रीमती सुनेत्रा अजित पवार` — a different person, whose
 * name the press writes as `सुनेत्रा पवार` and never in the Gazette's
 * three-part form. Matching him to her chip would be the single worst error
 * this feature could make, so it is named here rather than left to be inferred.
 */
import type { MinisterFilter, MinisterTier } from "@/types/news";

export type Minister = {
  /** Stable slug. Appears in `?minister=` and must never collide with a tier
   *  id — see `asMinisterFilter`, which resolves the two from one parameter. */
  id: string;
  tier: MinisterTier;
  /** The Gazette's own name. Provenance only; matched on never. */
  formalMr: string;
  /** What the map calls them — the form a Marathi reader would recognise. */
  nameMr: string;
  /** The portfolios as the Gazette assigns them, kept whole and in Marathi. */
  portfolioMr: string;
  /** Marathi forms verified against the corpus. Matched at word boundaries. */
  aliasesMr: string[];
  /** Latin forms, matched case-insensitively. Both mastheads tag in both. */
  aliasesEn: string[];
};

/** The order of the Gazette list, which is the order the plate prints. */
export const MINISTERS: Minister[] = [
  {
    id: "fadnavis",
    tier: "cm",
    formalMr: "श्री. देवेंद्र सरिता गंगाधरराव फडणवीस",
    nameMr: "देवेंद्र फडणवीस",
    portfolioMr:
      "गृह, ऊर्जा (अपारंपरिक ऊर्जा वगळून), विधि व न्याय, सामान्य प्रशासन, माहिती व जनसंपर्क",
    // The one bare surname with no competition anywhere in the corpus, and the
    // most-used form of the most-covered name on the map.
    aliasesMr: ["देवेंद्र फडणवीस", "फडणवीस"],
    aliasesEn: ["devendra fadnavis", "fadnavis"],
  },
  {
    id: "e-shinde",
    tier: "dcm",
    formalMr: "श्री. एकनाथ गंगुबाई संभाजी शिंदे",
    nameMr: "एकनाथ शिंदे",
    portfolioMr: "नगरविकास, गृहनिर्माण, सार्वजनिक बांधकाम (सार्वजनिक उपक्रम)",
    // Never bare `शिंदे`: 64 articles, of which 33 are his. The rest are
    // श्रीकांत, अजिंक्य and a dozen unrelated Shindes.
    aliasesMr: ["एकनाथ शिंदे"],
    aliasesEn: ["eknath shinde"],
  },
  {
    id: "s-pawar",
    tier: "dcm",
    formalMr: "श्रीमती सुनेत्रा अजित पवार",
    nameMr: "सुनेत्रा पवार",
    portfolioMr: "राज्य उत्पादन शुल्क, क्रीडा व युवक कल्याण, अल्पसंख्याक विकास व औकाफ",
    // The Gazette's three-part form appears zero times; the press writes the
    // two-word form. Her articles also carry `अजित पवार` as a separate tag,
    // which is a different person and correctly maps to no chip at all.
    aliasesMr: ["सुनेत्रा पवार", "सुनेत्रा अजित पवार"],
    aliasesEn: ["sunetra pawar", "sunetra ajit pawar"],
  },
  {
    id: "bawankule",
    tier: "min",
    formalMr: "श्री. चंद्रशेखर प्रभावती कृष्णराव बावनकुळे",
    nameMr: "चंद्रशेखर बावनकुळे",
    portfolioMr: "महसूल",
    aliasesMr: ["चंद्रशेखर बावनकुळे", "बावनकुळे"],
    aliasesEn: ["chandrashekhar bawankule", "bawankule"],
  },
  {
    id: "bhujbal",
    tier: "min",
    formalMr: "श्री. छगन चंद्रभागा चंद्रकांत भुजबळ",
    nameMr: "छगन भुजबळ",
    portfolioMr: "अन्न, नागरी पुरवठा व ग्राहक संरक्षण",
    aliasesMr: ["छगन भुजबळ"],
    aliasesEn: ["chhagan bhujbal"],
  },
  {
    id: "vikhe-patil",
    tier: "min",
    formalMr: "श्री. राधाकृष्ण सिंधूताई एकनाथराव विखे-पाटील",
    nameMr: "राधाकृष्ण विखे पाटील",
    portfolioMr: "जलसंपदा (गोदावरी व कृष्णा खोरे विकास महामंडळ)",
    // Both punctuations, because the Gazette hyphenates and the press does not.
    aliasesMr: ["राधाकृष्ण विखे पाटील", "राधाकृष्ण विखे-पाटील"],
    aliasesEn: ["radhakrishna vikhe patil", "radhakrishna vikhe-patil"],
  },
  {
    id: "mushrif",
    tier: "min",
    formalMr: "श्री. हसन सकिना मियालाल मुश्रीफ",
    nameMr: "हसन मुश्रीफ",
    portfolioMr: "वैद्यकीय शिक्षण",
    aliasesMr: ["हसन मुश्रीफ", "मुश्रीफ"],
    aliasesEn: ["hasan mushrif", "mushrif"],
  },
  {
    id: "c-patil",
    tier: "min",
    formalMr: "श्री. चंद्रकांत (दादा) सरस्वती बच्चू पाटील",
    nameMr: "चंद्रकांत पाटील",
    portfolioMr: "उच्च व तंत्रशिक्षण, संसदीय कार्य",
    aliasesMr: ["चंद्रकांत पाटील", "चंद्रकांत दादा पाटील"],
    aliasesEn: ["chandrakant patil", "chandrakant dada patil"],
  },
  {
    id: "mahajan",
    tier: "min",
    formalMr: "श्री. गिरीश गिता दत्तात्रय महाजन",
    nameMr: "गिरीश महाजन",
    portfolioMr: "जलसंपदा (विदर्भ, तापी व कोकण खोरे विकास महामंडळ), आपत्ती व्यवस्थापन",
    // Not bare `महाजन`: 12 articles against his 9, the difference being two
    // unrelated Mahajans in a single crime story.
    aliasesMr: ["गिरीश महाजन"],
    aliasesEn: ["girish mahajan"],
  },
  {
    id: "g-naik",
    tier: "min",
    formalMr: "श्री. गणेश सुभद्रा रामचंद्र नाईक",
    nameMr: "गणेश नाईक",
    portfolioMr: "वने",
    aliasesMr: ["गणेश नाईक"],
    aliasesEn: ["ganesh naik"],
  },
  {
    id: "g-patil",
    tier: "min",
    formalMr: "श्री. गुलाबराव रेवाबाई रघुनाथ पाटील",
    nameMr: "गुलाबराव पाटील",
    portfolioMr: "पाणीपुरवठा व स्वच्छता",
    aliasesMr: ["गुलाबराव पाटील"],
    aliasesEn: ["gulabrao patil"],
  },
  {
    id: "bhuse",
    tier: "min",
    formalMr: "श्री. दादाजी रेश्माबाई दगडू भुसे",
    nameMr: "दादा भुसे",
    portfolioMr: "शालेय शिक्षण",
    // The press uses the familiar form almost exclusively — the Gazette's
    // `दादाजी भुसे` matches nothing at all.
    aliasesMr: ["दादा भुसे", "दादाजी भुसे"],
    aliasesEn: ["dada bhuse", "dadaji bhuse"],
  },
  {
    id: "rathod",
    tier: "min",
    formalMr: "श्री. संजय प्रमीला दुलिचंद राठोड",
    nameMr: "संजय राठोड",
    portfolioMr: "मृद व जलसंधारण",
    aliasesMr: ["संजय राठोड"],
    aliasesEn: ["sanjay rathod"],
  },
  {
    id: "lodha",
    tier: "min",
    formalMr: "श्री. मंगलप्रभात प्रेमकंवर गुमनमल लोढा",
    nameMr: "मंगलप्रभात लोढा",
    portfolioMr: "कौशल्य, रोजगार, उद्योजकता व नाविन्यता",
    // Not bare `लोढा`, which is also a builder every property page names.
    aliasesMr: ["मंगलप्रभात लोढा"],
    aliasesEn: ["mangal prabhat lodha", "mangalprabhat lodha"],
  },
  {
    id: "samant",
    tier: "min",
    formalMr: "श्री. उदय स्वरुपा रविंद्र सामंत",
    nameMr: "उदय सामंत",
    portfolioMr: "उद्योग, मराठी भाषा",
    aliasesMr: ["उदय सामंत", "सामंत"],
    aliasesEn: ["uday samant"],
  },
  {
    id: "rawal",
    tier: "min",
    formalMr: "श्री. जयकुमार नयनकुवर जितेंद्रसिंह रावल",
    nameMr: "जयकुमार रावल",
    portfolioMr: "पणन, राजशिष्टाचार",
    aliasesMr: ["जयकुमार रावल"],
    aliasesEn: ["jaykumar rawal"],
  },
  {
    id: "p-munde",
    tier: "min",
    formalMr: "श्रीमती पंकजा प्रज्ञा गोपीनाथ मुंडे",
    nameMr: "पंकजा मुंडे",
    portfolioMr: "पर्यावरण व वातावरणीय बदल, पशुसंवर्धन",
    aliasesMr: ["पंकजा मुंडे"],
    aliasesEn: ["pankaja munde"],
  },
  {
    id: "save",
    tier: "min",
    formalMr: "श्री. अतुल लिलावती मोरेश्वर सावे",
    nameMr: "अतुल सावे",
    portfolioMr: "इतर मागास बहुजन कल्याण, दुग्धविकास, अपारंपरिक ऊर्जा, दिव्यांग कल्याण",
    // Bare `सावे` would be a disaster: it sits inside `तपासावे` and `सावेडी`,
    // which is why the matcher works on word boundaries and this entry carries
    // the full name only.
    aliasesMr: ["अतुल सावे"],
    aliasesEn: ["atul save"],
  },
  {
    id: "uike",
    tier: "min",
    formalMr: "डॉ. अशोक जनाबाई रामाजी ऊईके",
    nameMr: "अशोक उईके",
    portfolioMr: "आदिवासी विकास",
    // The Gazette spells the surname with ऊ and the press with उ. Both are
    // carried; only the second one ever matches.
    aliasesMr: ["अशोक उईके", "अशोक ऊईके"],
    aliasesEn: ["ashok uike"],
  },
  {
    id: "desai",
    tier: "min",
    formalMr: "श्री. शंभूराज विजयादेवी शिवाजीराव देसाई",
    nameMr: "शंभूराज देसाई",
    portfolioMr: "पर्यटन, खनिकर्म, माजी सैनिक कल्याण",
    aliasesMr: ["शंभूराज देसाई"],
    aliasesEn: ["shambhuraj desai"],
  },
  {
    id: "shelar",
    tier: "min",
    formalMr: "ॲड. आशिष मिनल बाबाजी शेलार",
    nameMr: "आशिष शेलार",
    portfolioMr: "माहिती तंत्रज्ञान, सांस्कृतिक कार्य",
    // The press cannot agree with itself on the vowel; both spellings occur.
    aliasesMr: ["आशिष शेलार", "आशीष शेलार"],
    aliasesEn: ["ashish shelar", "aashish shelar"],
  },
  {
    id: "bharane",
    tier: "min",
    formalMr: "श्री. दत्तात्रय गिरीजाबाई विठोबा भरणे",
    nameMr: "दत्तात्रय भरणे",
    portfolioMr: "कृषी",
    aliasesMr: ["दत्तात्रय भरणे"],
    aliasesEn: ["dattatray bharane", "dattatray bharne"],
  },
  {
    id: "tatkare",
    tier: "min",
    formalMr: "कु. आदिती वरदा सुनिल तटकरे",
    nameMr: "आदिती तटकरे",
    portfolioMr: "महिला व बालविकास",
    // Not bare `तटकरे`: her father सुनील तटकरे is tagged in the same stories.
    aliasesMr: ["आदिती तटकरे"],
    aliasesEn: ["aditi tatkare"],
  },
  {
    id: "bhosale",
    tier: "min",
    formalMr: "श्री. शिवेंद्रसिंह अरुणाराजे अभयसिंहराजे भोसले",
    nameMr: "शिवेंद्रसिंहराजे भोसले",
    portfolioMr: "सार्वजनिक बांधकाम (सार्वजनिक उपक्रम वगळून)",
    // The press keeps the राजे the Gazette drops. Bare `भोसले` would collect
    // उदयनराजे and रणजितसिंह in the same district.
    aliasesMr: ["शिवेंद्रसिंहराजे भोसले", "शिवेंद्रसिंह भोसले"],
    aliasesEn: ["shivendrasinh bhosale", "shivendraraje bhosale"],
  },
  {
    id: "gore",
    tier: "min",
    formalMr: "श्री. जयकुमार कमल भगवानराव गोरे",
    nameMr: "जयकुमार गोरे",
    portfolioMr: "ग्रामविकास व पंचायत राज",
    aliasesMr: ["जयकुमार गोरे"],
    aliasesEn: ["jaykumar gore"],
  },
  {
    id: "zirwal",
    tier: "min",
    formalMr: "श्री. नरहरी सावित्रीबाई सिताराम झिरवाळ",
    nameMr: "नरहरी झिरवाळ",
    portfolioMr: "अन्न व औषध प्रशासन, विशेष सहाय्य",
    aliasesMr: ["नरहरी झिरवाळ", "झिरवाळ"],
    aliasesEn: ["narhari zirwal"],
  },
  {
    id: "savkare",
    tier: "min",
    formalMr: "श्री. संजय सुशीला वामन सावकारे",
    nameMr: "संजय सावकारे",
    portfolioMr: "वस्त्रोद्योग",
    aliasesMr: ["संजय सावकारे"],
    aliasesEn: ["sanjay savkare"],
  },
  {
    id: "shirsat",
    tier: "min",
    formalMr: "श्री. संजय शकुंतला पांडुरंग शिरसाट",
    nameMr: "संजय शिरसाट",
    portfolioMr: "सामाजिक न्याय",
    aliasesMr: ["संजय शिरसाट"],
    aliasesEn: ["sanjay shirsat"],
  },
  {
    id: "sarnaik",
    tier: "min",
    formalMr: "श्री. प्रताप इंदिराबाई बाबुराव सरनाईक",
    nameMr: "प्रताप सरनाईक",
    portfolioMr: "परिवहन",
    // `सरनाईक` contains `नाईक`. Word-boundary matching is what keeps his
    // articles off गणेश नाईक's chip — see `boundedPattern`.
    aliasesMr: ["प्रताप सरनाईक"],
    aliasesEn: ["pratap sarnaik"],
  },
  {
    id: "gogawale",
    tier: "min",
    formalMr: "श्री. भरत विठाबाई मारुती गोगावले",
    nameMr: "भरत गोगावले",
    portfolioMr: "रोजगार हमी योजना, फलोत्पादन, खारभूमी विकास",
    aliasesMr: ["भरत गोगावले", "गोगावले"],
    aliasesEn: ["bharat gogawale"],
  },
  {
    id: "m-jadhav",
    tier: "min",
    formalMr: "श्री. मकरंद सुमन लक्ष्मणराव जाधव (पाटील)",
    nameMr: "मकरंद जाधव (पाटील)",
    portfolioMr: "मदत व पुनर्वसन",
    // The one entry where the press splits between two surnames, because the
    // Gazette itself gives him both.
    aliasesMr: ["मकरंद जाधव", "मकरंद पाटील", "मकरंद जाधव पाटील"],
    aliasesEn: ["makarand jadhav", "makarand patil"],
  },
  {
    id: "n-rane",
    tier: "min",
    formalMr: "श्री. नितेश निलम नारायण राणे",
    nameMr: "नितेश राणे",
    portfolioMr: "मत्स्यव्यवसाय व बंदरे",
    aliasesMr: ["नितेश राणे"],
    aliasesEn: ["nitesh rane"],
  },
  {
    id: "fundkar",
    tier: "min",
    formalMr: "श्री. आकाश सुनिता पांडुरंग फुंडकर",
    nameMr: "आकाश फुंडकर",
    portfolioMr: "कामगार",
    aliasesMr: ["आकाश फुंडकर", "फुंडकर"],
    aliasesEn: ["akash fundkar", "aakash fundkar"],
  },
  {
    id: "b-patil",
    tier: "min",
    formalMr: "श्री. बाबासाहेब शांताबाई मोहनराव पाटील",
    nameMr: "बाबासाहेब पाटील",
    portfolioMr: "सहकार",
    aliasesMr: ["बाबासाहेब पाटील"],
    aliasesEn: ["babasaheb patil"],
  },
  {
    id: "abitkar",
    tier: "min",
    formalMr: "श्री. प्रकाश सुशिला आनंदराव आबिटकर",
    nameMr: "प्रकाश आबिटकर",
    portfolioMr: "सार्वजनिक आरोग्य व कुटुंब कल्याण",
    aliasesMr: ["प्रकाश आबिटकर", "आबिटकर"],
    aliasesEn: ["prakash abitkar"],
  },
  {
    id: "jaiswal",
    tier: "mos",
    formalMr: "ॲड. आशिष उमादेवी नंदकिशोर जयस्वाल",
    nameMr: "आशिष जयस्वाल",
    portfolioMr: "वित्त, नियोजन, कृषी, मदत व पुनर्वसन, विधि व न्याय, कामगार",
    // Never bare `जयस्वाल`: every occurrence in the corpus is संजीव जयस्वाल
    // of MHADA, who is not a minister.
    aliasesMr: ["आशिष जयस्वाल"],
    aliasesEn: ["ashish jaiswal"],
  },
  {
    id: "misal",
    tier: "mos",
    formalMr: "श्रीमती माधुरी मीरा सतिश मिसाळ",
    nameMr: "माधुरी मिसाळ",
    portfolioMr: "नगरविकास, परिवहन, सामाजिक न्याय, वैद्यकीय शिक्षण, अल्पसंख्याक विकास व औकाफ",
    aliasesMr: ["माधुरी मिसाळ"],
    aliasesEn: ["madhuri misal"],
  },
  {
    id: "bhoyar",
    tier: "mos",
    formalMr: "डॉ. पंकज कांचन राजेश भोयर",
    nameMr: "पंकज भोयर",
    portfolioMr: "गृह (ग्रामीण), गृहनिर्माण, शालेय शिक्षण, सहकार, खनिकर्म",
    aliasesMr: ["पंकज भोयर"],
    aliasesEn: ["pankaj bhoyar"],
  },
  {
    id: "bordikar",
    tier: "mos",
    formalMr: "श्रीमती मेघना दिपक साकोरे-बोर्डीकर",
    nameMr: "मेघना बोर्डीकर",
    portfolioMr:
      "सार्वजनिक आरोग्य व कुटुंब कल्याण, पाणीपुरवठा व स्वच्छता, ऊर्जा, महिला व बाल विकास, सार्वजनिक बांधकाम (सार्वजनिक उपक्रम)",
    aliasesMr: ["मेघना बोर्डीकर", "मेघना साकोरे-बोर्डीकर", "मेघना साकोरे बोर्डीकर"],
    aliasesEn: ["meghana bordikar", "meghna bordikar", "meghana sakore-bordikar"],
  },
  {
    id: "i-naik",
    tier: "mos",
    formalMr: "श्री. इंद्रनील अनिता मनोहर नाईक",
    nameMr: "इंद्रनील नाईक",
    portfolioMr:
      "उद्योग, सार्वजनिक बांधकाम (सार्वजनिक उपक्रम वगळून), उच्च व तंत्र शिक्षण, आदिवासी विकास, पर्यटन, मृद व जलसंधारण",
    aliasesMr: ["इंद्रनील नाईक"],
    aliasesEn: ["indranil naik"],
  },
  {
    id: "kadam",
    tier: "mos",
    formalMr: "श्री. योगेश ज्योती रामदास कदम",
    nameMr: "योगेश कदम",
    portfolioMr:
      "गृह (शहरे), महसूल, ग्रामविकास व पंचायत राज, अन्न, नागरी पुरवठा व ग्राहक संरक्षण, अन्न व औषध प्रशासन",
    aliasesMr: ["योगेश कदम"],
    aliasesEn: ["yogesh kadam"],
  },
];

/** The order the tiers are offered in, which is the order of precedence. */
export const MINISTER_TIERS: MinisterTier[] = ["cm", "dcm", "min", "mos"];

/** When the Council this file describes was last amended. Printed on the plate,
 *  because a roster with no date is a claim with no source. */
export const ROSTER_AS_OF = "2026-02-02";

export const MINISTER_BY_ID = new Map(MINISTERS.map((minister) => [minister.id, minister]));

/**
 * `?minister=` in, a filter or nothing out — the only place a query string is
 * believed.
 *
 * One parameter carries both kinds of selection because they are the same
 * question asked at two grains: `?minister=cm` is the Chief Minister's news and
 * `?minister=mushrif` is one minister's. Two parameters would make
 * `?minister=cm&who=mushrif` expressible, which is a state the plate has no way
 * to draw.
 *
 * Lives here rather than beside the matcher because the browser needs it too —
 * `NewsMapShell` writes this parameter back out — and `lib/news/ministers.ts`
 * is `server-only` by necessity: it opens a database. Nothing below touches
 * one, so nothing below has to stay on the server.
 */
export function asMinisterFilter(value: string | undefined): MinisterFilter | null {
  if (!value) return null;

  const tier = MINISTER_TIERS.find((id) => id === value);
  if (tier) return { kind: "tier", tier };

  return MINISTER_BY_ID.has(value) ? { kind: "one", id: value } : null;
}

/** The filter as it goes back into a URL. Null means "no filter", which is an
 *  absent parameter rather than an empty one. */
export function ministerParam(filter: MinisterFilter | null): string | null {
  if (!filter) return null;

  return filter.kind === "tier" ? filter.tier : filter.id;
}

/** Whether a set of matched roster ids satisfies a filter. Shared by the press
 *  index and the government layer, which match different text but answer the
 *  same question about the result. */
export function satisfiesFilter(ids: string[], filter: MinisterFilter): boolean {
  if (ids.length === 0) return false;

  if (filter.kind === "one") return ids.includes(filter.id);

  return ids.some((id) => MINISTER_BY_ID.get(id)?.tier === filter.tier);
}
