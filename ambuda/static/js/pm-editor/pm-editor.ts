import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  DOMOutputSpec, DOMParser, Fragment, Node, NodeType, Schema, Slice,
} from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { undo, redo, history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { Step, StepResult, findWrapping } from 'prosemirror-transform';

declare global {
  interface Window {
    verseNumber: any;
    footnoteNumber: any;
  }
}

// https://discuss.prosemirror.net/t/changing-doc-attrs/784
class SetDocAttrStep extends Step {
  stepType: string;
  key: string;
  value: any;
  prevValue: any;
  constructor(key: string, value: any, stepType: string = 'SetDocAttr') {
    super();
    this.stepType = stepType;
    this.key = key;
    this.value = value;
  }
  apply(doc: Node) {
    const newAttrs = Object.assign(doc.attrs, { [this.key]: this.value });
    console.log('In SetDocAttrStep apply: Creating doc with attrs', newAttrs);
    const newDoc = schema.nodes.doc.createChecked(
      newAttrs,
      doc.content,
    );
    return StepResult.ok(newDoc);
  }

  invert() {
    return new SetDocAttrStep(this.key, this.prevValue, 'revertSetDocAttr');
  }

  map() {
    // position never changes so map should always return same step
    return this;
  }
  toJSON() {
    return {
      stepType: this.stepType,
      key: this.key,
      value: this.value,
    };
  }
  static fromJSON(json) {
    return new SetDocAttrStep(json.key, json.value, json.stepType);
  }
}



type Box = {
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number
};

class LineView {
  dom: HTMLDivElement;
  contentDOM: HTMLDivElement;
  constructor(node: Node, view: EditorView) {
    const pageImageUrl = view.state.doc.attrs.pageImageUrl;
    const scale = view.state.doc.attrs.imageZoomInEditor;
    // console.log('In LineView constructor with scale', scale);
    this.dom = document.createElement('line') as HTMLDivElement;
    const ret = this.dom;
    // The image of the line
    if (node.attrs.box != null) {
      const box = node.attrs.box as Box;
      // TODO(shreevatsa): Revert this hack (and the backgroundPositionX below).
      const width = 3309; // (box.xmax - box.xmin);
      const height = (box.ymax - box.ymin);
      let wrapper = createChild(ret, 'div');
      wrapper.style.width = width * scale + 'px';
      wrapper.style.height = height * scale + 'px';
      // The dummy div node that has the line's image region as the background.
      let foreground = createChild(wrapper, 'div');
      foreground.style.height = height + 'px';
      foreground.style.backgroundPositionY = -box.ymin + 'px';
      foreground.style.width = width + 'px';
      // foreground.style.backgroundPositionX = -(box.xmin - 10) + 'px';
      foreground.style.backgroundPositionX = '0px';
      foreground.style.backgroundImage = `url("${pageImageUrl}")`;
      foreground.style.backgroundRepeat = 'no-repeat';
      foreground.style.backgroundPositionX = '0';
      foreground.style.transform = `scale(${scale})`;
      foreground.style.transformOrigin = 'top left';
      foreground.classList.add('page-image-region');
    }
    const p = createChild(ret, 'p') as HTMLParagraphElement;
    this.contentDOM = p;
  }
}

function increment(n) {
  return (parseInt(n, 10) + 1).toString();
}

function makeLineGroup(state, dispatch, groupType: NodeType, groupNameGet?: () => string, groupNameSet?) {
  // Get a range around the selected blocks
  const range = state.selection.$from.blockRange(state.selection.$to)
  // See if it is possible to wrap that range in a note group
  let wrapping = findWrapping(range, groupType)
  if (!wrapping) return false
  // Now that we know it can be wrapped, create it again with a name.
  let groupName = groupNameGet ? groupNameGet() : prompt("Name for this group?");
  if (groupNameSet) {
    groupNameSet(groupName);
  }
  const attrs = { groupName: groupName };
  wrapping = findWrapping(range, groupType, attrs);
  // Dispatch a transaction, using the `wrap` method to create the step that does the actual wrapping.
  if (dispatch) dispatch(state.tr.wrap(range, wrapping).scrollIntoView())
  return true
}
function makeLgHeader(state, dispatch) { return makeLineGroup(state, dispatch, schema.nodes.lgHeader, () => '') }
function makeLgVerse(state, dispatch) { return makeLineGroup(state, dispatch, schema.nodes.lgVerse, undefined, window.verseNumber.set) }
function makeLgVerseAutoIncrement(state, dispatch) { return makeLineGroup(state, dispatch, schema.nodes.lgVerse, () => increment(window.verseNumber.get()), window.verseNumber.set) }
function makeLgParagraph(state, dispatch) { return makeLineGroup(state, dispatch, schema.nodes.lgParagraph) }
function makeLgFootnote(state, dispatch) { return makeLineGroup(state, dispatch, schema.nodes.lgFootnote, undefined, window.footnoteNumber.set) }
function makeLgFootnoteAutoIncrement(state, dispatch) { return makeLineGroup(state, dispatch, schema.nodes.lgFootnote, () => increment(window.footnoteNumber.get()), window.footnoteNumber.set) }


function lgToDom(node: Node, tagNameForLg: string): DOMOutputSpec {
  // <tagNameForLg> <div>(groupname)</div> <div>(contents)</div> </tagNameForLg>
  return [tagNameForLg, { style: "display: flex" }, ["div", node.attrs.groupName || ''], ["div", 0]];
}

const schema = new Schema({
  nodes: {
    text: { inline: true },
    // A line contains text.
    // // Represented in the DOM as a `<line>` element. Is this ok? https://stackoverflow.com/questions/10830682/is-it-ok-to-use-unknown-html-tags
    line: {
      content: 'text*',
      attrs: {
        box: { default: null },
      },
      parseDOM: [{ tag: 'p' }],
    },
    // Various groupings of lines.
    // TODO(shreevatsa): Consider making this a single linegroup node with varying attrs.
    lgHeader: {
      content: "line+",
      attrs: { groupName: { default: null }, },
      toDOM(node) { return lgToDom(node, "lgHeader") },
      parseDOM: [{ tag: "lgHeader" }]
    },
    lgVerse: {
      content: "line+",
      attrs: { groupName: { default: null }, },
      toDOM(node) { return lgToDom(node, "lgVerse") },
      parseDOM: [{ tag: "lgVerse" }]
    },
    lgParagraph: {
      content: "line+",
      attrs: { groupName: { default: null }, },
      toDOM(node) { return lgToDom(node, "lgParagraph") },
      parseDOM: [{ tag: "lgParagraph" }]
    },
    lgFootnote: {
      content: "line+",
      attrs: { groupName: { default: null }, },
      toDOM(node) { return lgToDom(node, "lgFootnote") },
      parseDOM: [{ tag: "lgFootnote" }]
    },
    // The document (page) is a nonempty sequence of lines.
    doc: {
      content: "(line | lgHeader | lgVerse | lgParagraph | lgFootnote)+",
      attrs: {
        pageImageUrl: { default: null },
        imageZoomInEditor: { default: null },
      }
    },
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
  const fullHeight = response.fullTextAnnotation.pages[0].height;
  console.assert(fullHeight == 4678);
  // const fullWidth = response.fullTextAnnotation.pages[0].width;
  // console.assert(fullWidth == 3309);
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

  let linesWithBox: { words: string[]; box: Box; }[] = [];
  for (let line of lines) {
    linesWithBox.push({
      words: line.map(word => word.description),
      box: box(line),
    });
  };
  // Distribute all the "missing" y-coordinates.
  if (linesWithBox.length > 0) {
    const box0 = linesWithBox[0].box;
    if (box0.ymin > 0) {
      linesWithBox.unshift({
        words: [' '],
        box: { xmin: box0.xmin, xmax: box0.xmax, ymin: 0, ymax: box0.ymin }
      });
    }
  }
  for (let i = 1; i < linesWithBox.length; ++i) {
    const prev = linesWithBox[i - 1].box.ymax;
    const cur = linesWithBox[i].box.ymin;
    if (prev >= cur) continue;
    const avg = prev + (cur - prev) / 2;
    linesWithBox[i - 1].box.ymax = avg;
    linesWithBox[i].box.ymin = avg;
  }
  if (linesWithBox.length > 1) {
    const lastBox = linesWithBox[linesWithBox.length - 1].box;
    if (lastBox.ymax < fullHeight) {
      linesWithBox.push({
        words: [' '],
        box: { xmin: lastBox.xmin, xmax: lastBox.xmax, ymin: lastBox.ymax, ymax: fullHeight },
      });
    }
  }
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
function docFromText(text: string, imageUrl: string, imageZoomInEditor: number): Node {
  try {
    const json = JSON.parse(text);
    return Node.fromJSON(schema, json);
  } catch (e) { }
  // Could create it manually with schema.node() and schema.text(),
  // but can also turn into div and parse it.
  const dom = document.createElement('div');
  // The "-1" is so that empty lines are retained: https://stackoverflow.com/q/14602062
  text.split(/(?:\r\n?|\n)/, -1).forEach((line) => {
    const p = createChild(dom, 'p');
    p.appendChild(document.createTextNode(line));
  });
  const node = DOMParser.fromSchema(schema).parse(dom, { preserveWhitespace: 'full' });
  console.log('Creating doc with pageImageUrl', imageUrl);
  const doc = schema.nodes.doc.createChecked(
    {
      pageImageUrl: imageUrl,
      imageZoomInEditor: imageZoomInEditor,
    },
    node.content,
  );
  return doc;
}

// Serializes the EditorState (assuming the schema above) into a plain text string.
export function toText(view: EditorView): string {
  const doc = view.state.doc.toJSON();
  return JSON.stringify(doc);
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
  // return doc.content.map((line) => (line.content ? line.content[0].text : '')).join('\n');
}

// Creates editor with contents from `text`, appends it to `parentNode`. Returns its EditorView.
export function createEditorFromTextAt(text: string, imageUrl: string, imageZoomInEditor: number, parentNode: HTMLElement): EditorView {
  const state = EditorState.create({
    doc: docFromText(text, imageUrl, imageZoomInEditor),
    plugins: [
      history(),
      keymap({ 'Mod-z': undo, 'Mod-y': redo }),
      keymap(baseKeymap),
      keymap({
        'Ctrl-h': makeLgHeader,
        'Ctrl-v': makeLgVerseAutoIncrement,
        'Ctrl-b': makeLgVerse,
        'Ctrl-p': makeLgParagraph,
        'Ctrl-f': makeLgFootnoteAutoIncrement,
        'Ctrl-g': makeLgFootnote,
      })
    ],
  });
  // Display the editor.
  const view = new EditorView(
    parentNode,
    {
      state,
      nodeViews: {
        line(node, view) { return new LineView(node, view) }
      }
    }
  );
  return view;
}

export function setImageZoomInEditor(view: EditorView, scale: number) {
  console.log('Trying to set scale to ', scale);
  // TODO: This should be editor props, rather than editing doc.
  const tr = view.state.tr.step(new SetDocAttrStep('imageZoomInEditor', scale));
  view.dispatch(tr);
}

function createChild(node: HTMLElement, tagName: string) {
  // This function could just be:
  // return node.appendChild(document.createElement(tagName));
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
  arrow.style.fontSize = '5rem';
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
                case 4: // HYPHEN
                  const hyphen = createChild(symbols, 'span');
                  // TODO: Think about this further. `textAnnotations` simply omits these hyphens.
                  hyphen.innerText = ' AAAAAA - HHHHYYYPPPHHHEEENNN';
                  createChild(symbols, 'br');
                  break;
                case 0: // UNKNOWN
                case 1: // SPACE
                case 2: // SURE_SPACE
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
