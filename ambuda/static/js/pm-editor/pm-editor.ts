import { Command, EditorState, NodeSelection, TextSelection, AllSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { DOMOutputSpec, DOMParser, Node, Schema, ContentMatch } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { undo, redo, history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { canSplit } from "prosemirror-transform"


/*
  ProofedPage := Metadata + Block*
  Metadata := {PageNumber: String, }
  Block := Verse | Paragraph | Heading | Trailer | Skip
  Verse := Line*
  Paragraph := Line*
  Line := (inline text)
  Heading := Level + (inline text)
*/

// const schema = new Schema({
//   nodes: {
//     // The document (page) is some metadata followed by sequence of blocks.
//     doc: { content: 'metadata block*' },
//     // Metadata should be a map, leave it as a line for now.
//     metadata: {
//       content: 'line',
//       toDOM() { return ['div', { 'class': 'metadata' }, 0] as DOMOutputSpec; },
//     },
//     paragraph: {
//       group: "block",
//       content: "line+",
//       toDOM() { return ['div', { 'class': 'paragraph' }, 0] as DOMOutputSpec; },
//     },
//     verse: {
//       group: "block",
//       content: "line+",
//       toDOM() { return ['div', { 'class': 'verse' }, 0] as DOMOutputSpec; },
//     },
//     // A line contains text. Represented in the DOM as a `<p>` element.
//     line: {
//       content: 'text*',
//       parseDOM: [{ tag: 'p' }],
//       toDOM() { return ['p', 0] as DOMOutputSpec; },
//     },
//     text: { inline: true },
//   },
// });

const schema = new Schema({
  nodes: {
    // The document (page) is a sequence of blocks.
    doc: { content: 'block*' },
    // A block is a sequence of lines. Represented in the DOM as a `<div>`.
    block: {
      content: "line+",
      attrs: { paragraphOrVerse: { default: 'paragraph' } },
      toDOM(node) {
        let { paragraphOrVerse } = node.attrs;
        return ['div', { 'class': paragraphOrVerse }, 0] as DOMOutputSpec;
      },
    },
    // A line contains text. Represented in the DOM as a `<p>` element.
    line: {
      content: 'text*',
      parseDOM: [{ tag: 'p' }],
      toDOM() { return ['p', 0] as DOMOutputSpec; },
    },
    text: { inline: true },
  },
});

export const newBlock: Command = (state, dispatch) => {
  if (dispatch) {
    let tr = state.tr
    tr.split(state.selection.$head.pos, 2)
    dispatch(tr)
  }
  return true
}

export const newBlockIfAtStartOfLine: Command = (state, dispatch) => {
  let $head = state.selection.$head
  // If at start of the line, start a new block.
  if ($head.pos == $head.posAtIndex(0)) {
    return newBlock(state, dispatch)
  }
  return false
}

export const makeVerse: Command = (state, dispatch) => {
  let $head = state.selection.$head
  // Ancestor of $head at depth 1:
  // Depth 0 is the doc itself, and depth 1 is the paragraph or verse under it.
  let block = $head.node(1)

  let tr = state.tr
  state.doc.nodesBetween(
    state.selection.from,
    state.selection.to,
    (node, pos, _parent, _index) => {
      if (node.attrs.paragraphOrVerse) {
        tr.setNodeAttribute(pos, 'paragraphOrVerse', 'verse')
      }
    })
  if (dispatch) {
    dispatch(tr)
  }
  return true
}

// Turns `text` into a `Document` corresponding to our schema. Just splits on line breaks.
function docFromText(text: string): Node {
  try {
    return schema.nodeFromJSON(JSON.parse(text));
  } catch { };
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
      keymap({ 'Enter': newBlockIfAtStartOfLine }),
      keymap({ 'Mod-Enter': newBlock }),
      keymap({ 'Mod-z': undo, 'Mod-y': redo }),
      keymap({ 'Alt-v': makeVerse }),
      keymap(baseKeymap),
    ],
  });
  // Display the editor.
  const view = new EditorView(parentNode, { state });
  return view;
}
