// --- Constants ---
export const DEFAULT_ROWS = 36;
export const DEFAULT_COLS = 128;
export const DEFAULT_BEATS_PER_MEASURE = 4;
export const DEFAULT_TOP_NOTE = "C6";
export const DEFAULT_BPM = 120;
export const DEFAULT_ROOT = "C";
export const DEFAULT_SCALE = "major";
export const DEFAULT_LOOP_START = 0;
export const DEFAULT_LOOP_END = 32;
export const DEFAULT_LAYER = { name: "Piano", patch: "acoustic_grand_piano", color: [0, 242, 255], gm: 0, volume: 0.8 };

export const CELL_WIDTH = 60; // Width of a Quarter Note (Visual Square)
export const CELL_HEIGHT = 25;
export const STEPS_PER_GRID_CELL = 4; // 4 16th notes per Quarter Note
export const MARGIN_LEFT = 120;
export const PADDING_BOTTOM = 30;
export const PADDING_TOP = 30;
export const DRAG_THRESHOLD = 30; 
export const MAX_HISTORY = 50;
export const USE_LOCAL_SOUNDFONTS = true;

export const INSTRUMENT_DEFAULTS = {
    1: { name: "Piano", patch: "acoustic_grand_piano", color: [0, 242, 255], gm: 0 },
    2: { name: "Violin", patch: "violin", color: [200, 50, 50], gm: 40 },
    3: { name: "Viola", patch: "viola", color: [255, 200, 0], gm: 41 },
    4: { name: "Cello", patch: "cello", color: [255, 153, 0], gm: 42 },
    5: { name: "Contrabass", patch: "contrabass", color: [180, 100, 255], gm: 43 },
    6: { name: "Guitar (Nylon)", patch: "acoustic_guitar_nylon", color: [255, 255, 255], gm: 24 },
    7: { name: "Guitar (Clean)", patch: "electric_guitar_clean", color: [100, 100, 255], gm: 27 },
    8: { name: "Bass", patch: "electric_bass_finger", color: [100, 255, 180], gm: 33 },
    9: { name: "Flute", patch: "flute", color: [150, 0, 0], gm: 73 },
    10: { name: "Clarinet", patch: "clarinet", color: [50, 255, 50], gm: 71 },
    11: { name: "Trumpet", patch: "trumpet", color: [100, 200, 255], gm: 56 },
    12: { name: "French Horn", patch: "french_horn", color: [200, 200, 200], gm: 60 }
};

export const LAYER_COLORS = [
    [0, 242, 255], [200, 50, 50], [255, 200, 0], [255, 153, 0], 
    [180, 100, 255], [255, 255, 255], [100, 100, 255], [100, 255, 180],
    [150, 0, 0], [50, 255, 50], [100, 200, 255], [200, 200, 200],
    [255, 100, 150], [50, 50, 200], [200, 255, 100]
];

export const SCALE_FORMULAS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    melodicMinor: [0, 2, 3, 5, 7, 9, 11],
    majorPentatonic: [0, 2, 4, 7, 9],
    minorPentatonic: [0, 3, 5, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};
export const SOLFEGE_MAJOR = ["DO", "RE", "MI", "FA", "SOL", "LA", "SI"];
export const SOLFEGE_MINOR = ["DO", "RE", "ME", "FA", "SOL", "LE", "TE"];
export const SOLFEGE_PENTATONIC = ["DO", "RE", "MI", "SOL", "LA"];
export const SOLFEGE_CHROMATIC = ["DO", "RA", "RE", "ME", "MI", "FA", "FI", "SOL", "LE", "LA", "TE", "SI"];

export const chordProgressions = {
    "axis": { degrees: [1, 5, 6, 4] },
    "doo-wop": { degrees: [1, 6, 4, 5] },
    "sensitive": { degrees: [6, 4, 1, 5] },
    "andalusian": { degrees: [1, 7, 6, 5] }
};

export const gmPatchList = [
    "piano_pad",
    "acoustic_grand_piano", "bright_acoustic_piano", "electric_grand_piano", "honkytonk_piano", "electric_piano_1", "electric_piano_2", "harpsichord", "clavinet",
    "celesta", "glockenspiel", "music_box", "vibraphone", "marimba", "xylophone", "tubular_bells", "dulcimer",
    "drawbar_organ", "percussive_organ", "rock_organ", "church_organ", "reed_organ", "accordion", "harmonica", "tango_accordion",
    "acoustic_guitar_nylon", "acoustic_guitar_steel", "electric_guitar_jazz", "electric_guitar_clean", "electric_guitar_muted", "overdriven_guitar", "distortion_guitar", "guitar_harmonics",
    "acoustic_bass", "electric_bass_finger", "electric_bass_pick", "fretless_bass", "slap_bass_1", "slap_bass_2", "synth_bass_1", "synth_bass_2",
    "violin", "viola", "cello", "contrabass", "tremolo_strings", "pizzicato_strings", "orchestral_harp", "timpani",
    "string_ensemble_1", "string_ensemble_2", "synth_strings_1", "synth_strings_2", "choir_aahs", "voice_oohs", "synth_voice", "orchestra_hit",
    "trumpet", "trombone", "tuba", "muted_trumpet", "french_horn", "brass_section", "synth_brass_1", "synth_brass_2",
    "soprano_sax", "alto_sax", "tenor_sax", "baritone_sax", "oboe", "english_horn", "bassoon", "clarinet",
    "piccolo", "flute", "recorder", "pan_flute", "blown_bottle", "shakuhachi", "whistle", "ocarina",
    "lead_1_square", "lead_2_sawtooth", "lead_3_calliope", "lead_4_chiff", "lead_5_charang", "lead_6_voice", "lead_7_fifths", "lead_8_bass__lead",
    "pad_1_new_age", "pad_2_warm", "pad_3_polysynth", "pad_4_choir", "pad_5_bowed", "pad_6_metallic", "pad_7_halo", "pad_8_sweep",
    "fx_1_rain", "fx_2_soundtrack", "fx_3_crystal", "fx_4_atmosphere", "fx_5_brightness", "fx_6_goblins", "fx_7_echoes", "fx_8_scifi",
    "sitar", "banjo", "shamisen", "koto", "kalimba", "bagpipe", "fiddle", "shanai",
    "tinkle_bell", "agogo", "steel_drums", "woodblock", "taiko_drum", "melodic_tom", "synth_drum", "reverse_cymbal",
    "guitar_fret_noise", "breath_noise", "seashore", "bird_tweet", "telephone_ring", "helicopter", "applause", "gunshot"
];

// --- Global State ---
export const AppState = {
    grid: [],
    noteLookup: new Map(),
    rowMutes: [],
    rowSolos: [],
    accidentals: [],
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    beatsPerMeasure: DEFAULT_BEATS_PER_MEASURE,
    topNoteMidi: null,
    layers: [],
    nextLayerId: 1,

    playback: {
        currentStep: -1,
        loopStart: DEFAULT_LOOP_START,
        loopEnd: DEFAULT_LOOP_END,
        loopActive: false,
        isSmartLooping: false,
        smartLoopEnd: 0,
        lastActiveStep: 0,
        userLastStep: 0,
        targetLastStep: 0
    },

    editor: {
        selectedInst: 1,
        defaultNoteLen: 4,
        rhythm: 'note',
        convertMode: false,
        selectedNotes: [],
        accidentalMode: false,
        selectionMode: false,
        selectionStart: null,
        selectionEnd: null,
        isDragging: false,
        isPanning: false,
        panStart: { x: 0, y: 0, scrollL: 0, scrollTop: 0 },
        pressAndHold: null,
        resizingNode: null,
        clipboard: null,
        currentDragLength: null,
        snapToGrid: true,
        snapResolution: 4
    },

    settings: {
        instrumentMapping: {},
        globalOverrideActive: false,
        globalOverrideInst: 1,
        previousRoot: DEFAULT_ROOT
    },

    scale: {
        current: [],
        labels: [],
        solfege: []
    },

    history: {
        stack: [],
        index: -1
    },

    quiz: {
        active: false,
        targetGrid: [],
        targetAccidentals: [],
        feedback: [], // 2D array of 'correct', 'incorrect', 'missing'
        playTarget: false
    }
};

export const labelWidthCache = {};
export function getCachedTextWidth(txt, size, p5) {
    const key = `${txt}_${size}`;
    if (!labelWidthCache[key]) {
        p5.textSize(size);
        labelWidthCache[key] = p5.textWidth(txt);
    }
    return labelWidthCache[key];
}
