import { 
    AppState, DEFAULT_ROWS, DEFAULT_COLS, DEFAULT_BEATS_PER_MEASURE, DEFAULT_TOP_NOTE, DEFAULT_ROOT, DEFAULT_SCALE, DEFAULT_LAYER, 
    CELL_WIDTH, CELL_HEIGHT, STEPS_PER_GRID_CELL, MARGIN_LEFT, PADDING_BOTTOM, PADDING_TOP, gmPatchList, getCachedTextWidth 
} from './src/state.js';

console.log("Solfeger: main.js module loaded.");
import { 
    ui, tooltip, initPresets, initPalette, initGMPatches, showLoading, hideLoading, setUICallbacks, updatePlayButtonState, toggleSidebarCollapse, toggleToolbarCollapse, toggleGlobalOverride, setGlobalOverrideInst, toggleRemapOverlay, renderRemapList, randomizeMapping, resetMapping, toggleArchiveManager, openSaveQuizModal, closeSaveQuizModal, renderArchiveList, showWelcomeScreen 
} from './src/ui.js';
import { 
    initAudio, loadInstrument, synths, disposeAllSynths, recorder, getPlaybackId, togglePlay, toggleRecord, updateBPM, masterGain, masterReverb, setLayerVolume 
} from './src/audio.js';
import { 
    updateScale, calculateCenteredTopNoteMidi, getNoteAt, updateNoteLookup, getPlaybackNote, isAccidentalRedundant, ensurePatternPitches, addSelectedChordProgression, randomizeGrid, reverseGrid, flipGrid, shiftPattern, findNextScaleNoteMidi 
} from './src/gridLogic.js';
import { 
    handleMousePressed, handleMouseDragged, handleMouseReleased, handleKeyPressed, placeNote, copySelection, cutSelection, pasteSelection, deleteSelection, getSelectionBounds 
} from './src/input.js';
import { 
    gridToNotes, notesToGrid, exportJSON, exportMIDI, saveAsPreset, saveAsQuizTune, exportQuizTunes, importQuizTunes 
} from './src/fileIO.js';

import { 
    newProject, loadPreset, initGridState 
} from './src/project.js';
import * as eventHandlers from './src/eventHandlers.js';
import { startQuiz, endQuiz, togglePlayTarget, checkQuizAnswers, updateQuizUI, generateRandomExercise, initQuizTunes, loadQuizTune } from './src/quiz.js';




// --- Orchestration Callbacks ---
const callbacks = {
    updateLastActiveStep: (endStep) => {
        if (endStep > AppState.playback.lastActiveStep) {
            AppState.playback.lastActiveStep = endStep;
            updateSmartLoopEnd();
        }
    },
    recalculateLastActiveStep: () => {
        let userMax = 0;
        for (let r = 0; r < AppState.rows; r++) {
            for (let c = 0; c < AppState.cols; c++) {
                const cell = AppState.grid[r][c];
                if (cell) {
                    const end = c + cell.len;
                    if (end > userMax) userMax = end;
                }
            }
        }
        AppState.playback.userLastStep = userMax || 0;
        
        let targetMax = 0;
        if (AppState.quiz.active) {
            for (let r = 0; r < AppState.rows; r++) {
                for (let c = 0; c < AppState.cols; c++) {
                    const cell = AppState.quiz.targetGrid[r][c];
                    if (cell) {
                        const end = c + cell.len;
                        if (end > targetMax) targetMax = end;
                    }
                }
            }
        }
        AppState.playback.targetLastStep = targetMax || 0;

        // Backward compatibility for anything relying on lastActiveStep
        AppState.playback.lastActiveStep = AppState.quiz.active && AppState.quiz.playTarget ? targetMax : userMax;
        
        updateSmartLoopEnd();
    },
    findLastActiveStep: () => {
        let lastStep = 0;
        const gridToUse = (AppState.quiz.active && AppState.quiz.playTarget) ? AppState.quiz.targetGrid : AppState.grid;
        for (let r = 0; r < AppState.rows; r++) {
            for (let c = 0; c < AppState.cols; c++) {
                const cell = gridToUse[r][c];
                if (cell) {
                    const noteEnd = c + cell.len;
                    if (noteEnd > lastStep) lastStep = noteEnd;
                }
            }
        }
        return lastStep;
    },
    saveState: () => {
        callbacks.recalculateLastActiveStep();
        const state = {
            notes: gridToNotes(AppState.grid, AppState.accidentals),
            rowMutes: [...AppState.rowMutes],
            rowSolos: [...AppState.rowSolos],
            cols: AppState.cols,
            rows: AppState.rows,
            topNoteMidi: AppState.topNoteMidi,
            loopStart: AppState.playback.loopStart,
            loopEnd: AppState.playback.loopEnd,
            loopActive: AppState.playback.loopActive,
            root: ui.rootSelect?.value || AppState.settings.previousRoot,
            scale: ui.scaleSelect?.value || 'major',
            bpm: Tone.Transport.bpm.value,
            beatsPerMeasure: AppState.beatsPerMeasure,
            swing: Tone.Transport.swing,
            masterVolume: ui.volumeSlider ? parseFloat(ui.volumeSlider.value) : 0,
            reverbWet: ui.reverbSlider ? parseFloat(ui.reverbSlider.value) : 0,
            layers: JSON.parse(JSON.stringify(AppState.layers)),
            nextLayerId: AppState.nextLayerId,
            settings: JSON.parse(JSON.stringify(AppState.settings))
        };

        if (AppState.history.stack.length > 0) {
            const last = AppState.history.stack[AppState.history.index];
            if (last && last.bpm === state.bpm && last.root === state.root && last.scale === state.scale && 
                last.cols === state.cols && last.rows === state.rows && last.topNoteMidi === state.topNoteMidi &&
                JSON.stringify(last.notes) === JSON.stringify(state.notes) &&
                JSON.stringify(last.layers) === JSON.stringify(state.layers)) return;
        }

        localStorage.setItem('solfeger_state', JSON.stringify(state));
        
        if (AppState.history.index < AppState.history.stack.length - 1) {
            AppState.history.stack = AppState.history.stack.slice(0, AppState.history.index + 1);
        }
        AppState.history.stack.push(state);
        if (AppState.history.stack.length > 50) AppState.history.stack.shift();
        else AppState.history.index++;
    },
    startTone: async () => { await Tone.start(); },
    selectLayer: (id) => selectLayer(id),
    deleteLayer: (id) => deleteLayer(id),
    addLayer: () => addLayer(),
    togglePlay: (fn) => togglePlay(fn),
    toggleRecord: () => toggleRecord(),
    undo: () => undo(),
    redo: () => redo(),
    restoreState: (s) => restoreState(s),
    updateInstrumentLabel: (id, patch, update) => updateInstrumentLabel(id, patch, update),
    updateScale: () => updateScale(),
    findNextScaleNoteMidi: (m, d) => findNextScaleNoteMidi(m, d),
    initGridState: () => initGridState(),
    initPalette: () => initPalette(),
    loadInstrument: (id, patch, update, cb) => loadInstrument(id, patch, update, cb),
    copySelection: (p5) => copySelection(p5),
    cutSelection: (p5) => cutSelection(p5, callbacks),
    pasteSelection: (p5) => pasteSelection(p5, callbacks),
    deleteSelection: (p5) => deleteSelection(p5, callbacks),
    cycleScale: (dir) => eventHandlers.cycleScale(dir, callbacks),
    transpose: (semi) => eventHandlers.transpose(semi, callbacks),
    modifyRows: (loc, amt) => eventHandlers.modifyRows(loc, amt, callbacks),
    addChunk: () => eventHandlers.addChunk(callbacks),
    removeChunk: () => eventHandlers.removeChunk(callbacks),
    trimGrid: () => eventHandlers.trimGrid(callbacks),
    toggleHelp: () => eventHandlers.toggleHelp(),
    setLayerVolume: (id, vol) => setLayerVolume(id, vol)
};

function updateSmartLoopEnd() {
    let activeStep = AppState.quiz.active && AppState.quiz.playTarget ? AppState.playback.targetLastStep : AppState.playback.userLastStep;
    
    // Always play at least one full measure
    const minSteps = AppState.beatsPerMeasure * STEPS_PER_GRID_CELL;
    AppState.playback.smartLoopEnd = Math.max(minSteps, activeStep || 0);
}

function undo() {
    if (AppState.history.index > 0) {
        AppState.history.index--;
        const state = AppState.history.stack[AppState.history.index];
        restoreState(state);
        localStorage.setItem('solfeger_state', JSON.stringify(state));
    }
}

function redo() {
    if (AppState.history.index < AppState.history.stack.length - 1) {
        AppState.history.index++;
        const state = AppState.history.stack[AppState.history.index];
        restoreState(state);
        localStorage.setItem('solfeger_state', JSON.stringify(state));
    }
}

async function restoreState(state) {
    AppState.rowMutes = [...state.rowMutes];
    AppState.rowSolos = state.rowSolos ? [...state.rowSolos] : Array(state.rows).fill(false);

    if (state.grid) {
        AppState.grid = JSON.parse(JSON.stringify(state.grid));
        AppState.accidentals = state.accidentals ? JSON.parse(JSON.stringify(state.accidentals)) : Array(state.rows).fill().map(() => Array(state.cols).fill(null));
    } else if (state.notes) {
        const converted = notesToGrid(state.notes, state.rows, state.cols);
        AppState.grid = converted.grid;
        AppState.accidentals = converted.accidentals;
    }

    AppState.cols = state.cols;
    AppState.rows = state.rows;
    AppState.topNoteMidi = state.topNoteMidi;
    AppState.playback.loopStart = state.loopStart;
    AppState.playback.loopEnd = state.loopEnd;
    AppState.playback.loopActive = state.loopActive;
    ui.rootSelect.value = state.root;
    ui.scaleSelect.value = state.scale;
    if (state.bpm !== undefined) updateBPM(state.bpm);

    if (state.beatsPerMeasure !== undefined) {
        AppState.beatsPerMeasure = state.beatsPerMeasure;
        if (ui.measureSelect) ui.measureSelect.value = state.beatsPerMeasure.toString();
    }
    if (state.swing !== undefined) {
        eventHandlers.setSwing(state.swing);
        if (ui.swingSlider) ui.swingSlider.value = state.swing.toString();
    }
    if (state.masterVolume !== undefined) {
        eventHandlers.updateMasterVolume(state.masterVolume);
        if (ui.volumeSlider) ui.volumeSlider.value = state.masterVolume.toString();
    }
    if (state.reverbWet !== undefined) {
        eventHandlers.setMasterReverb(state.reverbWet);
        if (ui.reverbSlider) ui.reverbSlider.value = state.reverbWet.toString();
    }

    AppState.layers = JSON.parse(JSON.stringify(state.layers));
    AppState.nextLayerId = state.nextLayerId || (AppState.layers.reduce((max, l) => Math.max(max, l.id), 0) + 1);

    updateScale();
    updateNoteLookup();
    callbacks.recalculateLastActiveStep();
    initPalette();
    window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);

    disposeAllSynths();
    for (let l of AppState.layers) {
        await loadInstrument(l.id, l.patch, false, updateInstrumentLabel);
    }
}

function selectLayer(id) {
    AppState.editor.selectedInst = id;
    initPalette();
    if (ui.instPatchSelect) {
        const layer = getLayer(id);
        if (layer) ui.instPatchSelect.value = layer.patch;
    }
}

function deleteLayer(id) {
    AppState.layers = AppState.layers.filter(l => l.id !== id);
    if (AppState.editor.selectedInst === id) selectLayer(AppState.layers[0].id);
    else initPalette();
}

function addLayer() {
    const id = AppState.nextLayerId++;
    const newLayer = { id: id, ...DEFAULT_LAYER, color: [100, 100, 255] };
    AppState.layers.push(newLayer);
    loadInstrument(id, newLayer.patch, false, updateInstrumentLabel);
    initPalette();
}

function updateInstrumentLabel(id, patchName, updateName = true) {
    const layer = AppState.layers.find(l => l.id === id);
    if (!layer) return;
    layer.patch = patchName;
    if (updateName) {
        layer.name = patchName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    initPalette();
}

function getLayer(id) {
    return AppState.layers.find(l => l.id === id);
}

// --- Attach to Window for HTML event handlers ---
window.restoreState = restoreState;
window.newProject = () => newProject(callbacks);
window.exportJSON = exportJSON;
window.exportMIDI = () => exportMIDI(isAccidentalRedundant);
window.importJSON = (e) => eventHandlers.importJSON(e, callbacks);
window.importHookpad = (e) => eventHandlers.importHookpad(e, callbacks);
window.loadPreset = (name) => loadPreset(name, callbacks);
window.addSelectedChordProgression = () => addSelectedChordProgression(callbacks);
window.updateBPM = updateBPM;
window.setSwing = eventHandlers.setSwing;
window.setMasterVolume = eventHandlers.updateMasterVolume;
window.toggleLoopActive = (c) => eventHandlers.toggleLoopActive(c);
window.setLoopStart = eventHandlers.setLoopStart;
window.setLoopEnd = eventHandlers.setLoopEnd;
window.setRhythm = eventHandlers.setRhythm;
window.setNoteDuration = eventHandlers.setNoteDuration;
window.setDuration = eventHandlers.setNoteDuration;
window.setBeatsPerMeasure = (v) => eventHandlers.setBeatsPerMeasure(v, callbacks);
window.setSnapResolution = eventHandlers.setSnapResolution;
window.setGhostMode = eventHandlers.setGhostMode;
window.setChordMode = eventHandlers.setChordMode;
window.setRandomMode = eventHandlers.setRandomMode;
window.toggleSelectionMode = eventHandlers.toggleSelectionMode;
window.toggleAccidentalMode = eventHandlers.toggleAccidentalMode;
window.toggleConvertMode = eventHandlers.toggleConvertMode;
window.undo = undo;
window.redo = redo;
window.copySelection = () => copySelection(window);
window.cutSelection = () => cutSelection(window, callbacks);
window.pasteSelection = () => pasteSelection(window, callbacks);
window.deleteSelection = () => deleteSelection(window, callbacks);
window.setReverbWet = eventHandlers.setMasterReverb;
window.updateScale = updateScale;
window.changeRoot = (v) => eventHandlers.changeRoot(v, callbacks);
window.changeInstrumentPatch = (p) => { loadInstrument(AppState.editor.selectedInst, p, true, updateInstrumentLabel); callbacks.saveState(); };
window.randomizeGrid = () => randomizeGrid(callbacks);
window.reverseGrid = () => reverseGrid(callbacks);
window.flipGrid = () => flipGrid(callbacks);
window.shiftPattern = (d) => shiftPattern(d, callbacks);
window.transpose = (s) => eventHandlers.transpose(s, callbacks);
window.cycleScale = (d) => eventHandlers.cycleScale(d, callbacks);
window.modifyRows = (l, a) => eventHandlers.modifyRows(l, a, callbacks);
window.addChunk = () => eventHandlers.addChunk(callbacks);
window.removeChunk = () => eventHandlers.removeChunk(callbacks);
window.trimGrid = () => eventHandlers.trimGrid(callbacks);
window.toggleHelp = eventHandlers.toggleHelp;
window.applyConversion = (t) => eventHandlers.applyConversion(t, callbacks);
window.cancelConversion = eventHandlers.cancelConversion;
window.updateLoop = eventHandlers.updateLoop;
window.toggleSnapToGrid = (c) => eventHandlers.toggleSnapToGrid(c);
window.toggleGlobalOverride = toggleGlobalOverride;
window.setGlobalOverrideInst = setGlobalOverrideInst;
window.toggleRemapOverlay = toggleRemapOverlay;
window.renderRemapList = renderRemapList;
window.randomizeMapping = randomizeMapping;
window.resetMapping = resetMapping;
window.resetGrid = () => {
    initGridState();
    callbacks.saveState();
};
window.updateSmartLoopEnd = updateSmartLoopEnd;
window.startQuiz = startQuiz;
window.endQuiz = endQuiz;
window.togglePlayTarget = togglePlayTarget;
window.checkQuizAnswers = checkQuizAnswers;
window.generateRandomExercise = () => generateRandomExercise(callbacks);
window.saveAsPreset = saveAsPreset;
window.saveAsQuizTune = saveAsQuizTune;
window.loadQuizTune = loadQuizTune;
window.initQuizTunes = initQuizTunes;
window.initPresets = initPresets;
window.toggleArchiveManager = toggleArchiveManager;
window.openSaveQuizModal = openSaveQuizModal;
window.closeSaveQuizModal = closeSaveQuizModal;
window.exportQuizTunes = exportQuizTunes;
window.importQuizTunes = (e) => importQuizTunes(e);
window.renderArchiveList = renderArchiveList;



window.oncontextmenu = (e) => {
    if (e.target.closest('#canvas-holder')) e.preventDefault();
};


// --- p5.js Lifecycle Hooks ---
window.setup = () => {
    showWelcomeScreen();
    const canvas = createCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
    canvas.parent('p5-container');
    
    // UI DOM Cache
    ui.playBtn = document.getElementById('play-btn');
    ui.recBtn = document.getElementById('rec-btn');
    ui.rootSelect = document.getElementById('root-select');
    ui.scaleSelect = document.getElementById('scale-select');
    ui.canvasHolder = document.getElementById('canvas-holder');
    ui.palette = document.getElementById('palette');
    ui.instPatchSelect = document.getElementById('inst-patch-select');
    ui.loadingOverlay = document.getElementById('loading-overlay');
    ui.loadingText = document.getElementById('loading-text');
    ui.bpmSlider = document.getElementById('bpm-slider');
    ui.bpmInput = document.getElementById('bpm-input');
    ui.loopActive = document.getElementById('loop-active');
    ui.loopStart = document.getElementById('loop-start');
    ui.loopEnd = document.getElementById('loop-end');
    ui.ghostCheck = document.getElementById('ghost-check');
    ui.chordToggle = document.getElementById('chord-toggle');
    ui.randomToggle = document.getElementById('random-toggle');
    ui.snapToGrid = document.getElementById('snap-to-grid');
    ui.durationSelect = document.getElementById('duration-select');
    ui.snapSelect = document.getElementById('snap-select');
    ui.rhythmSelect = document.getElementById('rhythm-select');
    ui.presetSelect = document.getElementById('preset-select');
    ui.globalOverrideCheck = document.getElementById('global-override-check');
    ui.globalOverrideSelect = document.getElementById('global-override-select');
    ui.remapOverlay = document.getElementById('remap-overlay');
    ui.remapList = document.getElementById('remap-list');
    ui.helpOverlay = document.getElementById('help-overlay');
    
    ui.swingSlider = document.getElementById('swing-slider');
    ui.volumeSlider = document.getElementById('volume-slider');
    ui.reverbSlider = document.getElementById('reverb-slider');
    ui.measureSelect = document.getElementById('measure-select');

    document.getElementById('sidebar-toggle').onclick = toggleSidebarCollapse;
    document.getElementById('toolbar-toggle').onclick = toggleToolbarCollapse;
    ui.playBtn.onclick = () => togglePlay(callbacks.findLastActiveStep);
    ui.recBtn.onclick = toggleRecord;

    setUICallbacks(callbacks);
    initAudio();
    initGMPatches(gmPatchList);
    initPresets();
    initQuizTunes();

    // Default Project Init
    initGridState();
    AppState.layers = [{ id: 1, ...DEFAULT_LAYER }];
    AppState.topNoteMidi = calculateCenteredTopNoteMidi(DEFAULT_ROOT, DEFAULT_SCALE, DEFAULT_ROWS);

    loadInstrument(1, DEFAULT_LAYER.patch, false, updateInstrumentLabel);
    updateScale();
    initPalette();
    updateQuizUI();

    // Initial UI Setup for audio
    if (ui.swingSlider) eventHandlers.setSwing(ui.swingSlider.value);
    if (ui.volumeSlider) eventHandlers.updateMasterVolume(ui.volumeSlider.value);
    if (ui.reverbSlider) eventHandlers.setMasterReverb(ui.reverbSlider.value);
    if (ui.measureSelect) AppState.beatsPerMeasure = parseInt(ui.measureSelect.value);
    Tone.Transport.scheduleRepeat((time) => {
        let next = AppState.playback.currentStep + 1;
        let loopStart = 0;
        let loopEnd = AppState.cols;

        if (AppState.playback.loopActive) {
            loopStart = AppState.playback.loopStart;
            loopEnd = AppState.playback.loopEnd;
        } else if (AppState.playback.isSmartLooping) {
            loopEnd = AppState.playback.smartLoopEnd;
        }

        if (next >= loopEnd) next = loopStart;
        if (next < loopStart) next = loopStart;

        AppState.playback.currentStep = next;

        const anySolo = AppState.rowSolos.some(s => s);
        const gridToUse = (AppState.quiz.active && AppState.quiz.playTarget) ? AppState.quiz.targetGrid : AppState.grid;
        const accidentalsToUse = (AppState.quiz.active && AppState.quiz.playTarget) ? AppState.quiz.targetAccidentals : AppState.accidentals;

        for (let r = 0; r < AppState.rows; r++) {
            if (anySolo ? !AppState.rowSolos[r] : AppState.rowMutes[r]) continue;
            const cell = gridToUse[r][next];
            if (cell) {
                const playId = getPlaybackId(cell.id);
                // getPlaybackNote uses AppState.accidentals, we need to adapt it
                const baseNote = AppState.scale.current[r];
                const accidental = accidentalsToUse[r][next];
                const note = accidental ? Tone.Frequency(baseNote).transpose(accidental).toNote() : baseNote;

                if (synths[playId]) synths[playId].triggerAttackRelease(note, cell.len * Tone.Time("16n").toSeconds(), time);
            }
        }
    }, "16n");

    showWelcomeScreen();
};

window.draw = () => {
    const el = ui.canvasHolder;
    if (!el) return;

    if (Tone.Transport.state === 'started') {
        const x = (AppState.playback.currentStep / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT;
        if (AppState.playback.currentStep === 0) el.scrollLeft = 0;
        else if (x > el.scrollLeft + el.clientWidth - (CELL_WIDTH * 2)) {
            el.scrollLeft = x - el.clientWidth + (CELL_WIDTH * 3);
        }
    }
    
    background(20);
    
    const viewL = el.scrollLeft;
    const viewR = viewL + el.clientWidth;
    const viewT = el.scrollTop;
    const viewB = viewT + el.clientHeight;

    const startCol = max(0, Math.floor((viewL - MARGIN_LEFT) / (CELL_WIDTH / STEPS_PER_GRID_CELL)));
    const endCol = min(AppState.cols - 1, Math.ceil((viewR - MARGIN_LEFT) / (CELL_WIDTH / STEPS_PER_GRID_CELL)));
    const startRow = max(0, Math.floor((viewT - PADDING_TOP) / CELL_HEIGHT));
    const endRow = min(AppState.rows - 1, Math.ceil((viewB - PADDING_TOP) / CELL_HEIGHT));

    const rootName = ui.rootSelect.value;
    const rootMidiMod12 = Tone.Frequency(rootName + "0").toMidi() % 12;
    const centerRootMidi = Tone.Frequency(rootName + "4").toMidi();
    const rowIsRoot = [];
    const rowIsCenterRoot = [];

    for (let r = 0; r < AppState.rows; r++) {
        if (AppState.scale.current[r]) {
             const noteMidi = Tone.Frequency(AppState.scale.current[r]).toMidi();
             rowIsRoot[r] = (noteMidi % 12) === rootMidiMod12;
             rowIsCenterRoot[r] = noteMidi === centerRootMidi;
        } else {
             rowIsRoot[r] = false; rowIsCenterRoot[r] = false;
        }
    }

    // Side Markers
    for (let r = startRow; r <= endRow; r++) {
        const y = r * CELL_HEIGHT + PADDING_TOP;
        textAlign(RIGHT, CENTER); textSize(10);
        if (rowIsCenterRoot[r]) { fill(255, 255, 0); textStyle(BOLD); }
        else if (rowIsRoot[r]) { fill(255, 200, 0); textStyle(NORMAL); }
        else { fill(180); textStyle(NORMAL); }
        if (AppState.scale.labels[r]) text(AppState.scale.labels[r], MARGIN_LEFT - 10, y + CELL_HEIGHT / 2);
        
        const btnOffset = (CELL_HEIGHT - 20) / 2;
        fill(AppState.rowMutes[r] ? '#ff4d4d' : 40); stroke(60); rect(5, y + btnOffset, 20, 20, 4);
        fill(255); noStroke(); textAlign(CENTER, CENTER); text("M", 15, y + btnOffset + 11);
        fill(AppState.rowSolos[r] ? '#ffc107' : 40); stroke(60); rect(35, y + btnOffset, 20, 20, 4);
        fill(255); noStroke(); text("S", 45, y + btnOffset + 11);
    }

    push();
    translate(MARGIN_LEFT, PADDING_TOP);
    
    // Grid Background
    const startQ = Math.floor(startCol / STEPS_PER_GRID_CELL);
    const endQ = Math.ceil(endCol / STEPS_PER_GRID_CELL);

    for (let c = startQ; c <= endQ; c++) {
        let x = c * CELL_WIDTH;
        if (x + CELL_WIDTH < viewL - MARGIN_LEFT || x > viewR - MARGIN_LEFT) continue;
        for (let r = startRow; r <= endRow; r++) {
            let y = r * CELL_HEIGHT;
            let isCurrent = Math.floor(AppState.playback.currentStep / STEPS_PER_GRID_CELL) === c;
            
            // Quiz Feedback Background
            let fb = AppState.quiz.active ? AppState.quiz.feedback[r][c * STEPS_PER_GRID_CELL] : null;
            if (fb === 'missing') {
                fill(255, 85, 85, 40); // Soft Red for missing
            } else if (fb === 'correct') {
                fill(80, 250, 123, 40); // Soft Green for correct
            } else if (rowIsCenterRoot[r]) {
                fill(isCurrent ? 140 : 110, isCurrent ? 130 : 100, 40);
            } else if (rowIsRoot[r]) {
                fill(isCurrent ? 100 : 70, isCurrent ? 90 : 60, 20);
            } else {
                fill(isCurrent ? 55 : 35);
            }
            
            stroke(50); rect(x, y, CELL_WIDTH, CELL_HEIGHT, 2);
            
            if (fb === 'missing') {
                noFill(); stroke(255, 85, 85, 150); strokeWeight(1);
                rect(x + 5, y + 5, CELL_WIDTH - 10, CELL_HEIGHT - 10, 2);
            }
        }
    }

    // Draw Measure Delimiters (Culled)
    push();
    stroke(80);
    strokeWeight(2);
    const totalBeats = AppState.cols / STEPS_PER_GRID_CELL;
    for (let c = AppState.beatsPerMeasure; c < totalBeats; c += AppState.beatsPerMeasure) {
        let x = c * CELL_WIDTH;
        if (x < viewL - MARGIN_LEFT || x > viewR - MARGIN_LEFT) continue;
        line(x, 0, x, AppState.rows * CELL_HEIGHT);
    }
    pop();

    // Draw Loop Range Overlay
    if (AppState.playback.loopActive || AppState.playback.isSmartLooping) {
        push();
        const startX = ((AppState.playback.loopActive ? AppState.playback.loopStart : 0) / STEPS_PER_GRID_CELL) * CELL_WIDTH;
        const endX = ((AppState.playback.loopActive ? AppState.playback.loopEnd : AppState.playback.smartLoopEnd) / STEPS_PER_GRID_CELL) * CELL_WIDTH;
        
        if (!(endX < viewL - MARGIN_LEFT || startX > viewR - MARGIN_LEFT)) {
            fill(0, 255, 100, 15); // Transparent green highlight
            noStroke();
            rect(startX, 0, endX - startX, AppState.rows * CELL_HEIGHT);
            
            stroke(0, 255, 100, 100);
            strokeWeight(2);
            line(startX, 0, startX, AppState.rows * CELL_HEIGHT);
            line(endX, 0, endX, AppState.rows * CELL_HEIGHT);
        }
        pop();
    }

    // Notes Rendering
    const drawStartCol = max(0, startCol - 16); 
    const pulse = sin(frameCount * 0.2) * 40;

    // First Pass: Draw all note boxes
    for (let c = drawStartCol; c <= endCol; c++) {
        for (let r = 0; r < AppState.rows; r++) { 
            let cell = AppState.grid[r][c];
            if (!cell) continue;
            const layer = getLayer(cell.id);
            if (!layer) continue;

            const isCurrentLayer = cell.id === AppState.editor.selectedInst;
            const showGhosts = ui.ghostCheck?.checked ?? true;
            if (!isCurrentLayer && !showGhosts) continue;

            let isPlaying = (AppState.playback.currentStep >= c && AppState.playback.currentStep < c + cell.len);
            let isSelected = AppState.editor.selectedNotes.some(n => n.r === r && n.c === c);
            let x = (c / STEPS_PER_GRID_CELL) * CELL_WIDTH; 
            let col = [...layer.color];
            let w = ((cell.len / STEPS_PER_GRID_CELL) * CELL_WIDTH) - 2;

            // Quiz feedback color override
            if (AppState.quiz.active) {
                const fb = AppState.quiz.feedback[r][c];
                if (fb === 'correct') col = [80, 250, 123];
                else if (fb === 'incorrect' || fb === 'extra') col = [255, 85, 85];
            }

            if (cell.rhythm && cell.rhythm !== 'note') {
                ensurePatternPitches(cell, r);
                const minPitchRow = Math.min(...cell.customPitches);
                const maxPitchRow = Math.max(...cell.customPitches);
                if (maxPitchRow < startRow || minPitchRow > endRow) continue;
                if (x + w < viewL - MARGIN_LEFT || x > viewR - MARGIN_LEFT) continue;

                const containerY = minPitchRow * CELL_HEIGHT;
                const containerH = (maxPitchRow - minPitchRow + 1) * CELL_HEIGHT;
                
                if (isCurrentLayer) {
                    fill(isSelected ? 255 : col[0], isSelected ? 255 : col[1], isSelected ? 255 : col[2], 50);
                    noStroke(); rect(x + 1, containerY + 1, w, containerH - 2, 4);
                } else {
                    noFill(); stroke(...col, 100); rect(x + 1, containerY + 1, w, containerH - 2, 4);
                }
                
                let highlightColor = cell.rhythm === 'triplet' ? '#bd93f9' : (cell.rhythm === 'anapest' ? '#ffb86c' : '#8be9fd');
                if (!isCurrentLayer) highlightColor = '#555';
                if (isSelected) highlightColor = '#fff';
                noFill(); stroke(highlightColor); strokeWeight(2); rect(x + 1, containerY + 1, w, containerH - 2, 4);

                for (let i = 0; i < 3; i++) {
                    const targetR = cell.customPitches[i];
                    const noteY = targetR * CELL_HEIGHT;
                    let subNoteX, subNoteLen;
                    if (cell.rhythm === 'triplet') { subNoteX = x + 1 + (i * w / 3) + 2; subNoteLen = 1.33; }
                    else if (cell.rhythm === 'anapest') { subNoteLen = i === 2 ? 2 : 1; subNoteX = x + (i * w / 4) + 2; }
                    else { subNoteLen = i === 0 ? 2 : 1; subNoteX = x + (i === 0 ? 0 : (i === 1 ? 2 : 3) * w / 4) + 2; }

                    const sw = (cell.rhythm === 'triplet' ? w / 3 : subNoteLen * w / 4) - 4;
                    if (isCurrentLayer) {
                        if (isSelected) fill(255);
                        else fill(isPlaying ? min(255, col[0] + 100 + pulse) : col[0], isPlaying ? min(255, col[1] + 100 + pulse) : col[1], isPlaying ? min(255, col[2] + 100 + pulse) : col[2]);
                        noStroke();
                    } else {
                        noFill(); stroke(...col, 150);
                    }
                    rect(subNoteX, noteY + 5, sw, CELL_HEIGHT - 10, 4);
                }
            } else {
                if (x + w < viewL - MARGIN_LEFT || x > viewR - MARGIN_LEFT) continue;
                if (r < startRow || r > endRow) continue;

                if (isCurrentLayer) {
                    if (isSelected) fill(255);
                    else if (isPlaying) fill(min(255, col[0] + 100 + pulse), min(255, col[1] + 100 + pulse), min(255, col[2] + 100 + pulse));
                    else fill(...col);
                    noStroke();
                } else {
                    noFill(); stroke(...col, 150);
                }
                rect(x + 1, r * CELL_HEIGHT + 1, w, CELL_HEIGHT - 2, 2);
            }
        }
    }

    // Second Pass: Draw labels on top of everything
    for (let c = drawStartCol; c <= endCol; c++) {
        for (let r = 0; r < AppState.rows; r++) { 
            let cell = AppState.grid[r][c];
            if (!cell || cell.rhythm && cell.rhythm !== 'note') continue;
            
            // Only draw labels for the current layer
            if (cell.id !== AppState.editor.selectedInst) continue;

            let isPlaying = (AppState.playback.currentStep >= c && AppState.playback.currentStep < c + cell.len);
            let x = (c / STEPS_PER_GRID_CELL) * CELL_WIDTH; 
            let w = ((cell.len / STEPS_PER_GRID_CELL) * CELL_WIDTH) - 2;

            if (x + w < viewL - MARGIN_LEFT || x > viewR - MARGIN_LEFT) continue;
            if (r < startRow || r > endRow) continue;

            const syllable = AppState.scale.solfege[r] || '??';
            const acc = AppState.accidentals[r][c];
            const solText = syllable + (acc && !isAccidentalRedundant(r, acc) ? (acc === 1 ? '#' : 'b') : '');

            if (isPlaying || w > 15) {
                fill(0); textAlign(CENTER, CENTER); textSize(10); text(solText, x + w / 2, r * CELL_HEIGHT + CELL_HEIGHT / 2);
            } else {
                push();
                let stagger = 0;
                const beatStart = Math.floor(c / 4) * 4;
                let hasConflict = false;
                for (let bC = beatStart; bC < beatStart + 4; bC++) {
                    if (bC !== c && AppState.grid[r][bC] && AppState.grid[r][bC].len === 1) {
                        hasConflict = true;
                        break;
                    }
                }
                if (hasConflict) stagger = (c % 4) * 12;

                const bubbleX = x + w / 2;
                const bubbleY = r * CELL_HEIGHT - 12 - stagger;
                fill(255, 255, 255, 180); noStroke(); textSize(9);
                const tw = textWidth(solText) + 4;
                rect(bubbleX - tw / 2, bubbleY - 5.5, tw, 11, 3);
                fill(0); text(solText, bubbleX, bubbleY);
                pop();
            }
        }
    }
    pop();

    // Selection Overlay
    if (AppState.editor.selectionStart && AppState.editor.selectionEnd) {
        const b = getSelectionBounds(window);
        if (b) {
            push();
            translate(MARGIN_LEFT, PADDING_TOP);
            fill(255, 255, 255, 30);
            stroke(255);
            strokeWeight(1);
            const sx = (b.c1 / STEPS_PER_GRID_CELL) * CELL_WIDTH;
            const sw = ((b.c2 - b.c1 + 1) / STEPS_PER_GRID_CELL) * CELL_WIDTH;
            rect(sx, b.r1 * CELL_HEIGHT, sw, (b.r2 - b.r1 + 1) * CELL_HEIGHT);
            pop();
        }
    }

    // Tooltip Logic
    let handledTooltip = false;
    if (mouseX >= 0 && mouseX < width && mouseY >= 0 && mouseY < height) {
        if (mouseX > MARGIN_LEFT && mouseY > PADDING_TOP) {
            let c = floor((mouseX - MARGIN_LEFT) / (CELL_WIDTH / STEPS_PER_GRID_CELL));
            let r = floor((mouseY - PADDING_TOP) / CELL_HEIGHT);
            const info = getNoteAt(r, c);
            if (info) {
                const isCurrentLayer = info.note.id === AppState.editor.selectedInst;
                const showGhosts = ui.ghostCheck?.checked ?? true;
                if (isCurrentLayer || showGhosts) {
                    const layer = getLayer(info.note.id);
                    tooltip.show(`${layer.name}: ${AppState.scale.current[info.r]}`, mouseX, mouseY);
                    handledTooltip = true;
                }
            }
        }
    }
    if (!handledTooltip) tooltip.hide();
};

window.mousePressed = (e) => handleMousePressed(e, callbacks, window);
window.mouseDragged = () => handleMouseDragged(window);
window.mouseReleased = () => handleMouseReleased(callbacks);
window.keyPressed = (e) => handleKeyPressed(e, window, callbacks);

window.touchStarted = (e) => {
    if (Tone.context.state !== 'running') Tone.start();
    if (e.target.tagName !== 'CANVAS') return true;
    handleMousePressed(e, callbacks, window);
    return false; 
};
window.touchMoved = (e) => {
    if (e.target.tagName !== 'CANVAS') return true;
    if (AppState.editor.isPanning) { handleMouseDragged(window); return false; }
    if (!AppState.editor.pressAndHold) return false;
    if (AppState.editor.pressAndHold.cell) { handleMouseDragged(window); return false; }
    if (dist(mouseX, mouseY, AppState.editor.pressAndHold.startX, AppState.editor.pressAndHold.startY) > DRAG_THRESHOLD) {
        AppState.editor.pressAndHold = null;
    }
    return false;
};
window.touchEnded = (e) => {
    if (e.target.tagName !== 'CANVAS') return true;
    if (AppState.editor.pressAndHold || AppState.editor.isPanning) handleMouseReleased(callbacks);
    return false;
};


