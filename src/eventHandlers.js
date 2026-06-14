import { AppState, STEPS_PER_GRID_CELL, CELL_WIDTH, MARGIN_LEFT, CELL_HEIGHT, PADDING_BOTTOM, PADDING_TOP } from './state.js';
import { ui, initPalette } from './ui.js';
import { updateBPM, masterGain, masterReverb } from './audio.js';
import { updateScale, updateNoteLookup } from './gridLogic.js';
import { notesToGrid, parseHookpadData } from './fileIO.js';

export function setSwing(val) {
    Tone.Transport.swing = parseFloat(val);
}

export function updateMasterVolume(val) {
    masterGain.gain.rampTo(Tone.dbToGain(val), 0.1);
}

export function setMasterReverb(val) {
    masterReverb.wet.rampTo(parseFloat(val), 0.1);
}

export function toggleLoopActive(checked) {
    AppState.playback.loopActive = checked;
    AppState.playback.isSmartLooping = false;
}

export function setLoopStart(val) {
    AppState.playback.loopStart = parseInt(val);
}

export function setLoopEnd(val) {
    AppState.playback.loopEnd = parseInt(val);
}

export function setRhythm(val) {
    AppState.editor.rhythm = val;
    if (ui.rhythmSelect) ui.rhythmSelect.value = val;
}

export function setNoteDuration(val) {
    const len = parseInt(val);
    AppState.editor.defaultNoteLen = len;
    // Auto-snap logic
    if (len === 1 || len === 2 || len === 4) {
        setSnapResolution(len);
        if (ui.snapSelect) ui.snapSelect.value = len.toString();
    }
}

export function setBeatsPerMeasure(val, callbacks) {
    AppState.beatsPerMeasure = parseInt(val);
    if (callbacks && callbacks.saveState) callbacks.saveState();
}

export function setSnapResolution(val) {
    AppState.editor.snapResolution = parseInt(val);
}

export function setGhostMode(checked) {
    // p5.js will see ui.ghostCheck in draw()
}

export function setChordMode(checked) {
    // logic in input.js handles this
}

export function setRandomMode(checked) {
    // logic in input.js handles this
}

export function toggleSelectionMode(checked) {
    if (checked === undefined) checked = !AppState.editor.selectionMode;
    AppState.editor.selectionMode = checked;
    if (!checked) {
        AppState.editor.selectedNotes = [];
        AppState.editor.selectionStart = null;
        AppState.editor.selectionEnd = null;
    }
    
    if (checked) {
        toggleAccidentalMode(false);
        toggleConvertMode(false);
    }

    const btn = document.getElementById('select-btn');
    if (btn) btn.classList.toggle('active', checked);
}

export function toggleAccidentalMode(checked) {
    if (checked === undefined) checked = !AppState.editor.accidentalMode;
    AppState.editor.accidentalMode = checked;

    if (checked) {
        toggleSelectionMode(false);
        toggleConvertMode(false);
    }

    const btn = document.getElementById('accidental-btn');
    if (btn) btn.classList.toggle('active', checked);
}

export function toggleConvertMode(checked) {
    if (checked === undefined) checked = !AppState.editor.convertMode;
    AppState.editor.convertMode = checked;
    
    // Always clear selection when toggling convert mode
    AppState.editor.selectedNotes = [];
    const co = document.getElementById('convert-options');
    if (co) co.style.display = 'none';

    if (checked) {
        toggleSelectionMode(false);
        toggleAccidentalMode(false);
    }

    const btn = document.getElementById('convert-btn');
    if (btn) btn.classList.toggle('active', checked);
}

export function toggleSnapToGrid(checked) {
    if (checked === undefined) {
        const chk = document.getElementById('snap-to-grid');
        if (chk) checked = chk.checked;
        else checked = !AppState.editor.snapToGrid;
    }
    AppState.editor.snapToGrid = checked;
    const chk = document.getElementById('snap-to-grid');
    if (chk) chk.checked = checked;
}

export function changeRoot(newVal, callbacks) {
    const { updateScale, saveState } = callbacks;
    const roots = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    let oldIdx = roots.indexOf(AppState.settings.previousRoot);
    let newIdx = roots.indexOf(newVal);
    if (oldIdx === -1 || newIdx === -1) return;

    let diff = newIdx - oldIdx;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;

    AppState.topNoteMidi += diff;
    AppState.settings.previousRoot = newVal;
    if (ui.rootSelect) ui.rootSelect.value = newVal;

    updateScale();
    if (saveState) saveState();
}

export function updateProjectCols(val, callbacks) {
    const { saveState } = callbacks;
    const oldCols = AppState.cols;
    AppState.cols = parseInt(val);
    
    // Resize grid if needed
    for (let r = 0; r < AppState.rows; r++) {
        if (AppState.cols > oldCols) {
            AppState.grid[r] = AppState.grid[r].concat(Array(AppState.cols - oldCols).fill(null));
            AppState.accidentals[r] = AppState.accidentals[r].concat(Array(AppState.cols - oldCols).fill(null));
        } else {
            AppState.grid[r] = AppState.grid[r].slice(0, AppState.cols);
            AppState.accidentals[r] = AppState.accidentals[r].slice(0, AppState.cols);
        }
    }
    
    window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
    updateNoteLookup();
    saveState();
}

export function importJSON(event, callbacks) {
    const { restoreState, saveState } = callbacks;
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // Auto-detect Hookpad
            if (data.fp || (data.notes && data.notes.length > 0 && data.notes[0].sd !== undefined)) {
                await parseHookpadData(data, callbacks);
                return;
            }
            await restoreState(data);
            saveState();
        } catch (err) {
            console.error("Import error:", err);
            alert("Failed to import project.");
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

export async function importHookpad(event, callbacks) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = JSON.parse(e.target.result);
        await parseHookpadData(data, callbacks);
    };
    reader.readAsText(file);
}

export function transpose(semitones, callbacks) {
    const { updateScale, saveState } = callbacks;
    const roots = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    let currentRoot = ui.rootSelect.value;
    let idx = roots.indexOf(currentRoot);
    if (idx === -1) return;
    let newIdx = (idx + semitones + roots.length) % roots.length;
    ui.rootSelect.value = roots[newIdx];

    AppState.topNoteMidi += semitones;
    AppState.settings.previousRoot = roots[newIdx];

    updateScale();
    saveState();
}

export function cycleScale(dir, callbacks) {
    const { updateScale, saveState } = callbacks;
    const scales = ["major", "minor", "majorPentatonic", "chromatic"];
    let idx = scales.indexOf(ui.scaleSelect.value);
    if (idx === -1) idx = 0;
    let newIdx = (idx + dir + scales.length) % scales.length;
    ui.scaleSelect.value = scales[newIdx];
    updateScale();
    saveState();
}

export function modifyRows(location, amount, callbacks) {
    const { updateScale, saveState, findNextScaleNoteMidi } = callbacks;
    if (AppState.rows + amount < 4) return;

    if (location === 'top') {
        for (let r = 0; r < AppState.rows; r++) {
            for (let c = 0; c < AppState.cols; c++) {
                let cell = AppState.grid[r][c];
                if (cell && (cell.rhythm === 'triplet' || cell.rhythm === 'anapest' || cell.rhythm === 'dactyl') && cell.customPitches) {
                    cell.customPitches = cell.customPitches.map(p => p + amount);
                    if (amount < 0 && cell.customPitches.some(p => p < 0 || p >= (AppState.rows + amount))) {
                        AppState.grid[r][c] = null;
                    }
                }
            }
        }
        if (amount > 0) {
            AppState.grid.unshift(Array(AppState.cols).fill(null));
            AppState.rowMutes.unshift(false);
            AppState.rowSolos.unshift(false);
            AppState.accidentals.unshift(Array(AppState.cols).fill(null));
            AppState.topNoteMidi = findNextScaleNoteMidi(AppState.topNoteMidi, 1);
        } else {
            AppState.grid.shift();
            AppState.rowMutes.shift();
            AppState.rowSolos.shift();
            AppState.accidentals.shift();
            AppState.topNoteMidi = findNextScaleNoteMidi(AppState.topNoteMidi, -1);
        }
        const el = ui.canvasHolder;
        if (el) el.scrollTop += amount * CELL_HEIGHT;
    } else {
        if (amount > 0) {
            AppState.grid.push(Array(AppState.cols).fill(null));
            AppState.rowMutes.push(false);
            AppState.rowSolos.push(false);
            AppState.accidentals.push(Array(AppState.cols).fill(null));
        } else {
            AppState.grid.pop();
            AppState.rowMutes.pop();
            AppState.rowSolos.pop();
            AppState.accidentals.pop();
        }
    }
    AppState.rows += amount;
    updateScale(true); // Skip centering when manually modifying rows
    updateNoteLookup();
    window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
    saveState();
}

export function addChunk(callbacks) {
    const colsToAdd = AppState.beatsPerMeasure * STEPS_PER_GRID_CELL;
    AppState.cols += colsToAdd;
    window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
    for (let r = 0; r < AppState.rows; r++) for (let i = 0; i < colsToAdd; i++) AppState.grid[r].push(null);
    if (callbacks.saveState) callbacks.saveState();
}

export function removeChunk(callbacks) {
    if (AppState.cols <= 32) return;
    AppState.cols -= 32;
    window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
    for (let r = 0; r < AppState.rows; r++) AppState.grid[r].splice(AppState.cols);
    if (AppState.playback.currentStep >= AppState.cols) AppState.playback.currentStep = 0;
    if (AppState.playback.loopEnd > AppState.cols) { AppState.playback.loopEnd = AppState.cols; if(ui.loopEnd) ui.loopEnd.value = AppState.playback.loopEnd; }
    if (callbacks.saveState) callbacks.saveState();
}

export function trimGrid(callbacks) {
    const { findLastActiveStep, saveState } = callbacks;
    const lastStep = findLastActiveStep();
    const stepsPerMeasure = AppState.beatsPerMeasure * STEPS_PER_GRID_CELL;

    if (lastStep === 0) {
        AppState.cols = stepsPerMeasure * 2; // Default to 2 measures
    } else {
        // Round up to nearest measure
        AppState.cols = Math.max(stepsPerMeasure, Math.ceil(lastStep / stepsPerMeasure) * stepsPerMeasure);
    }
    
    for (let r = 0; r < AppState.rows; r++) {
        AppState.grid[r] = AppState.grid[r].slice(0, AppState.cols);
        AppState.accidentals[r] = AppState.accidentals[r].slice(0, AppState.cols);
    }

    window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
    if (saveState) saveState();
}

export function toggleHelp() {
    const overlay = document.getElementById('help-overlay');
    if (overlay) overlay.style.display = overlay.style.display === 'flex' ? 'none' : 'flex';
}

export function cancelConversion() {
    AppState.editor.selectedNotes = [];
    const co = document.getElementById('convert-options');
    if (co) co.style.display = 'none';
}

export function applyConversion(type, callbacks) {
    if (AppState.editor.selectedNotes.length !== 3) return;
    AppState.editor.selectedNotes.sort((a, b) => a.c - b.c);
    const startCol = AppState.editor.selectedNotes[0].c;
    const pitches = AppState.editor.selectedNotes.map(n => n.r);
    const sourceCols = AppState.editor.selectedNotes.map(n => n.c);
    const sourceAccidentals = AppState.editor.selectedNotes.map(n => AppState.accidentals[n.r][n.c] || null);
    const instId = AppState.editor.selectedNotes[0].cell.id;

    AppState.editor.selectedNotes.forEach(n => {
        AppState.grid[n.r][n.c] = null;
        AppState.accidentals[n.r][n.c] = null;
    });

    if (type === 'triplet') {
        if (startCol + 4 <= AppState.cols) AppState.grid[pitches[0]][startCol] = { id: instId, len: 4, rhythm: 'triplet', customPitches: pitches, sourceCols: sourceCols, customAccidentals: sourceAccidentals };
    } else if (type === 'anapest') {
        if (startCol + 4 <= AppState.cols) AppState.grid[pitches[0]][startCol] = { id: instId, len: 4, rhythm: 'anapest', customPitches: pitches, customAccidentals: sourceAccidentals };
    } else if (type === 'dactyl') {
        if (startCol + 4 <= AppState.cols) AppState.grid[pitches[0]][startCol] = { id: instId, len: 4, rhythm: 'dactyl', customPitches: pitches, customAccidentals: sourceAccidentals };
    }
    updateNoteLookup();
    cancelConversion();
    if (callbacks.saveState) callbacks.saveState();
}

export function updateLoop() {
    AppState.playback.loopActive = ui.loopActive.checked;
    AppState.playback.loopStart = parseInt(ui.loopStart.value);
    AppState.playback.loopEnd = parseInt(ui.loopEnd.value);
    if (AppState.playback.loopStart < 0) AppState.playback.loopStart = 0;
    if (AppState.playback.loopEnd > AppState.cols) AppState.playback.loopEnd = AppState.cols;
    if (AppState.playback.loopStart >= AppState.playback.loopEnd) AppState.playback.loopStart = AppState.playback.loopEnd - 1;
    ui.loopStart.value = AppState.playback.loopStart;
    ui.loopEnd.value = AppState.playback.loopEnd;
}
