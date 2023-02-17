# TODO:
# input: PDF by url or file path
# output: structured text for proofreading

# API example: https://cloud.google.com/vision/docs/fulltext-annotations
# Return format: https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate#TextAnnotation
# Billing: https://console.cloud.google.com/billing/

import io
import logging
from dataclasses import dataclass
from pathlib import Path

from google.cloud import vision
from google.cloud.vision_v1 import AnnotateImageResponse


@dataclass
class OcrResponse:
    #: A slightly sanitized version of the OCR's plain-text output.
    text_content: str
    #: Word-level bounding boxes stored as 5-tuples (x1, x2, y1, y2, text).
    bounding_boxes: list[tuple[int, int, int, int, str]]


def post_process(text: str) -> str:
    """Post process OCR text."""
    return (
        text
        # Danda and double danda
        .replace("||", "॥")
        .replace("|", "।")
        .replace("।।", "॥")
        # Remove curly quotes
        .replace("‘", "'")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
    )


def prepare_image(file_path: Path):
    """Read an image into a protocol buffer for the OCR request."""
    with io.open(file_path, "rb") as file_path:
        content = file_path.read()
    return vision.Image(content=content)


def serialize_bounding_boxes(boxes: list[tuple[int, int, int, int, str]]) -> str:
    """Serialize a list of bounding boxes as a TSV."""
    return "\n".join("\t".join(str(x) for x in row) for row in boxes)


def debug_dump_response(response):
    """A handy debug function that dumps the OCR response to a JSON file."""
    with open("out.json", "w") as f:
        f.write(AnnotateImageResponse.to_json(response))


def run(file_path: Path) -> OcrResponse:
    """Run Google OCR over the given image.

    :param file_path: path to the image we'll process with OCR.
    :return: an OCR response containing the image's text content and
        bounding boxes.
    """
    logging.debug("Starting full text annotation: {}".format(file_path))

    client = vision.ImageAnnotatorClient()
    image = prepare_image(file_path)

    # Disable the language hint. It produced identical Devanagari output while
    # making English noticeably worse.
    # context = vision.ImageContext(language_hints=['sa'])
    response = client.document_text_detection(image=image)  # , image_context=context)
    document = response.full_text_annotation
    # import ipdb
    # ipdb.set_trace()
    # return AnnotateImageResponse.to_json(response)

    buf = []
    bounding_boxes = []
    for page in document.pages:
        for block in page.blocks:
            for p in block.paragraphs:
                for w in p.words:
                    vertices = w.bounding_box.vertices
                    xs = [v.x for v in vertices]
                    ys = [v.y for v in vertices]
                    word = "".join(s.text for s in w.symbols)
                    bounding_boxes.append((min(xs), min(ys), max(xs), max(ys), word))

                    for s in w.symbols:
                        buf.append(s.text)
                        break_type = s.property.detected_break.type

                        # BreakType.SPACE
                        # BreakType.SURE_SPACE
                        # End of word.
                        if break_type in (1, 2):
                            buf.append(" ")

                        # BreakType.EOL_SURE_SPACE
                        # End of line.
                        if break_type == 3:
                            buf.append("\n")

                        # BreakType.HYPHEN:
                        # Hyphenated end-of-line.
                        elif break_type == 4:
                            buf.append("-\n")

                        # BreakType.LINE_BREAK
                        # Clean end of region.
                        elif break_type == 5:
                            buf.append("\n\n")

    text_content = post_process("".join(buf))
    return OcrResponse(text_content=text_content, bounding_boxes=bounding_boxes)


def clean_google_ocr_response(c):
    """Clean up the response from Google OCR a bit, removing known-useless fields."""

    def clean_node(p, also=None):
        """Remove useless things that occur repeatedly. 
        
        (And maybe also some useful ones, passed in `also`.)"""
        if 'normalizedVertices' in p and p['normalizedVertices'] == []:
            del p['normalizedVertices']
        if 'property' in p and p['property'] == {}:
            del p['property']
            
        # Overriding the caller's preference. TODO: Better alternative to this hack :)            
        if also and 'boundingPoly' in also:
            also.remove('boundingPoly')
        if also and 'boundingBox' in also:
            also.remove('boundingBox')
            
        if not also: return
        for key in also:
            if key in p:
                del p[key]

    for key in ['faceAnnotations', 'landmarkAnnotations', 'logoAnnotations', 
                'labelAnnotations', 'localizedObjectAnnotations']:
        if key in c and c[key] == []: del c[key]
    for t in c['textAnnotations']:
        for key in ['locations', 'properties']:
            if key in t and t[key] == []: del t[key]
        for key in ['mid', 'locale']:
            if key in t and t[key] == '': del t[key]
        for key in ['score', 'confidence', 'topicality']:
            if key in t and t[key] == 0.0: del t[key]
        if 'boundingPoly' in t: clean_node(t['boundingPoly'])
        clean_node(t, also=['boundingPoly'])
        if 'text' in c['fullTextAnnotation'] and c['fullTextAnnotation']['text'] == c['textAnnotations'][0]['description']:
            del c['fullTextAnnotation']['text']
        for page in c['fullTextAnnotation']['pages']:
            if 'property' in page: clean_node(page['property'], also=['detectedLanguages'])
            clean_node(page, also=['confidence'])
            for block in page['blocks']:
                if 'boundingBox' in block: clean_node(block['boundingBox'])
                clean_node(block, also=['boundingBox', 'confidence'])
                if 'blockType' in block and block['blockType'] == 1: # TEXT
                    del block['blockType']
                for paragraph in block['paragraphs']:
                    if 'boundingBox' in paragraph: clean_node(paragraph['boundingBox'])
                    clean_node(paragraph, also=['boundingBox', 'confidence'])
                    if 'property' in paragraph: clean_node(paragraph['property'], also=['detectedLanguages'])
                    for word in paragraph['words']:
                        if 'boundingBox' in word: clean_node(word['boundingBox'])
                        clean_node(word, also=['boundingBox', 'confidence'])
                        if 'property' in word: clean_node(word['property'], also=['detectedLanguages'])
                        for symbol in word['symbols']:
                            if 'boundingBox' in symbol: clean_node(symbol['boundingBox'])
                            clean_node(symbol, also=['boundingBox', 'confidence'])
                            if 'property' in symbol:
                                p = symbol['property']
                                if 'detectedLanguages' in p and p['detectedLanguages'] == []:
                                    del p['detectedLanguages']
                                clean_node(p, also=['detectedLanguages'])
                                if 'detectedBreak' in p:
                                    if 'isPrefix' in p['detectedBreak'] and p['detectedBreak']['isPrefix'] == False:
                                        del p['detectedBreak']['isPrefix']
                                    # Seen in practice: Most detected spaces inside a word are meaningless, just noise.
                                    if p['detectedBreak'] == {'type': 1}:
                                        del p['detectedBreak']


def run2(file_path: Path) -> OcrResponse:
    logging.debug(f"Starting full text annotation: {file_path}")
    
    cache_dir = file_path.as_posix() + '_cache'
    cache_filename = cache_dir + '/response.json'
    import os.path, json, os
    if os.path.isfile(cache_filename):
        c = json.load(open(cache_filename))
        c = json.loads(c)
        clean_google_ocr_response(c)
        c = json.dumps(c)
        return c

    client = vision.ImageAnnotatorClient()
    image = prepare_image(file_path)
    response = client.document_text_detection(image=image)
    # import ipdb
    # ipdb.set_trace()
    ret = AnnotateImageResponse.to_json(response)
    clean_google_ocr_response(ret)
    os.makedirs(cache_dir, exist_ok=True)
    json.dump(ret, open(cache_filename, 'w'))
    assert ret == json.load(open(cache_filename))
    return ret
