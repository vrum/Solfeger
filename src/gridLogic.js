import { AppState, SCALE_FORMULAS, SOLFEGE_MAJOR, SOLFEGE_MINOR, SOLFEGE_PENTATONIC, SOLFEGE_CHROMATIC, CELL_HEIGHT, PADDING_TOP, chordProgressions } from './state.js';
import { ui } from './ui.js';

export function updateNoteLookup() {
    AppState.noteLookup.clear();
    for (let r = 0; r < AppState.rows; r++) {
        for (let c = 0; c < AppState.cols; c++) {
            const cell = AppState.grid[r][c];
            if (cell) {
                for (let i = 0; i < cell.len; i++) {
                    const col = c + i;
                    if (!AppState.noteLookup.has(col)) AppState.noteLookup.set(col, new Set());
                    AppState.noteLookup.get(col).add({ r, c, note: cell });
                }
            }
        }
    }
}

export function getNoteAt(r, c) {
    if (!AppState.noteLookup.has(c)) return null;
    const candidates = AppState.noteLookup.get(c);
    for (let cand of candidates) {
        if ((!cand.note.rhythm || cand.note.rhythm === 'note') && cand.r === r) {
            return { note: cand.note, r: cand.r, c: cand.c };
        }
        if (cand.note.rhythm && cand.note.rhythm !== 'note') {
            ensurePatternPitches(cand.note, cand.r);
            const minP = Math.min(...cand.note.customPitches);
            const maxP = Math.max(...cand.note.customPitches);
            if (r >= minP && r <= maxP) {
                return { note: cand.note, r: cand.r, c: cand.c };
            }
        }
    }
    return null;
}

export function ensurePatternPitches(cell, r) {
    if (!cell.customPitches) {
        if (cell.intervals) {
            cell.customPitches = cell.intervals.map(inter => 
                Math.max(0, Math.min(AppState.rows - 1, r + inter))
            );
        } else if (cell.arp) {
            cell.customPitches = [
                r,
                Math.max(0, r - 2),
                Math.max(0, r - 4)
            ];
        } else {
            cell.customPitches = [r, r, r];
        }
    }
    if (!cell.customAccidentals) {
        cell.customAccidentals = [null, null, null];
    }
}

export function updateScale(skipCenter = false) {
    let formulaName = ui.scaleSelect.value;
    if (!SCALE_FORMULAS[formulaName]) {
        formulaName = "major";
        ui.scaleSelect.value = "major";
    }
    const formula = SCALE_FORMULAS[formulaName];
    const rootName = ui.rootSelect.value;
    
    if (!rootName) {
        ui.rootSelect.value = "C";
        return updateScale(skipCenter);
    }

    const rootMidiMod12 = Tone.Frequency(rootName + "0").toMidi() % 12;

    AppState.scale.current = [];
    AppState.scale.labels = [];
    AppState.scale.solfege = [];

    let currentMidi = AppState.topNoteMidi;
    if (isNaN(currentMidi)) currentMidi = Tone.Frequency("C6").toMidi();

    let safetyCounter = 0;
    while (AppState.scale.current.length < AppState.rows) {
        const currentMidiMod12 = currentMidi % 12;
        const intervalFromRoot = (currentMidiMod12 - rootMidiMod12 + 12) % 12;

        if (formula.includes(intervalFromRoot)) {
            const noteName = Tone.Frequency(currentMidi, "midi").toNote();
            AppState.scale.current.push(noteName);

            let label = noteName;
            let solfegeSyllable = noteName.replace(/[0-9]/g, '');
            const solfegeMap = {
                major: SOLFEGE_MAJOR,
                minor: SOLFEGE_MINOR,
                harmonicMinor: SOLFEGE_MAJOR,
                melodicMinor: SOLFEGE_MAJOR,
                majorPentatonic: SOLFEGE_PENTATONIC,
                chromatic: SOLFEGE_CHROMATIC
            };
            if (solfegeMap[formulaName]) {
                const scaleDegree = formula.indexOf(intervalFromRoot);
                if (scaleDegree > -1) {
                    const syllable = solfegeMap[formulaName][scaleDegree];
                    label += ` (${syllable})`;
                    solfegeSyllable = syllable;
                }
            }
            AppState.scale.labels.push(label);
            AppState.scale.solfege.push(solfegeSyllable);
        }
        currentMidi--;
        safetyCounter++;
        if (safetyCounter > 1000) break;
    }

    if (ui.canvasHolder && !skipCenter) {
        const centerRootMidi = Tone.Frequency(rootName + "4").toMidi();
        let centerRow = -1;
        for (let r = 0; r < AppState.scale.current.length; r++) {
             if (Tone.Frequency(AppState.scale.current[r]).toMidi() === centerRootMidi) {
                 centerRow = r;
                 break;
             }
        }
        if (centerRow !== -1) {
             const rowY = centerRow * CELL_HEIGHT + PADDING_TOP;
             const containerH = ui.canvasHolder.clientHeight;
             ui.canvasHolder.scrollTop = rowY - (containerH / 2) + (CELL_HEIGHT / 2);
        }
    }
}

export function calculateCenteredTopNoteMidi(rootName, scaleName, rows) {
    const rootMidi = Tone.Frequency(rootName + "4").toMidi();
    const formula = SCALE_FORMULAS[scaleName];
    const rootMidiMod12 = Tone.Frequency(rootName + "0").toMidi() % 12;
    
    let count = 0;
    let currentMidi = rootMidi;
    const targetDistance = Math.floor(rows / 2);

    while (count < targetDistance) {
        currentMidi++;
        const m = currentMidi % 12;
        const interval = (m - rootMidiMod12 + 12) % 12;
        if (formula.includes(interval)) count++;
    }
    return currentMidi;
}

export function isAccidentalRedundant(r, accidental) {
    if (!accidental) return false;
    const baseNote = AppState.scale.current[r];
    const baseMidi = Tone.Frequency(baseNote).toMidi();

    if (accidental === 1) {
        if (r === 0) return false;
        const nextUpMidi = Tone.Frequency(AppState.scale.current[r - 1]).toMidi();
        return (baseMidi + 1) === nextUpMidi;
    }

    if (accidental === -1) {
        if (r === AppState.rows - 1) return false;
        const nextDownMidi = Tone.Frequency(AppState.scale.current[r + 1]).toMidi();
        return (baseMidi - 1) === nextDownMidi;
    }
    return false;
}

export function getPlaybackNote(row, col) {
    const baseNote = AppState.scale.current[row];
    const accidental = AppState.accidentals[row][col];
    if (!accidental) return baseNote;
    return Tone.Frequency(baseNote).transpose(accidental).toNote();
}

export function addSelectedChordProgression(callbacks) {
    const progKey = document.getElementById('progression-select').value;
    if (!progKey) return;
    const prog = chordProgressions[progKey];
    const { saveState, recalculateLastActiveStep } = callbacks;

    // Find center DO (root)
    let centerRow = -1;
    for (let r = 0; r < AppState.rows; r++) {
        if (AppState.scale.solfege[r] === "DO" && Tone.Frequency(AppState.scale.current[r]).toNote().includes("4")) {
            centerRow = r; break;
        }
    }
    if (centerRow === -1) centerRow = Math.floor(AppState.rows / 2);

    prog.degrees.forEach((deg, i) => {
        const col = i * 16; // One chord per measure (16 steps)
        if (col >= AppState.cols) return;
        
        // Simplified: place root of the chord
        let targetR = centerRow;
        // Map degree to row... (very simplified)
        if (deg === 1) targetR = centerRow;
        else if (deg === 4) targetR = centerRow - 3;
        else if (deg === 5) targetR = centerRow - 4;
        else if (deg === 6) targetR = centerRow - 5;
        else if (deg === 7) targetR = centerRow - 6;

        if (targetR >= 0 && targetR < AppState.rows) {
            AppState.grid[targetR][col] = { id: AppState.editor.selectedInst, len: 16 };
        }
    });

    updateNoteLookup();
    recalculateLastActiveStep();
    saveState();
}

export function randomizeGrid(callbacks) {
    for (let c = 0; c < AppState.cols; c++) if (Math.random() > 0.85) AppState.grid[Math.floor(Math.random() * AppState.rows)][c] = { id: AppState.editor.selectedInst, len: 1 };
    if (callbacks && callbacks.saveState) callbacks.saveState();
}

export function reverseGrid(callbacks) {
    let minC = AppState.cols, maxC = 0, hasNotes = false;
    for (let r = 0; r < AppState.rows; r++) {
        for (let c = 0; c < AppState.cols; c++) {
            if (AppState.grid[r][c]) {
                hasNotes = true;
                minC = Math.min(minC, c);
                maxC = Math.max(maxC, c + AppState.grid[r][c].len);
            }
        }
    }
    if (!hasNotes) return;
    const span = maxC - minC;
    let snapshotGrid = Array(AppState.rows).fill().map(() => Array(span).fill(null));
    let snapshotAcc = Array(AppState.rows).fill().map(() => Array(span).fill(null));

    for (let r = 0; r < AppState.rows; r++) {
        for (let c = minC; c < maxC; c++) {
            if (AppState.grid[r][c]) {
                let cell = AppState.grid[r][c];
                let cellCopy = JSON.parse(JSON.stringify(cell));
                if (cellCopy.customPitches) {
                    cellCopy.customPitches.reverse();
                    if (cellCopy.rhythm === 'anapest') cellCopy.rhythm = 'dactyl';
                    else if (cellCopy.rhythm === 'dactyl') cellCopy.rhythm = 'anapest';
                }
                let newRelC = span - (c - minC + cellCopy.len);
                snapshotGrid[r][newRelC] = cellCopy;
                snapshotAcc[r][newRelC] = AppState.accidentals[r][c];
            }
            AppState.grid[r][c] = null;
            AppState.accidentals[r][c] = null;
        }
    }
    for (let r = 0; r < AppState.rows; r++) {
        for (let relC = 0; relC < span; relC++) {
            AppState.grid[r][minC + relC] = snapshotGrid[r][relC];
            AppState.accidentals[r][minC + relC] = snapshotAcc[r][relC];
        }
    }
    if (callbacks && callbacks.saveState) callbacks.saveState();
}

export function flipGrid(callbacks) {
    for (let r = 0; r < AppState.rows; r++) {
        for (let c = 0; c < AppState.cols; c++) {
            let cell = AppState.grid[r][c];
            if (cell && (cell.rhythm === 'triplet' || cell.rhythm === 'anapest' || cell.rhythm === 'dactyl') && cell.customPitches) {
                cell.customPitches = cell.customPitches.map(p => (AppState.rows - 1) - p);
            }
        }
    }
    AppState.grid.reverse();
    if (callbacks && callbacks.saveState) callbacks.saveState();
}

export function shiftPattern(dir, callbacks) {
    for (let r = 0; r < AppState.rows; r++) {
        if (dir === 1) AppState.grid[r].unshift(AppState.grid[r].pop());
        else AppState.grid[r].push(AppState.grid[r].shift());
    }
    if (callbacks && callbacks.saveState) callbacks.saveState();
}

export function findNextScaleNoteMidi(startMidi, direction) {
    let formulaName = ui.scaleSelect.value;
    if (!SCALE_FORMULAS[formulaName]) formulaName = "major";
    const formula = SCALE_FORMULAS[formulaName];
    const rootName = ui.rootSelect.value || "C";
    const rootMidiMod12 = Tone.Frequency(rootName + "0").toMidi() % 12;

    let nextMidi = startMidi;
    let safety = 0;
    do {
        nextMidi += direction;
        const mMod12 = (nextMidi % 12 + 12) % 12;
        const intervalFromRoot = (mMod12 - rootMidiMod12 + 12) % 12;
        if (formula.includes(intervalFromRoot)) return nextMidi;
        if (++safety > 127) return startMidi;
    } while (true);
}
