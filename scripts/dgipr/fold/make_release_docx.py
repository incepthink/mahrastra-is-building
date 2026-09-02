# -*- coding: utf-8 -*-
"""Render one release from a daily fold as public/dgipr/docs/<id>.docx.

The sheet is the same one `scripts/dgipr/make-docx.mjs` produces for a
mahasamvad release — same masthead, same headline block, same credit table —
so a reader who has seen one of those recognises this. It is built here by
writing `word/document.xml` directly and reusing every other part of an
existing sheet, because the styles, fonts and settings that make Word render
Devanagari in Nirmala UI are already correct in those parts and nothing is
gained by describing them a second time.
"""
import copy, os, re, shutil, zipfile
from xml.sax.saxutils import escape

FONT = 'w:ascii="Nirmala UI" w:hAnsi="Nirmala UI" w:cs="Nirmala UI" w:eastAsia="Nirmala UI"'

HEAD = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"'
    ' xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"'
    ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    ' xmlns:mv="urn:schemas-microsoft-com:mac:vml"'
    ' xmlns:o="urn:schemas-microsoft-com:office:office"'
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
    ' xmlns:v="urn:schemas-microsoft-com:vml"'
    ' xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"'
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    ' xmlns:w10="urn:schemas-microsoft-com:office:word"'
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"'
    ' xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"'
    ' xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"'
    ' xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"'
    ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'
    ' mc:Ignorable="w14 wp14"><w:body>'
)

TAIL = (
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    '<w:pgMar w:top="907" w:right="850" w:bottom="1020" w:left="850"'
    ' w:header="720" w:footer="720" w:gutter="0"/>'
    '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>'
    '</w:body></w:document>'
)


def run(text, size, color, bold=False):
    b = "<w:b/><w:bCs/>" if bold else '<w:b w:val="0"/>'
    return (
        f"<w:r><w:rPr><w:rFonts {FONT}/>{b}"
        f'<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
        f'<w:lang w:bidi="mr-IN"/></w:rPr>'
        f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'
    )


def para(text, size, color, bold=False, spacing="", extra="", keep=False):
    ppr = "<w:pPr>"
    if keep:
        ppr += "<w:keepNext/>"
    ppr += f"<w:spacing {spacing}/>" if spacing else ""
    ppr += extra + "</w:pPr>"
    return "<w:p>" + ppr + (run(text, size, color, bold) if text else "") + "</w:p>"


def rule(after):
    return (
        f'<w:p><w:pPr><w:spacing w:before="454" w:after="{after}"/>'
        '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="E5E5F2"/>'
        "</w:pBdr></w:pPr></w:p>"
    )


TBL_PR = (
    '<w:tblPr><w:tblW w:type="auto" w:w="0"/><w:tblLayout w:type="fixed"/>'
    '<w:tblLook w:firstColumn="1" w:firstRow="1" w:lastColumn="0" w:lastRow="0"'
    ' w:noHBand="0" w:noVBand="1" w:val="04A0"/>'
    '<w:tblBorders><w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/>'
    '<w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/>'
    '<w:insideH w:val="none" w:sz="0"/><w:insideV w:val="none" w:sz="0"/></w:tblBorders>'
    '</w:tblPr><w:tblGrid><w:gridCol w:w="5103"/><w:gridCol w:w="5103"/></w:tblGrid>'
)


def masthead(date_mr):
    left = (
        '<w:p><w:pPr><w:spacing w:after="170"/></w:pPr>'
        + run("महाराष्ट्र शासन", 17, "4D4D6B")
        + "<w:r><w:br/></w:r>"
        + run("माहिती व जनसंपर्क महासंचालनालय", 25, "1A1A30", bold=True)
        + "</w:p>"
    )
    right = (
        '<w:p><w:pPr><w:spacing w:after="170"/><w:jc w:val="right"/></w:pPr>'
        + run(date_mr, 17, "656587")
        + "</w:p>"
    )
    border = '<w:tcBorders><w:bottom w:val="single" w:sz="16" w:color="14926A"/></w:tcBorders><w:vAlign w:val="bottom"/>'
    return (
        "<w:tbl>" + TBL_PR + "<w:tr>"
        f'<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="6803"/>{border}</w:tcPr>{left}</w:tc>'
        f'<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3402"/>{border}</w:tcPr>{right}</w:tc>'
        "</w:tr></w:tbl>"
    )


def meta_cell(label, value, width):
    inner = (
        '<w:p><w:pPr><w:spacing w:before="85"/></w:pPr>' + run(label, 16, "656587") + "</w:p>"
        '<w:p><w:pPr><w:spacing w:before="57" w:after="85"/></w:pPr>'
        + run(value, 20, "1A1A30")
        + "</w:p>"
    ) if label else "<w:p/>"
    return f'<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="{width}"/></w:tcPr>{inner}</w:tc>'


def meta_table(category, office):
    r1 = (
        "<w:tr>"
        + meta_cell("विषय", category, 5102)
        + meta_cell("जारी करणारे कार्यालय", office, 5102)
        + "</w:tr>"
    )
    r2 = (
        "<w:tr>"
        + meta_cell("स्रोत", "माहिती व जनसंपर्क महासंचालनालय, महाराष्ट्र शासन", 5102)
        + meta_cell(None, None, 5103)
        + "</w:tr>"
    )
    return "<w:tbl>" + TBL_PR + r1 + r2 + "</w:tbl>"


def document_xml(rel, date_mr, dateline_mr):
    kicker = "शासकीय प्रसिद्धीपत्रक"
    if rel.get("dept"):
        kicker += " · " + rel["dept"]

    parts = [HEAD, masthead(date_mr)]
    parts.append(para(kicker, 17, "0C6B4C", bold=True, spacing='w:before="510" w:after="0"', keep=True))
    parts.append(
        para(
            " ".join(rel["headline"]),
            36,
            "1A1A30",
            bold=True,
            spacing='w:before="113" w:after="0" w:line="348" w:lineRule="auto"',
            keep=True,
        )
    )
    for line in rel["attribution"]:
        parts.append(
            para(line, 24, "0C6B4C", bold=True,
                 spacing='w:before="113" w:after="0" w:line="336" w:lineRule="auto"', keep=True)
        )
    for line in rel["bullets"]:
        parts.append(
            para(line, 23, "4D4D6B", bold=True,
                 spacing='w:before="113" w:after="0" w:line="336" w:lineRule="auto"', keep=True)
        )
    parts.append(para(dateline_mr, 19, "4D4D6B", spacing='w:before="170" w:after="0"', keep=True))
    parts.append(rule(340))
    for line in rel["body"]:
        parts.append(
            para(line, 21, "1A1A30",
                 spacing='w:before="0" w:after="255" w:line="444" w:lineRule="auto"',
                 extra='<w:jc w:val="both"/>')
        )
    parts.append(rule(283))
    parts.append(meta_table(rel["category"], rel["office"]))
    parts.append(rule(227))
    parts.append(
        para(
            f"ही प्रत माहिती व जनसंपर्क महासंचालनालयाच्या दि. {date_mr} रोजीच्या "
            "वृत्तसंचामधील प्रसिद्धीपत्रकाचा जसाच्या तसा पुनर्मुद्रित मजकूर आहे.",
            17,
            "656587",
            spacing='w:before="0" w:after="0" w:line="396" w:lineRule="auto"',
        )
    )
    parts.append(TAIL)
    return "".join(parts)


def write(template, out_path, rel, date_mr, dateline_mr):
    xml = document_xml(rel, date_mr, dateline_mr).encode("utf8")
    src = zipfile.ZipFile(template)
    tmp = out_path + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            if item.filename == "word/document.xml":
                dst.writestr(item, xml)
            else:
                dst.writestr(item, src.read(item.filename))
    src.close()
    os.replace(tmp, out_path)
