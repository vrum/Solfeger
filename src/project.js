import { AppState, DEFAULT_ROWS, DEFAULT_BEATS_PER_MEASURE, DEFAULT_LAYER, DEFAULT_ROOT, DEFAULT_SCALE, DEFAULT_LOOP_START, DEFAULT_COLS, DEFAULT_BPM, STEPS_PER_GRID_CELL, CELL_WIDTH, MARGIN_LEFT, CELL_HEIGHT, PADDING_BOTTOM, PADDING_TOP } from './state.js';
import { ui, showLoading, hideLoading, initPalette } from './ui.js';
import { updateBPM, loadInstrument, synths, disposeAllSynths, masterGain, masterReverb } from './audio.js';
import { updateScale, calculateCenteredTopNoteMidi, updateNoteLookup } from './gridLogic.js';

export function calculateDefaultCols() {
    const sidebarWidth = 180;
    const availableWidth = window.innerWidth - sidebarWidth - MARGIN_LEFT - 40;
    const measureWidth = AppState.beatsPerMeasure * CELL_WIDTH;
    let measures = Math.floor(availableWidth / measureWidth);
    if (measures < 1) measures = 1;
    return measures * AppState.beatsPerMeasure * STEPS_PER_GRID_CELL;
}

export function initGridState() {
    AppState.grid = Array(AppState.rows).fill().map(() => Array(AppState.cols).fill(null));
    AppState.accidentals = Array(AppState.rows).fill().map(() => Array(AppState.cols).fill(null));
    AppState.rowMutes = Array(AppState.rows).fill(false);
    AppState.rowSolos = Array(AppState.rows).fill(false);
}

export async function newProject(callbacks) {
    const { saveState, recalculateLastActiveStep, updateInstrumentLabel } = callbacks;
    if (confirm("Start a new project? This will clear all notes and reset settings to default.")) {
        showLoading("Creating New Project...");
        AppState.rows = DEFAULT_ROWS;
        AppState.beatsPerMeasure = DEFAULT_BEATS_PER_MEASURE;
        if (ui.measureSelect) ui.measureSelect.value = DEFAULT_BEATS_PER_MEASURE;
        AppState.cols = calculateDefaultCols();

        AppState.layers = [
            { id: 1, ...DEFAULT_LAYER }
        ];
        AppState.nextLayerId = 2;
        AppState.editor.selectedInst = 1;

        AppState.playback.loopActive = false;
        if (ui.loopActive) ui.loopActive.checked = false;
        AppState.playback.loopStart = DEFAULT_LOOP_START;
        if (ui.loopStart) ui.loopStart.value = DEFAULT_LOOP_START;
        AppState.playback.loopEnd = DEFAULT_COLS;
        if (ui.loopEnd) ui.loopEnd.value = DEFAULT_COLS;

        if (ui.rootSelect) ui.rootSelect.value = DEFAULT_ROOT;
        if (ui.scaleSelect) ui.scaleSelect.value = DEFAULT_SCALE;
        AppState.settings.previousRoot = DEFAULT_ROOT;
        updateBPM(DEFAULT_BPM);

        // Reset Audio Effects
        if (ui.swingSlider) {
            ui.swingSlider.value = "0";
            Tone.Transport.swing = 0;
        }
        if (ui.volumeSlider) {
            ui.volumeSlider.value = "-5";
            masterGain.gain.rampTo(Tone.dbToGain(-5), 0.1);
        }
        if (ui.reverbSlider) {
            ui.reverbSlider.value = "0";
            masterReverb.wet.rampTo(0, 0.1);
        }

        AppState.topNoteMidi = calculateCenteredTopNoteMidi(DEFAULT_ROOT, DEFAULT_SCALE, DEFAULT_ROWS);

        updateScale();
        initGridState();
        window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
        initPalette();

        // Clear synths and reload
        disposeAllSynths();
        const promises = AppState.layers.map(l => {
            return loadInstrument(l.id, l.patch, false, updateInstrumentLabel);
        });
        await Promise.all(promises);
        
        updateNoteLookup();
        recalculateLastActiveStep();
        saveState();
        hideLoading();
    }
}

export async function loadPreset(name, callbacks) {
    const { restoreState, saveState } = callbacks;
    showLoading(`Loading Preset: ${name}...`);
    try {
        let data;
        if (name.startsWith("user:")) {
            const userName = name.substring(5);
            const userPresets = JSON.parse(localStorage.getItem('solfeger_user_presets') || '{}');
            const entry = userPresets[userName];
            if (!entry) throw new Error("User preset not found: " + userName);
            data = entry.data || entry;
        } else {
            const response = await fetch(`presets/${name}.json`);
            const entry = await response.json();
            data = entry.data || entry;
        }
        await restoreState(data);
        saveState();
    } catch (e) {
        console.error("Failed to load preset", e);
        alert("Failed to load preset: " + e.message);
    } finally {
        hideLoading();
    }
}


