# -*- coding: utf-8 -*-
"""Build every release sheet for the 3 September 2026 fold.

The ids follow the day's `वृत्त क्र.` numbers, and the translations that close
the fold take their original's number with a `-hi` / `-en` suffix, the same way
the 1 and 2 September sets are named.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_release_docx import write

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "public", "dgipr", "docs")
TEMPLATE = os.path.join(OUT, "ms-3326.docx")
DATE_MR = "३ सप्टेंबर २०२६"
DATELINE = "मुंबई · ३ सप्टेंबर २०२६"
DELHI_DATELINE = "नवी दिल्ली · ३ सप्टेंबर २०२६"
DGIPR = "माहिती व जनसंपर्क महासंचालनालय"
MPK = "महाराष्ट्र परिचय केंद्र, नवी दिल्ली"

# row index in the parsed fold → id, विषय, issuing office
PLAN = {
    0:  ("ms-3392", "गृहनिर्माण व नगरविकास", DGIPR),
    1:  ("ms-3391", "सार्वजनिक आरोग्य", DGIPR),
    2:  ("ms-3390", "आदिवासी विकास", DGIPR),
    3:  ("ms-3389", "शालेय शिक्षण", DGIPR),
    4:  ("ms-3388", "ग्रामविकास", DGIPR),
    5:  ("ms-3387", "मदत व पुनर्वसन", DGIPR),
    6:  ("ms-3386", "उद्योग व पणन", DGIPR),
    7:  ("ms-3385", "सांस्कृतिक कार्य", DGIPR),
    8:  ("ms-3384", "माहिती व जनसंपर्क", DGIPR),
    9:  ("ms-3383", "परिवहन", DGIPR),
    10: ("ms-3382", "सांस्कृतिक कार्य", DGIPR),
    11: ("ms-3381", "सांस्कृतिक कार्य", DGIPR),
    12: ("ms-3380", "ऊर्जा", MPK),
    13: ("ms-3379", "उद्योग व सांस्कृतिक कार्य", MPK),
    14: ("ms-3378", "उच्च व तंत्र शिक्षण", DGIPR),
    15: ("ms-3377", "गृहनिर्माण", DGIPR),
    16: ("ms-3376", "नगरविकास", DGIPR),
    17: ("ms-3375", "सार्वजनिक बांधकाम", DGIPR),
    18: ("ms-3374", "सार्वजनिक आरोग्य", DGIPR),
    19: ("ms-3373", "महिला व बाल विकास", DGIPR),
    20: ("ms-3378-hi", "उच्च व तंत्र शिक्षण", DGIPR),
    21: ("ms-3378-en", "उच्च व तंत्र शिक्षण", DGIPR),
    22: ("ms-3384-en", "माहिती व जनसंपर्क", DGIPR),
    23: ("ms-3384-hi", "माहिती व जनसंपर्क", DGIPR),
    24: ("ms-3383-en", "परिवहन", DGIPR),
    25: ("ms-3383-hi", "परिवहन", DGIPR),
    26: ("ms-3389-en", "शालेय शिक्षण", DGIPR),
    27: ("ms-3389-hi", "शालेय शिक्षण", DGIPR),
    28: ("ms-3381-en", "सांस्कृतिक कार्य", DGIPR),
    29: ("ms-3381-hi", "सांस्कृतिक कार्य", DGIPR),
    30: ("ms-3392-en", "गृहनिर्माण व नगरविकास", DGIPR),
    31: ("ms-3392-hi", "गृहनिर्माण व नगरविकास", DGIPR),
}

# the two New Delhi releases carry their own dateline
DELHI = {"ms-3380", "ms-3379"}


def main(fold_json):
    rows = json.load(open(fold_json, encoding="utf8"))
    assert len(rows) == len(PLAN), f"{len(rows)} blocks, {len(PLAN)} planned"

    for i, rel in enumerate(rows):
        rid, category, office = PLAN[i]
        rel["category"] = category
        rel["office"] = office
        path = os.path.join(OUT, rid + ".docx")
        write(TEMPLATE, path, rel, DATE_MR, DELHI_DATELINE if rid in DELHI else DATELINE)
        print(rid, "·", " ".join(rel["headline"])[:70])


if __name__ == "__main__":
    main(sys.argv[1])
