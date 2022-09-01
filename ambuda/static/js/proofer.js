/* global Alpine, $, OpenSeadragon, Sanscript, IMAGE_URL */
/* Transcription and proofreading interface. */

import { $ } from './core.ts';

const CONFIG_KEY = 'proofing-editor';

const LAYOUT_SIDE_BY_SIDE = 'side-by-side';
const LAYOUT_TOP_AND_BOTTOM = 'top-and-bottom';
const ALL_LAYOUTS = [LAYOUT_SIDE_BY_SIDE, LAYOUT_TOP_AND_BOTTOM];

const CLASSES_SIDE_BY_SIDE = 'flex flex-col-reverse md:flex-row h-[90vh]';
const CLASSES_TOP_AND_BOTTOM = 'flex flex-col-reverse h-[90vh]';

/* Initialize our image viewer. */
function initializeImageViewer(imageURL) {
  return OpenSeadragon({
    id: 'osd-image',
    tileSources: {
      type: 'image',
      url: imageURL,
      buildPyramid: false,
    },

    // Buttons
    showZoomControl: false,
    showHomeControl: false,
    showRotationControl: true,
    showFullPageControl: false,
    // Zoom buttons are defined in the `Editor` component below.
    rotateLeftButton: 'osd-rotate-left',
    rotateRightButton: 'osd-rotate-right',

    // Animations
    gestureSettingsMouse: {
      flickEnabled: true,
    },
    animationTime: 0.5,

    // The zoom multiplier to use when using the zoom in/out buttons.
    zoomPerClick: 1.1,
    // Max zoom level
    maxZoomPixelRatio: 2.5,
  });
}

export default () => ({
  // Settings
  textZoom: 1,
  imageZoom: null,
  layout: 'side-by-side',
  // [transliteration] the source script
  fromScript: 'hk',
  // [transliteration] the destination script
  toScript: 'devanagari',

  // Internal-only
  layoutClasses: CLASSES_SIDE_BY_SIDE,
  isRunningOCR: false,
  hasUnsavedChanges: false,
  imageViewer: null,

  init() {
    this.loadSettings();
    this.layoutClasses = this.getLayoutClasses();

    // Set `imageZoom` only after the viewer is fully initialized.
    this.imageViewer = initializeImageViewer(IMAGE_URL);
    this.imageViewer.addHandler('open', () => {
      this.imageZoom = this.imageZoom || this.imageViewer.viewport.getHomeZoom();
      this.imageViewer.viewport.zoomTo(this.imageZoom);
    });

    // Warn the user if navigating away with unsaved changes.
    window.onbeforeunload = () => {
      if (this.hasUnsavedChanges) {
        return 'You have unsaved changes! If you leave this page, your changes will be lost.';
      }
      // so that eslint doesn't complain
      return undefined;
    };
  },

  // Settings IO

  loadSettings() {
    const settingsStr = localStorage.getItem(CONFIG_KEY);
    if (settingsStr) {
      try {
        const settings = JSON.parse(settingsStr);
        this.textZoom = settings.textZoom || this.textZoom;
        // We can only get an accurate default zoom after the viewer is fully
        // initialized. See `init` for details.
        this.imageZoom = settings.imageZoom;
        this.layout = settings.layout || this.layout;

        this.fromScript = settings.fromScript || this.fromScript;
        this.toScript = settings.toScript || this.toScript;

        // Normalize layout value to protect against some recent refactoring.
        if (!ALL_LAYOUTS.includes(this.layout)) {
          this.layout = LAYOUT_SIDE_BY_SIDE;
        }
      } catch (error) {
        // Old settings are invalid -- rewrite with valid values.
        this.saveSettings();
      }
    }
  },
  saveSettings() {
    const settings = {
      textZoom: this.textZoom,
      imageZoom: this.imageZoom,
      layout: this.layout,
      fromScript: this.fromScript,
      toScript: this.toScript,
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(settings));
  },
  getLayoutClasses() {
    if (this.layout === LAYOUT_TOP_AND_BOTTOM) {
      return CLASSES_TOP_AND_BOTTOM;
    }
    return CLASSES_SIDE_BY_SIDE;
  },

  // OCR controls

  async runOCR() {
    this.isRunningOCR = true;

    const { pathname } = window.location;
    const url = pathname.replace('/proofing/', '/api/ocr/');

    const content = await fetch(url)
      .then((response) => {
        if (response.ok) {
          return response.text();
        }
        return '(server error)';
      });
    $('#content').value = content;

    this.isRunningOCR = false;
  },

  // Image zoom controls

  increaseImageZoom() {
    this.imageZoom *= 1.2;
    this.imageViewer.viewport.zoomTo(this.imageZoom);
    this.saveSettings();
  },
  decreaseImageZoom() {
    this.imageZoom *= 0.8;
    this.imageViewer.viewport.zoomTo(this.imageZoom);
    this.saveSettings();
  },
  resetImageZoom() {
    this.imageZoom = this.imageViewer.viewport.getHomeZoom();
    this.imageViewer.viewport.zoomTo(this.imageZoom);
    this.saveSettings();
  },

  // Text zoom controls

  increaseTextSize() {
    this.textZoom += 0.2;
    this.saveSettings();
  },
  decreaseTextSize() {
    this.textZoom = Math.max(0, this.textZoom - 0.2);
    this.saveSettings();
  },

  // Layout controls

  displaySideBySide() {
    this.layout = LAYOUT_SIDE_BY_SIDE;
    this.layoutClasses = this.getLayoutClasses();
    this.saveSettings();
  },
  displayTopAndBottom() {
    this.layout = LAYOUT_TOP_AND_BOTTOM;
    this.layoutClasses = this.getLayoutClasses();
    this.saveSettings();
  },

  // Markup controls

  changeSelectedText(callback) {
    const { state } = window.view;
    let { tr } = state;
    const replacement = callback(state.doc.textBetween(tr.selection.from, tr.selection.to));
    tr = tr.replaceRangeWith(tr.selection.from, tr.selection.to, state.schema.text(replacement));
    window.view.updateState(state.apply(tr));
    // Retain focus for better UX.
    window.view.focus();
  },
  markAsError() {
    this.changeSelectedText((s) => `<error>${s}</error>`);
  },
  markAsFix() {
    this.changeSelectedText((s) => `<fix>${s}</fix>`);
  },
  markAsUnclear() {
    this.changeSelectedText((s) => `<flag>${s}</flag>`);
  },
  markAsFootnoteNumber() {
    this.changeSelectedText((s) => `[^${s}]`);
  },
  transliterate() {
    this.changeSelectedText((s) => Sanscript.t(s, this.fromScript, this.toScript));
    this.saveSettings();
  },

  // Character controls
  copyCharacter(e) {
    const character = e.target.textContent;
    navigator.clipboard.writeText(character);
  },
});
