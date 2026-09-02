# -*- coding: utf-8 -*-
"""Build every release sheet for the 2 September 2026 fold.

The ids follow the day's `वृत्त क्र.` numbers, and the translations that close
the fold take their original's number with a `-hi` / `-en` suffix, the same way
the 1 September set is named.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_release_docx import write

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "public", "dgipr", "docs")
TEMPLATE = os.path.join(OUT, "ms-3326.docx")
DATE_MR = "२ सप्टेंबर २०२६"
DATELINE = "मुंबई · २ सप्टेंबर २०२६"
DGIPR = "माहिती व जनसंपर्क महासंचालनालय"
CMO = "मुख्यमंत्री सचिवालय (जनसंपर्क कक्ष)"

# row index in the parsed fold → id, विषय, issuing office
PLAN = {
    0:  ("ms-3372", "कृषी", DGIPR),
    1:  ("ms-3371", "आपत्ती व्यवस्थापन", DGIPR),
    2:  ("ms-3370", "महिला व बाल विकास", DGIPR),
    3:  ("ms-3369", "उच्च व तंत्र शिक्षण", DGIPR),
    4:  ("ms-3368", "सार्वजनिक आरोग्य", DGIPR),
    5:  ("ms-3367", "सार्वजनिक आरोग्य", DGIPR),
    6:  ("ms-3366", "पणन व राजशिष्टाचार", DGIPR),
    7:  ("ms-3365", "आदिवासी विकास", DGIPR),
    8:  ("ms-3364", "आदिवासी विकास", DGIPR),
    9:  ("ms-3363", "शालेय शिक्षण", DGIPR),
    10: ("ms-3362", "सहकार", DGIPR),
    11: ("ms-3361", "सामाजिक न्याय", DGIPR),
    12: ("ms-3360", "सांस्कृतिक कार्य", DGIPR),
    13: ("ms-3359", "सार्वजनिक आरोग्य", CMO),
    14: ("ms-3358", "नियोजन व प्रशासकीय सुधारणा", CMO),
    15: ("ms-3357", "उद्योग व आंतरराष्ट्रीय सहकार्य", CMO),
    16: ("ms-3356", "महसूल व वन", CMO),
    17: ("ms-3355", "सामान्य प्रशासन", DGIPR),
    18: ("ms-3354", "सहकार व साखर उद्योग", DGIPR),
    19: ("ms-3353", "पायाभूत सुविधा", DGIPR),
    20: ("ms-3352", "कौशल्य विकास व रोजगार", DGIPR),
    21: ("ms-3351", "परिवहन", DGIPR),
    22: ("ms-3350", "शालेय शिक्षण", DGIPR),
    23: ("ms-3349", "उच्च व तंत्र शिक्षण", DGIPR),
    24: ("ms-3348", "सांस्कृतिक कार्य", DGIPR),
    25: ("ms-3347", "महाराष्ट्र लोकसेवा आयोग", DGIPR),
    26: ("ms-3369-hi", "उच्च व तंत्र शिक्षण", DGIPR),
    27: ("ms-3369-en", "उच्च व तंत्र शिक्षण", DGIPR),
    28: ("ms-3359-en", "सार्वजनिक आरोग्य", CMO),
    29: ("ms-3359-hi", "सार्वजनिक आरोग्य", CMO),
    30: ("ms-3358-en", "नियोजन व प्रशासकीय सुधारणा", CMO),
    31: ("ms-3358-hi", "नियोजन व प्रशासकीय सुधारणा", CMO),
    32: ("ms-3357-en", "उद्योग व आंतरराष्ट्रीय सहकार्य", CMO),
    33: ("ms-3357-hi", "उद्योग व आंतरराष्ट्रीय सहकार्य", CMO),
    34: ("ms-3349-en", "उच्च व तंत्र शिक्षण", DGIPR),
    35: ("ms-3349-hi", "उच्च व तंत्र शिक्षण", DGIPR),
}


def main(fold_json):
    rows = json.load(open(fold_json, encoding="utf8"))
    assert len(rows) == len(PLAN), f"{len(rows)} blocks, {len(PLAN)} planned"

    for i, rel in enumerate(rows):
        rid, category, office = PLAN[i]
        # 3356 opens with the issuing office on its own line, not a headline
        if rel["headline"] and rel["headline"][0] == CMO:
            rel["headline"].pop(0)
        rel["category"] = category
        rel["office"] = office
        path = os.path.join(OUT, rid + ".docx")
        write(TEMPLATE, path, rel, DATE_MR, DATELINE)
        print(rid, "·", " ".join(rel["headline"])[:70])


if __name__ == "__main__":
    main(sys.argv[1])
