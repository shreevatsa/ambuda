import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  DOMOutputSpec, DOMParser, Fragment, Node, Schema, Slice,
} from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { undo, redo, history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';

type Box = {
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number
};

function printBox(box: Box) {
  return `[${box.xmin}..${box.xmax}]×[${box.ymin}..${box.ymax}]`;
}

const schema = new Schema({
  nodes: {
    // The document (page) is a nonempty sequence of lines.
    doc: { content: 'line+' },
    // A line contains text. Represented in the DOM as a `<p>` element.
    line: {
      content: 'text*',
      attrs: {
        box: { default: null },
      },
      parseDOM: [{ tag: 'p' }],
      toDOM(node) {
        // return ['p', 0] as DOMOutputSpec;
        let ret = document.createElement('div');
        ret.style.outline = '2px dotted grey';
        if (node.attrs.box != null) {
          const box = node.attrs.box as Box;
          const width = (box.xmax - box.xmin);
          const fullWidth = 3309;
          const height = (box.ymax - box.ymin);

          // // Attempt 1
          // let imgContainer = document.createElement('div');
          // imgContainer.style.width = width + 'px';
          // imgContainer.style.height = height + 'px';
          // imgContainer.style.overflow = 'hidden';
          // console.log(imgContainer);
          // let img = document.createElement('img');
          // img.src = '/static/uploads/epigramsbhartrhari/pages/129.jpg';
          // let ratio = 2080 / 4678;
          // img.style.marginLeft = -box.xmin * ratio + '';
          // img.style.marginTop = -box.ymin * ratio + '';
          // imgContainer.appendChild(img);
          // ret.appendChild(imgContainer);

          // Attempt 2
          let foreground = document.createElement('div');
          foreground.style.width = fullWidth + 'px';
          foreground.style.width = width + 'px';
          foreground.style.height = height + 'px';
          foreground.style.backgroundImage = 'url("/static/uploads/epigramsbhartrhari/pages/129.jpg")';
          foreground.style.backgroundRepeat = 'no-repeat';
          foreground.style.backgroundPositionX = '0';
          foreground.style.backgroundPositionX = -(box.xmin - 10) + 'px';
          foreground.style.backgroundPositionY = -box.ymin + 'px';
          ret.appendChild(foreground);
        }
        let p = document.createElement('p');
        p.textContent = node.textContent;
        p.style.color = 'green';
        p.contentEditable = 'true';
        ret.appendChild(p);
        return ret;
      },
    },
    text: { inline: true },
  },
});

function xmin(word) {
  let box = ('boundingPoly' in word) ? word.boundingPoly : word.boundingBox;
  return Math.min(...box.vertices.map(({ x: v }) => v));
}
function xmax(word) {
  let box = ('boundingPoly' in word) ? word.boundingPoly : word.boundingBox;
  return Math.max(...box.vertices.map(({ x: v }) => v));
}
function ymin(word) {
  let box = ('boundingPoly' in word) ? word.boundingPoly : word.boundingBox;
  return Math.min(...box.vertices.map(({ y: v }) => v));
}
function ymax(word) {
  let box = ('boundingPoly' in word) ? word.boundingPoly : word.boundingBox;
  return Math.max(...box.vertices.map(({ y: v }) => v));
}

export function sliceFromOcr(response: any) {
  console.log('Creating slice from response', response);
  // An array of lines, where each line is an array of words.
  let lines: any[][] = [];
  // Crude line-breaking heuristic.
  /*
      def same_line(new: BBox, old: BBox, threshold_fraction: float) -> bool:
        return (new.ymin < old.ymin or
                new.ymax < old.ymax or
                new.ymin < old.ymin + threshold_fraction * (old.ymax - old.ymin))
  */
  function box(line): Box {
    return {
      xmin: Math.min(...line.map(word => xmin(word))),
      xmax: Math.max(...line.map(word => xmax(word))),
      ymin: Math.min(...line.map(word => ymin(word))),
      ymax: Math.max(...line.map(word => ymax(word))),
    }
  }

  function same_line(word, prev) {
    return ymin(word) < ymin(prev) || ymax(word) < ymax(prev) || ymin(word) < ymin(prev) + 0.4 * (ymax(prev) - ymin(word));
  }

  let words = JSON.parse(JSON.stringify(response.textAnnotations.slice(1)));
  words.sort((w1, w2) => ymin(w1) - ymin(w2));
  for (let word of words) {
    if (lines.length == 0) {
      lines.push([word]);
      continue;
    }
    let currentLine = lines[lines.length - 1];
    if (currentLine.some(prev => same_line(word, prev))) {
      currentLine.push(word);

      // // This newly added word may be higher on the page than earlier words,
      // // so we may also need to merge previously distinct lines.
      // while (lines.length >= 2) {
      //   if (lines[lines.length - 2].some(old => same_line(word, old))) {
      //     lines[lines.length - 2].push(...lines[lines.length - 1]);
      //     lines.pop();
      //   } else {
      //     break;
      //   }
      // }
    } else {
      // Otherwise, start a new line.
      lines.push([word]);
    }
  }
  for (let line of lines) {
    line.sort((w1, w2) => xmin(w1) - xmin(w2));
  }
  console.log('lines:', lines);

  let linesWithBox: { words: any[]; box: Box; }[] = [];
  for (let line of lines) {
    linesWithBox.push({
      words: line.map(word => word.description),
      box: box(line),
    });
  };
  // Distribute all the "missing" y-coordinates.
  for (let i = 0; i < linesWithBox.length; ++i) {
    if (i == 0) {
      linesWithBox[i].box.ymin = 0;
    } else {
      const prev = linesWithBox[i - 1].box.ymax;
      const cur = linesWithBox[i].box.ymin;
      if (prev >= cur) continue;
      const avg = prev + (cur - prev) / 2;
      linesWithBox[i - 1].box.ymax = avg;
      linesWithBox[i].box.ymin = avg;
    }
  }
  const fullHeight = 4678;
  linesWithBox[linesWithBox.length - 1].box.ymax = fullHeight;
  console.log(linesWithBox);

  let nodes: Node[] = [];
  for (let line of linesWithBox) {
    let attrs = { box: line.box };
    // console.log(attrs);
    let node = schema.nodes.line.create(
      attrs,
      schema.text(line.words.join(' ')));
    nodes.push(node);
  }

  // const node: Node = schema.text(`(Not yet implemented: ${response.textAnnotations.length} annotations.)`);
  const fragment: Fragment = Fragment.from(nodes);
  // const fragment = Fragment.from(null);
  const slice: Slice = new Slice(fragment, 0, 0);
  return slice;
}

// Turns `text` into a `Document` corresponding to our schema. Just splits on line breaks.
function docFromText(text: string): Node {
  // Could create it manually with schema.node() and schema.text(),
  // but can also turn into div and parse it.
  const dom = document.createElement('div');
  // The "-1" is so that empty lines are retained: https://stackoverflow.com/q/14602062
  text.split(/(?:\r\n?|\n)/, -1).forEach((line) => {
    const p = dom.appendChild(document.createElement('p'));
    p.appendChild(document.createTextNode(line));
    dom.appendChild(p);
  });
  const ret = DOMParser.fromSchema(schema).parse(dom, { preserveWhitespace: 'full' });
  return ret;
}

// Serializes the EditorState (assuming the schema above) into a plain text string.
export function toText(view: EditorView): string {
  const doc = view.state.doc.toJSON();
  /*
    The JSON looks like:
          {
              "type": "doc",
              "content": [
                  {
                      "type": "line",
                      "content": [
                          {
                              "type": "text",
                              "text": "This is the first line."
                          }
                      ]
                  },
                  {
                      "type": "line"
                  },
              ]
          }
    etc.
  */
  return doc.content.map((line) => (line.content ? line.content[0].text : '')).join('\n');
}

// Creates editor with contents from `text`, appends it to `parentNode`. Returns its EditorView.
export function createEditorFromTextAt(text: string, parentNode: HTMLElement): EditorView {
  const state = EditorState.create({
    doc: docFromText(text),
    plugins: [
      history(),
      keymap({ 'Mod-z': undo, 'Mod-y': redo }),
      keymap(baseKeymap),
    ],
  });
  // Display the editor.
  const view = new EditorView(parentNode, { state });
  return view;
}

function createChild(node: HTMLElement, tagName: string) {
  let ret = document.createElement(tagName);
  node.appendChild(ret);
  return ret;
}

function makeHighlightFor(block: any, node: HTMLElement, OpenSeadragon, viewer, opacity: number) {
  // Define the region to highlight with a rectangle
  const x = xmin(block); // x-coordinate of the upper left corner of the rectangle
  const y = ymin(block); // y-coordinate of the upper left corner of the rectangle
  const width = xmax(block) - xmin(block); // width of the rectangle
  const height = ymax(block) - ymin(block); // height of the rectangle
  const boundingBox = new OpenSeadragon.Rect(x, y, width, height);
  const viewportRect = viewer.viewport.imageToViewportRectangle(boundingBox);
  // Create a new rectangle overlay
  const box = document.createElement('div');
  box.style.backgroundColor = 'red';
  box.style.opacity = `${opacity}`;

  // Create an overlay that's an arrow.
  const point = new OpenSeadragon.Point(x, y);
  const location = viewer.viewport.imageToViewportCoordinates(point);
  const arrow = document.createElement('span');
  arrow.innerText = '↘';
  arrow.style.color = 'purple';

  node.addEventListener('mouseover', function () {
    viewer.addOverlay(box, viewportRect);
    viewer.addOverlay(arrow, location, OpenSeadragon.Placement.BOTTOM_RIGHT);
  });
  node.addEventListener('mouseout', function () {
    viewer.removeOverlay(box);
    viewer.removeOverlay(arrow);
  });
}


export function createGoogleOcrResponseVisualizer(node: HTMLElement,
  viewer,
  OpenSeadragon,
  response: { textAnnotations?: any; fullTextAnnotation?: any; }) {
  console.log('response is', response);
  function areArraysEqualAsSets(a: string[], b: string[]) {
    return a.length === b.length && [...a].every(value => b.includes(value));
  }
  console.assert(areArraysEqualAsSets(Object.keys(response), ['textAnnotations', 'fullTextAnnotation']));

  // Debugging the four ways to get text.

  // Way 1: textAnnotations[0].description
  let text0 = createChild(node, 'details');
  createChild(text0, 'summary').innerText = 'textAnnotations[0].description';
  createChild(text0, 'pre').innerText = response.textAnnotations[0].description;

  // Way 2: The rest textAnnotations
  let textRest = createChild(node, 'details');
  createChild(textRest, 'summary').innerText = 'textAnnotations[1..]';
  // let textAnnotations = createChild(textRest, 'ol');
  // textAnnotations.style.listStyleType = 'decimal';
  // textAnnotations.style.paddingLeft = '3rem';
  // for (let t of response.textAnnotations) {
  //   createChild(textAnnotations, 'li').innerText = JSON.stringify(t);
  // }
  let textAnnotations = createChild(textRest, 'p');
  for (let t of response.textAnnotations.slice(1)) {
    let word = createChild(textAnnotations, 'span');
    word.innerText = t.description + ' ';
    word.dataset.boundingPolyVertices = JSON.stringify(t.boundingPoly.vertices);
    makeHighlightFor(t, word, OpenSeadragon, viewer, 0.5);
  }

  // Way 2.5: The rest of textAnnotations, sorted
  let textRest2 = createChild(node, 'details');
  createChild(textRest2, 'summary').innerText = 'textAnnotations[1..].sort()';
  let textAnnotations2 = createChild(textRest2, 'p');
  const words = JSON.parse(JSON.stringify(response.textAnnotations.slice(1)));
  words.sort((w1, w2) => ymin(w1) - ymin(w2));
  for (let t of words) {
    let word = createChild(textAnnotations2, 'span');
    word.innerText = t.description + ' ';
    word.dataset.boundingPolyVertices = JSON.stringify(t.boundingPoly.vertices);
    makeHighlightFor(t, word, OpenSeadragon, viewer, 0.5);
  }

  // Way 3: fullTextAnnotation.text
  let fullTextAnnotationText = createChild(node, 'details');
  createChild(fullTextAnnotationText, 'summary').innerText = 'fullTextAnnotation.text';
  createChild(fullTextAnnotationText, 'pre').innerText = response.fullTextAnnotation.text;

  // Way 4: fullTextAnnotation.pages
  let fullTextAnnotationPages = createChild(node, 'details');
  createChild(fullTextAnnotationPages, 'summary').innerText = 'fullTextAnnotation.pages';
  let fullTextAnnotation = createChild(fullTextAnnotationPages, 'ol');
  fullTextAnnotation.style.listStyleType = 'devanagari';
  fullTextAnnotation.style.paddingLeft = '3rem';
  for (let page of response.fullTextAnnotation.pages) {
    let blocks = createChild(createChild(fullTextAnnotation, 'li'), 'ol');
    blocks.style.listStyleType = 'decimal'; // block
    blocks.style.paddingLeft = '3rem';
    for (let block of page.blocks) {
      let paragraphs = createChild(createChild(blocks, 'li'), 'ol');
      paragraphs.style.listStyleType = 'kannada'; // paragraph
      paragraphs.style.paddingLeft = '3rem';
      makeHighlightFor(block, paragraphs, OpenSeadragon, viewer, 0.1);
      for (let paragraph of block.paragraphs) {
        let words = createChild(createChild(paragraphs, 'li'), 'div');
        makeHighlightFor(paragraph, words, OpenSeadragon, viewer, 0.3);
        for (let word of paragraph.words) {
          let symbols = createChild(words, 'span');
          makeHighlightFor(word, symbols, OpenSeadragon, viewer, 0.5);
          for (let symbol of word.symbols) {
            let glyph = createChild(symbols, 'span');
            makeHighlightFor(symbol, glyph, OpenSeadragon, viewer, 0.7);
            glyph.innerText = symbol.text;
            if ('property' in symbol && 'detectedBreak' in symbol.property) {
              const detectedBreak = symbol.property.detectedBreak;
              console.assert(!detectedBreak.isPrefix, `A prefix break: ${JSON.stringify(word)}`);

              switch (detectedBreak.type) {
                case 3: // EOL_SURE_SPACE
                  createChild(symbols, 'br');
                  break;
                case 5: // LINE_BREAK
                  createChild(symbols, 'br');
                  break;
                case 0: // UNKNOWN
                case 1: // SPACE
                case 2: // SURE_SPACE
                case 4: // HYPHEN
                  console.log(`A break not handled: ${JSON.stringify(detectedBreak)}`);
                  break;
              }
            }
          }
          createChild(words, 'span').innerText = ' ';
        }
      }
    }
  }
}
