# -*- coding: utf-8 -*-
"""Compose the day's WhatsApp digest from the parsed fold and the summaries.

One entry per release: the headline exactly as the directorate wrote it, the
attribution and standfirst lines under it, a sixty-word summary, and the link
to the editable sheet. The headline is never rewritten — a recipient who
searches for it should find the release.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from summaries_0902 import SUMMARIES
from build_0902 import PLAN

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
BASE = "https://maharashtra-is-building-seven.vercel.app/dgipr/docs"
RULE = "──────────────"

HEADER = [
    "*माहिती व जनसंपर्क महासंचालनालय*",
    "",
    "*महत्वाच्या बातम्यांचा सारांश*",
    "",
    "*२ सप्टेंबर २०२६*",
    "-----------",
]


def main(fold_json, out_path):
    rows = json.load(open(fold_json, encoding="utf8"))
    lines = list(HEADER)
    for i, rel in enumerate(rows):
        rid = PLAN[i][0]
        headline = " ".join(h for h in rel["headline"] if h != "मुख्यमंत्री सचिवालय (जनसंपर्क कक्ष)")
        if rel.get("dept"):
            lines.append(f"({rel['dept']})")
        lines.append(f"*{headline}*")
        lines.extend(rel["attribution"])
        lines.extend("• " + b for b in rel["bullets"])
        lines.append("")
        lines.append(SUMMARIES[rid])
        lines.append("")
        lines.append("संपादनयोग्य प्रत (DOCX):")
        lines.append(f"{BASE}/{rid}.docx")
        lines.append(RULE)
        if i != len(rows) - 1:
            lines.append("")
    open(out_path, "w", encoding="utf8", newline="\n").write("\n".join(lines) + "\n")
    print(out_path, len(rows), "releases")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
