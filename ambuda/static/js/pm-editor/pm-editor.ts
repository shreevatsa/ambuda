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
        let p = document.createElement('p');
        let text = '';
        if (node.attrs.box != null) {
          text = `[Box: ${printBox(node.attrs.box)}]`;
        }
        p.textContent = text + node.textContent;
        return p;
      },
    },
    text: { inline: true },
  },
});

export function sliceFromOcr(response: any) {
  console.log(response);
  // An array of lines, where each line is an array of words.
  let lines: any[][] = [];
  // Crude line-breaking heuristic.
  /*
      def same_line(new: BBox, old: BBox, threshold_fraction: float) -> bool:
        return (new.ymin < old.ymin or
                new.ymax < old.ymax or
                new.ymin < old.ymin + threshold_fraction * (old.ymax - old.ymin))
  */
  function xmin(word) {
    return Math.min(...word.boundingPoly.vertices.map(({ x: v }) => v));
  }
  function xmax(word) {
    return Math.max(...word.boundingPoly.vertices.map(({ x: v }) => v));
  }
  function ymin(word) {
    return Math.min(...word.boundingPoly.vertices.map(({ y: v }) => v));
  }
  function ymax(word) {
    return Math.max(...word.boundingPoly.vertices.map(({ y: v }) => v));
  }
  function box(line): Box {
    return {
      xmin: Math.min(...line.map(word => xmin(word))),
      xmax: Math.max(...line.map(word => xmax(word))),
      ymin: Math.min(...line.map(word => ymin(word))),
      ymax: Math.min(...line.map(word => ymax(word))),
    }
  }

  function same_line(word, prev) {
    return ymin(word) < ymin(prev) || ymax(word) < ymax(prev) || ymin(word) < ymin(prev) + 0.4 * (ymax(prev) - ymin(word));
  }
  for (let word of response.textAnnotations.slice(1)) {
    if (lines.length == 0) {
      lines.push([word]);
      continue;
    }
    let currentLine = lines[lines.length - 1];
    let prev = currentLine[currentLine.length - 1];
    if (same_line(word, prev)) {
      currentLine.push(word);
      // console.log('Same line: ', word, prev);
      continue;
    }
    // console.log('Different lines: ', word, prev);
    // Otherwise, start a new line.
    lines.push([word]);
  }
  console.log(lines);
  let nodes: Node[] = [];
  for (let line of lines) {
    let attrs = { box: box(line) };
    // console.log(attrs);
    let node = schema.nodes.line.create(
      attrs,
      schema.text(line.map(word => word.description).join(' ')));
    nodes.push(node);
  }

  // const node: Node = schema.text(`(Not yet implemented: ${response.textAnnotations.length} annotations.)`);
  const fragment: Fragment = Fragment.from(nodes);
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
