# -*- coding: utf-8 -*-
"""Tidy the parsed 3 September 2026 fold.

The parser leaves three things behind on this day's fold: the New Delhi
office banner that opens two blocks, `वृत्त क्र.` lines written in Devanagari
digits (the parser only recognises ASCII ones), and a dateline written as
`मुंबई, ३ :` without `दि.`, which lands in the headline instead of the body.
"""
import json, re, sys

DEV = "०१२३४५६७८९"
NUM_ANY = re.compile(r"^वृत्त\s*क्र\.?\s*([0-9" + DEV + r"]+)")
OFFICE = "महाराष्ट्र परिचय केंद्र, नवी दिल्ली"
LOOSE_DATELINE = re.compile(r"^(मुंबई|नवी दिल्ली|नागपूर|पुणे)\s*,?\s*[0-9" + DEV + r"]+\s*:")


def ascii_num(s):
    return "".join(str(DEV.index(c)) if c in DEV else c for c in s)


def main(src, dst):
    rows = json.load(open(src, encoding="utf8"))
    for rel in rows:
        head = rel["headline"]
        while head and head[0] == OFFICE:
            head.pop(0)
        if head and NUM_ANY.match(head[0]):
            rel["num"] = ascii_num(NUM_ANY.match(head[0]).group(1))
            head.pop(0)
        # a dateline the parser could not see belongs at the top of the body
        while head and LOOSE_DATELINE.match(head[-1]):
            rel["body"].insert(0, head.pop())
    json.dump(rows, open(dst, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    for r in rows:
        print(r["num"] or "--", "|", " ".join(r["headline"])[:70])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
