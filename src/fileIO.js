import { AppState, DEFAULT_ROOT, DEFAULT_SCALE, DEFAULT_LAYER, SCALE_FORMULAS, STEPS_PER_GRID_CELL, CELL_WIDTH, MARGIN_LEFT, CELL_HEIGHT, PADDING_BOTTOM, PADDING_TOP } from './state.js';
import { ui } from './ui.js';

export function gridToNotes(grid, accidentals) {
    const notes = [];
    if (!grid) return notes;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            const cell = grid[r][c];
            if (cell) {
                const note = { ...cell, r, c };
                if (accidentals && accidentals[r] && accidentals[r][c]) {
                    note.acc = accidentals[r][c];
                }
                notes.push(note);
            }
        }
    }
    return notes;
}

export function notesToGrid(notes, rows, cols) {
    const grid = Array(rows).fill().map(() => Array(cols).fill(null));
    const accidentals = Array(rows).fill().map(() => Array(cols).fill(null));
    if (notes) {
        notes.forEach(n => {
            const col = n.c !== undefined ? n.c : n.s;
            if (n.r < rows && col < cols) {
                const { r, c, s, acc, ...cellData } = n;
                grid[n.r][col] = cellData;
                if (acc) accidentals[n.r][col] = acc;
            }
        });
    }
    return { grid, accidentals };
}

export function getProjectData() {
    return {
        version: 1.3,
        bpm: Tone.Transport.bpm.value,
        swing: Tone.Transport.swing,
        masterVolume: ui.volumeSlider ? parseFloat(ui.volumeSlider.value) : 0,
        reverbWet: ui.reverbSlider ? parseFloat(ui.reverbSlider.value) : 0,
        notes: gridToNotes(AppState.grid, AppState.accidentals),
        rows: AppState.rows,
        topNoteMidi: AppState.topNoteMidi,
        rowMutes: AppState.rowMutes,
        rowSolos: AppState.rowSolos,
        cols: AppState.cols,
        loopStart: AppState.playback.loopStart,
        beatsPerMeasure: AppState.beatsPerMeasure,
        loopEnd: AppState.playback.loopEnd,
        loopActive: AppState.playback.loopActive,
        root: ui.rootSelect.value,
        layers: AppState.layers,
        scale: ui.scaleSelect.value
    };
}

export function exportJSON() {
    const data = getProjectData();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "project.json"; a.click();
    URL.revokeObjectURL(url);
}

export function saveAsPreset() {
    const name = prompt("Enter a name for this preset:");
    if (!name) return;
    const userPresets = JSON.parse(localStorage.getItem('solfeger_user_presets') || '{}');
    userPresets[name] = { timestamp: Date.now(), data: getProjectData() };
    localStorage.setItem('solfeger_user_presets', JSON.stringify(userPresets));
    if (window.initPresets) window.initPresets();
}

export function saveAsQuizTune(name, data) {
    if (!name) return;
    const userQuizTunes = JSON.parse(localStorage.getItem('solfeger_user_quiz_tunes') || '{}');
    userQuizTunes[name] = { timestamp: Date.now(), data: data || getProjectData() };
    localStorage.setItem('solfeger_user_quiz_tunes', JSON.stringify(userQuizTunes));
    if (window.initQuizTunes) window.initQuizTunes();
    if (window.closeSaveQuizModal) window.closeSaveQuizModal();
}

export function exportQuizTunes() {
    const data = localStorage.getItem('solfeger_user_quiz_tunes') || '{}';
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "solfeger_quiz_tunes_backup.json"; a.click();
    URL.revokeObjectURL(url);
}

export function importQuizTunes(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            const local = JSON.parse(localStorage.getItem('solfeger_user_quiz_tunes') || '{}');
            let added = 0;
            let renamed = 0;

            for (let name in imported) {
                let finalName = name;
                if (local[finalName]) {
                    let counter = 1;
                    while (local[`${name} (${counter})`]) counter++;
                    finalName = `${name} (${counter})`;
                    renamed++;
                }
                local[finalName] = imported[name];
                added++;
            }

            localStorage.setItem('solfeger_user_quiz_tunes', JSON.stringify(local));
            alert(`Import successful: ${added} tunes added (${renamed} renamed to avoid conflicts).`);
            if (window.initQuizTunes) window.initQuizTunes();
            if (window.renderArchiveList) window.renderArchiveList();
        } catch (err) {
            console.error("Failed to import quiz tunes", err);
            alert("Invalid quiz backup file.");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}



export function exportMIDI(isAccidentalRedundant) {
    const midi = new Midi();
    midi.header.setTempo(Tone.Transport.bpm.value);

    const instNotes = {};
    for (let r = 0; r < AppState.rows; r++) {
        if (AppState.rowMutes[r]) continue; 
        for (let c = 0; c < AppState.cols; c++) {
            const cell = AppState.grid[r][c];
            if (cell) {
                if (!instNotes[cell.id]) instNotes[cell.id] = [];
                instNotes[cell.id].push({ r, c, cell });
            }
        }
    }

    AppState.layers.forEach(layer => {
        const id = layer.id;
        if (!instNotes[id]) return;
        const track = midi.addTrack();
        track.name = layer.name;
        let channel = id - 1;
        if (channel >= 9) channel += 1;
        track.channel = channel;
        track.instrument.number = layer.gm || 0;

        instNotes[id].forEach(item => {
            const { r, c, cell } = item;
            const time = c * Tone.Time("16n").toSeconds();

            if (cell.rhythm && cell.rhythm !== 'note') {
                cell.customPitches.forEach((p, i) => {
                    const base = AppState.scale.current[p];
                    const acc = (cell.customAccidentals && cell.customAccidentals[i] !== null) ? cell.customAccidentals[i] : (AppState.accidentals[r][c] || 0);
                    const midiPitch = isAccidentalRedundant(p, acc) ? Tone.Frequency(base).toMidi() : Tone.Frequency(base).transpose(acc).toMidi();
                    track.addNote({ midi: midiPitch, time: time + (i * 0.1), duration: 0.2 });
                });
            } else {
                const baseNote = AppState.scale.current[r];
                const acc = AppState.accidentals[r][c] || 0;
                const midiPitch = isAccidentalRedundant(r, acc) ? Tone.Frequency(baseNote).toMidi() : Tone.Frequency(baseNote).transpose(acc).toMidi();
                track.addNote({ midi: midiPitch, time: time, duration: cell.len * Tone.Time("16n").toSeconds() });
            }
        });
    });

    const blob = new Blob([midi.toArray()], { type: "audio/midi" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "solfeger_export.mid";
    a.click();
}

export async function parseHookpadData(data, callbacks) {
    const { updateScale, initGridState, recalculateLastActiveStep, saveState, initPalette, loadInstrument, updateInstrumentLabel } = callbacks;
    
    // Key/Scale Setup
    let root = DEFAULT_ROOT;
    let scale = DEFAULT_SCALE;
    if (data.keys && data.keys.length > 0) {
        root = data.keys[0].tonic;
        const hookScale = data.keys[0].scale;
        if (SCALE_FORMULAS[hookScale]) {
            scale = hookScale;
        } else if (hookScale.toLowerCase().includes('minor')) {
            scale = 'minor';
        } else {
            scale = 'major';
        }
    }
    ui.rootSelect.value = root;
    ui.scaleSelect.value = scale;
    AppState.settings.previousRoot = root;
    updateScale();

    // Scan Range
    let maxBeat = 32;
    if (data.notes) data.notes.forEach(n => { if (!n.isRest && (n.beat + n.duration) > maxBeat) maxBeat = n.beat + n.duration; });
    if (data.chords) data.chords.forEach(c => { if (!c.isRest && (c.beat + c.duration) > maxBeat) maxBeat = c.beat + c.duration; });
    AppState.cols = Math.max(32, Math.ceil(maxBeat * 4 / 32) * 32);

    initGridState(); 
    if (window.resizeCanvas) {
        window.resizeCanvas((AppState.cols / STEPS_PER_GRID_CELL) * CELL_WIDTH + MARGIN_LEFT, AppState.rows * CELL_HEIGHT + PADDING_BOTTOM + PADDING_TOP);
    }

    AppState.layers = [
        { id: 1, name: "Melody", ...DEFAULT_LAYER },
        { id: 2, name: "Chords (Pad)", patch: "piano_pad", color: [200, 50, 50], gm: 48 }
    ];
    AppState.nextLayerId = 3;
    initPalette();

    await loadInstrument(1, AppState.layers[0].patch, false, updateInstrumentLabel);
    await loadInstrument(2, AppState.layers[1].patch, false, updateInstrumentLabel);

    // Simplified Import Logic
    const formula = SCALE_FORMULAS[scale];
    const rootMidi = Tone.Frequency(root + "4").toMidi();

    const parseSD = (sdStr) => {
        if (typeof sdStr === 'number') return { sd: sdStr, acc: 0 };
        if (!sdStr) return { sd: 1, acc: 0 };
        let acc = 0;
        let sd = 0;
        if (sdStr.startsWith('#')) {
            acc = 1;
            sd = parseInt(sdStr.substring(1));
        } else if (sdStr.startsWith('b')) {
            acc = -1;
            sd = parseInt(sdStr.substring(1));
        } else {
            sd = parseInt(sdStr);
        }
        return { sd, acc };
    };

    const place = (sdVal, oct, beat, dur, instId, forceAcc = 0) => {
        const { sd, acc } = typeof sdVal === 'string' ? parseSD(sdVal) : { sd: sdVal, acc: forceAcc };
        const relSD = (sd - 1) + (oct * 7);
        const octaveShift = Math.floor(relSD / 7);
        const degreeIndex = (relSD % 7 + 7) % 7;
        const midi = rootMidi + octaveShift * 12 + formula[degreeIndex] + acc;
        
        let row = -1;
        for(let r=0; r<AppState.rows; r++) { 
            const rowMidi = Tone.Frequency(AppState.scale.current[r]).toMidi();
            if(rowMidi === midi) { 
                row = r; 
                break; 
            }
        }
        
        if (row === -1) {
            for(let r=0; r<AppState.rows; r++) {
                const rowMidi = Tone.Frequency(AppState.scale.current[r]).toMidi();
                if (Math.abs(rowMidi - midi) === 1) {
                    row = r;
                    AppState.accidentals[row][Math.round((beat - 1) * 4)] = midi - rowMidi;
                    break;
                }
            }
        }

        const col = Math.round((beat - 1) * 4);
        if (row >= 0 && row < AppState.rows && col >= 0 && col < AppState.cols) {
            AppState.grid[row][col] = { id: instId, len: Math.round(dur * 4) };
            if (acc !== 0 && !AppState.accidentals[row][col]) AppState.accidentals[row][col] = acc;
        }
    };

    if (data.notes) data.notes.forEach(n => { if (!n.isRest) place(n.sd, n.octave, n.beat, n.duration, 1); });
    
    if (data.chords) {
        data.chords.forEach(c => {
            if (!c.isRest) {
                const rootSD = c.root;
                place(rootSD, -1, c.beat, c.duration, 2);
                place(rootSD + 2, -1, c.beat, c.duration, 2);
                place(rootSD + 4, -1, c.beat, c.duration, 2);
            }
        });
    }

    recalculateLastActiveStep();
    saveState();
}
