"""
Utils for working with proofread pages.


"""

from datetime import date
from typing import Iterator

DOUBLE_DANDA = "\u0965"

TEI_HEADER_BOILERPLATE = """
<?xml version="1.0" encoding="UTF-8"?>
<!-- This file was automatically generated. Please review it for markup mistakes
and resolve any TODOs. -->
<TEI xml:id="{xml_id}" xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader xml:lang="en">
    <fileDesc>
      <titleStmt>
        <title type="main">{title}</title>
        <title type="sub">A machine-readable edition</title>
        <author>{author}</author>
      </titleStmt>
      <publicationStmt>
        <publisher>Ambuda</publisher>
        <!-- "free" or "restricted" depending on the license-->
        <availability status="{availability_status}">
          <license>
            TODO
          </license>
        </availability>
        <date>{current_year}</date>
      </publicationStmt>
      <sourceDesc>
        <bibl>
          <title>{title}</title>
          <author>{author}</author>
          <editor>{editor}</editor>
          <publisher>{publisher}</publisher>
          <pubPlace>{publisher_location}</pubPlace>
          <date>{publication_year}</date>
        </bibl>
      </sourceDesc>
    </fileDesc>
    <encodingDesc>
      <projectDesc>
        <p>Produced through the distributed proofreading interface on Ambuda.</p>
      </projectDesc>
    </encodingDesc>
    <revisionDesc>
      TODO
    </revisionDesc>
  </teiHeader>
  <text xml:lang="{text_language}">
    <body>
""".strip()

PageContent = str
Line = str
Block = list[Line]

def _iter_blocks(blobs: Iterator[PageContent]) -> Iterator[Block]:
    """Iterate over text blobs as a stream of blocks.

    A block is a sequence of lines separated by an empty line."""

    def _iter_raw_text_lines(blobs: list[PageContent]) -> Iterator[Line]:
        """Iterate over text blobs as a stream of lines."""
        for blob in blobs:
            blob = blob.strip()
            for line in blob.splitlines():
                yield line.strip()

    buf = []
    for line in _iter_raw_text_lines(blobs):
        if line:
            buf.append(line)
        elif buf:
            yield buf
            buf = []
    if buf:
        yield buf


def _is_verse(lines: Block) -> bool:
    """Heuristically decide whether a list of lines represents a verse."""
    return lines[-1].endswith(DOUBLE_DANDA)


def to_plain_text(blobs: list[PageContent]) -> str:
    """Publish a project as plain text.
    
    blobs: The content of each page."""

    def _create_plain_text_block(lines: Block) -> str:
        """Convert a group of lines into a well-formatted plain-text block."""
        if _is_verse(lines):
            return "\n".join(lines)
    
        buf = []
        for line in lines:
            # Join hyphens
            if line.endswith("-"):
                buf.append(line[:-1])
            else:
                buf.append(line)
                buf.append(" ")
        return "".join(buf).strip()
    
    blocks = _iter_blocks(blobs)
    return "\n\n".join(_create_plain_text_block(b) for b in blocks)


def to_tei_xml(project_meta: dict[str, str], blobs: list[(PageContent, int)]) -> str:
    """Publish a project as TEI XML."""

    def _create_xml_block(lines: Block) -> str:
        """Convert a group of lines into a well-formatted TEI XML block."""
        if _is_verse(lines):
            buf = ["<lg>"]
            for line in lines:
                buf.append(f"  <l>{line}</l>")
            buf.append("</lg>")
            return "\n".join(buf)
    
        buf = ["<p>"]
        for line in lines:
            # Join hyphens
            if line.endswith("-"):
                buf.append(line[:-1])
            else:
                buf.append(line)
                buf.append(" ")
    
        # Strip trailing space from the loop.
        buf[-1] = buf[-1].strip()
    
        buf.append("</p>")
        return "".join(buf).strip()

    def _create_tei_header_boilerplate(**kw) -> str:
        # FIXME: add much more TEI boilerplate
        return TEI_HEADER_BOILERPLATE.format(**kw)

    project_meta.update(
        {
            "xml_id": "TODO",
            "current_year": date.today().year,
            "publisher_location": "TODO",
            "text_language": "sa-Deva",
            # "free" or "restricted"
            "availability_status": "TODO",
        }
    )
    buf = [_create_tei_header_boilerplate(**project_meta)]

    for i, blob in enumerate(blobs):
        page_number = i + 1
        buf.append(f'<pb n="{page_number}" />')

        # <pb> element makes it difficult to work with a stream of blobs,
        # so just process one blob at a time and stitch them together after.
        blocks = _iter_blocks([blob])
        buf.append("\n\n".join(_create_xml_block(b) for b in blocks))

    buf.append("</body></text></TEI>")
    return "\n\n".join(buf)
