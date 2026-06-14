import { AppState, DRAG_THRESHOLD, MARGIN_LEFT, STEPS_PER_GRID_CELL, CELL_WIDTH, PADDING_TOP, CELL_HEIGHT } from './state.js';
import { ui } from './ui.js';
import { getPlaybackId, synths, togglePlay, toggleRecord, updateBPM } from './audio.js';
import { getNoteAt, updateNoteLookup, ensurePatternPitches, isAccidentalRedundant, calculateCenteredTopNoteMidi } from './gridLogic.js';

export function placeNote(r, c, callbacks) {
    const { updateLastActiveStep, saveState } = callbacks;
    const rhythm = AppState.editor.rhythm;
    let notesForFeedback = [];
    let isRandom = ui.randomToggle.checked;
    let placed = [];

    if (rhythm === 'note') {
        let chordMode = ui.chordToggle.checked;
        const place = (row) => {
            if (row < AppState.rows) {
                let len = AppState.editor.defaultNoteLen;
                if (c + len > AppState.cols) len = AppState.cols - c;
                AppState.grid[row][c] = { id: AppState.editor.selectedInst, len: len };
                notesForFeedback.push(AppState.scale.current[row]);
                updateLastActiveStep(c + len);
                placed.push({ r: row, c: c });
            }
        };
        place(r);
        if (chordMode) { place(r + 2); place(r + 4); }
    } else {
        notesForFeedback.push(AppState.scale.current[r]);
        switch (rhythm) {
            case 'triplet':
                if (c + 3 >= AppState.cols) break;
                AppState.grid[r][c] = { id: AppState.editor.selectedInst, len: 4, rhythm: 'triplet', arp: ui.chordToggle.checked };
                for (let i = 1; i < 4; i++) AppState.grid[r][c + i] = null;
                updateLastActiveStep(c + 4);
                break;
            case 'anapest':
            case 'dactyl':
                if (c + 3 >= AppState.cols) break;
                let r2 = isRandom ? Math.floor(Math.random() * AppState.rows) : (ui.chordToggle.checked ? Math.max(0, r - 2) : r);
                let r3 = isRandom ? Math.floor(Math.random() * AppState.rows) : (ui.chordToggle.checked ? Math.max(0, r - 4) : r);
                AppState.grid[r][c] = { id: AppState.editor.selectedInst, len: 4, rhythm: rhythm, customPitches: [r, r2, r3] };
                for (let i = 1; i < 4; i++) AppState.grid[r][c + i] = null;
                updateLastActiveStep(c + 4);
                if (ui.chordToggle.checked || isRandom) {
                    if (AppState.scale.current[r2]) notesForFeedback.push(AppState.scale.current[r2]);
                    if (AppState.scale.current[r3]) notesForFeedback.push(AppState.scale.current[r3]);
                }
                break;
        }
    }

    let playId = getPlaybackId(AppState.editor.selectedInst);
    if (synths[playId]) synths[playId].triggerAttackRelease(notesForFeedback, "16n");
    return placed;
}

export function handleMousePressed(e, callbacks, p5) {
    const { startTone, saveState } = callbacks;
    if (e && e.target.tagName !== 'CANVAS') return; 
    startTone();

    if (p5.mouseButton === p5.CENTER || (p5.keyIsPressed && p5.key === ' ')) {
        AppState.editor.isPanning = true;
        AppState.editor.panStart = { x: p5.mouseX, y: p5.mouseY, scrollL: ui.canvasHolder.scrollLeft, scrollT: ui.canvasHolder.scrollTop };
        return;
    }

    let c = p5.floor((p5.mouseX - MARGIN_LEFT) / (CELL_WIDTH / STEPS_PER_GRID_CELL));
    let r = p5.floor((p5.mouseY - PADDING_TOP) / CELL_HEIGHT);

    if (p5.mouseX < MARGIN_LEFT) {
        if (r >= 0 && r < AppState.rows) {
            let yInCell = (p5.mouseY - PADDING_TOP) % CELL_HEIGHT;
            const btnOffset = (CELL_HEIGHT - 20) / 2;
            if (p5.mouseX >= 5 && p5.mouseX <= 25 && yInCell >= btnOffset && yInCell <= btnOffset + 20) {
                AppState.rowMutes[r] = !AppState.rowMutes[r];
                saveState();
            }
            if (p5.mouseX >= 35 && p5.mouseX <= 55 && yInCell >= btnOffset && yInCell <= btnOffset + 20) {
                AppState.rowSolos[r] = !AppState.rowSolos[r];
                saveState();
            }
        }
        return;
    }

    if (c < 0 || c >= AppState.cols || r < 0 || r >= AppState.rows) return;

    let snappedC = c;
    if (AppState.editor.snapToGrid) snappedC = Math.floor(c / AppState.editor.snapResolution) * AppState.editor.snapResolution;

    const noteInfo = getNoteAt(r, c);
    AppState.editor.pressAndHold = { 
        startR: noteInfo ? noteInfo.r : r, 
        startC: noteInfo ? noteInfo.c : c, 
        snappedC, 
        startX: p5.mouseX, 
        startY: p5.mouseY, 
        cell: noteInfo?.note, 
        noteInfo, 
        mode: null 
    };

    if (AppState.editor.selectionMode) {
        AppState.editor.pressAndHold.mode = 'select';
        AppState.editor.selectionStart = { r, c };
        AppState.editor.selectionEnd = { r, c };
        return;
    }
    
    if (noteInfo) {
        if (AppState.editor.accidentalMode) { AppState.editor.pressAndHold.mode = 'accidental'; return; }
        if (AppState.editor.convertMode) { AppState.editor.pressAndHold.mode = 'convert'; return; }

        if (p5.mouseButton === p5.RIGHT) {
            AppState.editor.pressAndHold.mode = 'resize';
        } else {
            AppState.editor.pressAndHold.mode = 'move';

            // Pattern sub-note check
            if (noteInfo.note.rhythm && noteInfo.note.rhythm !== 'note') {
                ensurePatternPitches(noteInfo.note, noteInfo.r);
                const relC = c - noteInfo.c;
                let subIdx = -1;
                if (noteInfo.note.rhythm === 'triplet') subIdx = Math.floor(relC * 3 / 4);
                else if (noteInfo.note.rhythm === 'anapest') subIdx = relC <= 1 ? relC : 2;
                else if (noteInfo.note.rhythm === 'dactyl') subIdx = relC < 2 ? 0 : (relC === 2 ? 1 : 2);
                
                subIdx = Math.max(0, Math.min(2, subIdx));
                if (r === noteInfo.note.customPitches[subIdx]) {
                    AppState.editor.pressAndHold.subNoteIndex = subIdx;
                }
            }
        }
    } else {
        AppState.editor.pressAndHold.mode = 'create';
    }
}

export function handleMouseDragged(p5) {
    if (AppState.editor.isPanning) {
        ui.canvasHolder.scrollLeft = AppState.editor.panStart.scrollL - (p5.mouseX - AppState.editor.panStart.x);
        ui.canvasHolder.scrollTop = AppState.editor.panStart.scrollT - (p5.mouseY - AppState.editor.panStart.y);
        return;
    }
    if (!AppState.editor.pressAndHold) return;

    if (!AppState.editor.isDragging && p5.dist(p5.mouseX, p5.mouseY, AppState.editor.pressAndHold.startX, AppState.editor.pressAndHold.startY) > DRAG_THRESHOLD) {
        AppState.editor.isDragging = true;
    }
    if (!AppState.editor.isDragging) return;

    let c = p5.floor((p5.mouseX - MARGIN_LEFT) / (CELL_WIDTH / STEPS_PER_GRID_CELL));
    let r = p5.floor((p5.mouseY - PADDING_TOP) / CELL_HEIGHT);
    c = p5.max(0, p5.min(AppState.cols - 1, c));
    r = p5.max(0, p5.min(AppState.rows - 1, r));

    const { mode, startR, startC, snappedC, cell } = AppState.editor.pressAndHold;

    if (mode === 'resize' || mode === 'create') {
        let newLen = c - (mode === 'resize' ? startC : snappedC) + 1;
        if (AppState.editor.snapToGrid) newLen = p5.max(AppState.editor.snapResolution, Math.round(newLen / AppState.editor.snapResolution) * AppState.editor.snapResolution);
        newLen = p5.min(16, newLen);
        
        if (mode === 'create' && !AppState.editor.pressAndHold.tempNote) {
             AppState.grid[startR][snappedC] = { id: AppState.editor.selectedInst, len: newLen, rhythm: 'note' };
             AppState.editor.pressAndHold.tempNote = { r: startR, c: snappedC };
        }
        const targetC = mode === 'resize' ? startC : snappedC;
        AppState.grid[startR][targetC].len = newLen;
        AppState.editor.currentDragLength = newLen;
        updateNoteLookup();
    }

    if (mode === 'select') {
        AppState.editor.selectionEnd = { r, c };
    }

    if (mode === 'move') {
        const { startR, startC, cell, subNoteIndex } = AppState.editor.pressAndHold;
        if (subNoteIndex !== undefined) {
            if (cell.customPitches[subNoteIndex] !== r) {
                cell.customPitches[subNoteIndex] = r;
                updateNoteLookup();
            }
        }

        let targetR = subNoteIndex !== undefined ? startR : r;
        let targetC = AppState.editor.snapToGrid ? Math.round(c / AppState.editor.snapResolution) * AppState.editor.snapResolution : c;
        
        if (targetR !== startR || targetC !== startC) {
            if (!AppState.grid[targetR][targetC]) {
                const acc = AppState.accidentals[startR][startC];
                if (subNoteIndex === undefined && targetR !== startR && cell.customPitches) {
                    const diff = targetR - startR;
                    cell.customPitches = cell.customPitches.map(p => Math.max(0, Math.min(AppState.rows - 1, p + diff)));
                }
                AppState.grid[targetR][targetC] = cell;
                AppState.accidentals[targetR][targetC] = acc;
                AppState.grid[startR][startC] = null;
                AppState.accidentals[startR][startC] = null;
                AppState.editor.pressAndHold.startR = targetR;
                AppState.editor.pressAndHold.startC = targetC;
                updateNoteLookup();
            }
        }
    }
}

export function handleMouseReleased(callbacks) {
    if (AppState.editor.isPanning) { AppState.editor.isPanning = false; return; }
    if (!AppState.editor.pressAndHold) return;
    const { saveState, recalculateLastActiveStep } = callbacks;

    if (!AppState.editor.isDragging) {
        const { mode, startR, startC, snappedC, cell } = AppState.editor.pressAndHold;
        if (mode === 'create') placeNote(startR, snappedC, callbacks);
        else if (mode === 'move') { AppState.grid[startR][startC] = null; recalculateLastActiveStep(); }
        else if (mode === 'accidental' && cell) {
            const current = AppState.accidentals[startR][startC] || 0;
            const isSharpValid = !isAccidentalRedundant(startR, 1);
            const isFlatValid = !isAccidentalRedundant(startR, -1);
            let nextState = current;
            if (current === 0) nextState = isSharpValid ? 1 : (isFlatValid ? -1 : 0);
            else if (current === 1) nextState = isFlatValid ? -1 : 0;
            else if (current === -1) nextState = 0;
            AppState.accidentals[startR][startC] = nextState === 0 ? null : nextState;
        } else if (mode === 'convert' && cell) {
            const isAlreadySelected = AppState.editor.selectedNotes.some(n => n.r === startR && n.c === startC);
            if (isAlreadySelected) {
                AppState.editor.selectedNotes = AppState.editor.selectedNotes.filter(n => !(n.r === startR && n.c === startC));
            } else {
                AppState.editor.selectedNotes.push({ r: startR, c: startC, cell: JSON.parse(JSON.stringify(cell)) });
                if (AppState.editor.selectedNotes.length === 3) {
                    const co = document.getElementById('convert-options');
                    if (co) co.style.display = 'flex';
                }
            }
        }
        updateNoteLookup();
        saveState();
    }
    AppState.editor.pressAndHold = null;
    AppState.editor.isDragging = false;
    AppState.editor.currentDragLength = null;
}

export function handleKeyPressed(e, p5, callbacks) {
    if (document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'INPUT') return;
    const { 
        togglePlay, toggleRecord, undo, redo, findLastActiveStep, copySelection, cutSelection, pasteSelection, deleteSelection,
        selectLayer, cycleScale, transpose, modifyRows, addChunk, removeChunk, toggleHelp
    } = callbacks;
    const { 
        toggleSelectionMode, toggleAccidentalMode, toggleConvertMode, toggleSnapToGrid, setNoteDuration, setSnapResolution, setRhythm, toggleGlobalOverride, toggleRemapOverlay
    } = window;

    if (p5.key === ' ') { e.preventDefault(); togglePlay(findLastActiveStep); }
    if (p5.key === 'r' && !p5.keyIsDown(p5.SHIFT) && !p5.keyIsDown(p5.CONTROL) && !p5.keyIsDown(p5.ALT)) toggleRecord();
    if (p5.key === 'z' && p5.keyIsDown(p5.CONTROL)) undo();
    if (p5.key === 'y' && p5.keyIsDown(p5.CONTROL)) redo();
    if (p5.key === 'c' && p5.keyIsDown(p5.CONTROL)) copySelection(p5);
    if (p5.key === 'x' && p5.keyIsDown(p5.CONTROL)) cutSelection(p5, callbacks);
    if (p5.key === 'v' && p5.keyIsDown(p5.CONTROL)) pasteSelection(p5, callbacks);
    if (p5.key === 'Delete' || p5.key === 'Backspace') deleteSelection(p5, callbacks);
    
    if (p5.keyCode === p5.UP_ARROW) { e.preventDefault(); p5.keyIsDown(p5.SHIFT) ? cycleScale(1) : transpose(1); }
    if (p5.keyCode === p5.DOWN_ARROW) { e.preventDefault(); p5.keyIsDown(p5.SHIFT) ? cycleScale(-1) : transpose(-1); }
    if (p5.keyCode === p5.RIGHT_ARROW && p5.keyIsDown(p5.SHIFT)) addChunk();
    if (p5.keyCode === p5.LEFT_ARROW && p5.keyIsDown(p5.SHIFT)) removeChunk();

    if (p5.key === 'f' && !p5.keyIsDown(p5.CONTROL) && !p5.keyIsDown(p5.ALT)) { e.preventDefault(); ui.presetSelect?.focus(); }
    if ((p5.key === '?' || p5.key === '/') && !p5.keyIsDown(p5.CONTROL) && !p5.keyIsDown(p5.ALT)) { e.preventDefault(); toggleHelp(); }
    if (p5.key === 's' && !p5.keyIsDown(p5.CONTROL) && !p5.keyIsDown(p5.ALT)) { e.preventDefault(); toggleSelectionMode(); }
    if (p5.key === 'a' && p5.keyIsDown(p5.ALT)) { e.preventDefault(); toggleAccidentalMode(); }
    if (p5.key === 'c' && p5.keyIsDown(p5.ALT)) { e.preventDefault(); toggleConvertMode(); }
    if (p5.key === 'm' && p5.keyIsDown(p5.ALT)) { e.preventDefault(); toggleRemapOverlay(); }
    if (p5.key === 'g' && p5.keyIsDown(p5.ALT)) { e.preventDefault(); toggleGlobalOverride(); }

    // Note Durations (Numeric Keys 1-5)
    if (!p5.keyIsDown(p5.SHIFT) && !p5.keyIsDown(p5.CONTROL) && !p5.keyIsDown(p5.ALT)) {
        if (p5.key === '1') { e.preventDefault(); setNoteDuration(1); if(ui.durationSelect) ui.durationSelect.value = "1"; }
        if (p5.key === '2') { e.preventDefault(); setNoteDuration(2); if(ui.durationSelect) ui.durationSelect.value = "2"; }
        if (p5.key === '3') { e.preventDefault(); setNoteDuration(4); if(ui.durationSelect) ui.durationSelect.value = "4"; }
        if (p5.key === '4') { e.preventDefault(); setNoteDuration(8); if(ui.durationSelect) ui.durationSelect.value = "8"; }
        if (p5.key === '5') { e.preventDefault(); setNoteDuration(16); if(ui.durationSelect) ui.durationSelect.value = "16"; }

        // Snap Resolutions (Numeric Keys 6-8)
        if (p5.key === '6') { e.preventDefault(); setSnapResolution(1); if(ui.snapSelect) ui.snapSelect.value = "1"; }
        if (p5.key === '7') { e.preventDefault(); setSnapResolution(2); if(ui.snapSelect) ui.snapSelect.value = "2"; }
        if (p5.key === '8') { e.preventDefault(); setSnapResolution(4); if(ui.snapSelect) ui.snapSelect.value = "4"; }
    }

    // Rhythm Patterns
    if (p5.key === 'Q' && p5.keyIsDown(p5.SHIFT)) { setRhythm('note'); if(ui.rhythmSelect) ui.rhythmSelect.value = "note"; }
    if (p5.key === 'W' && p5.keyIsDown(p5.SHIFT)) { setRhythm('triplet'); if(ui.rhythmSelect) ui.rhythmSelect.value = "triplet"; }
    if (p5.key === 'E' && p5.keyIsDown(p5.SHIFT)) { setRhythm('anapest'); if(ui.rhythmSelect) ui.rhythmSelect.value = "anapest"; }
    if (p5.key === 'R' && p5.keyIsDown(p5.SHIFT)) { setRhythm('dactyl'); if(ui.rhythmSelect) ui.rhythmSelect.value = "dactyl"; }

    // Instrument Selection (Shift + 1-9, 0, -, =)
    if (p5.keyIsDown(p5.SHIFT)) {
        const keys = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+'];
        const idx = keys.indexOf(p5.key);
        if (idx !== -1 && AppState.layers[idx]) selectLayer(AppState.layers[idx].id);
    }
}

export function getSelectionBounds(p5) {
    if (!AppState.editor.selectionStart || !AppState.editor.selectionEnd) return null;
    return {
        r1: p5.min(AppState.editor.selectionStart.r, AppState.editor.selectionEnd.r),
        r2: p5.max(AppState.editor.selectionStart.r, AppState.editor.selectionEnd.r),
        c1: p5.min(AppState.editor.selectionStart.c, AppState.editor.selectionEnd.c),
        c2: p5.max(AppState.editor.selectionStart.c, AppState.editor.selectionEnd.c)
    };
}

export function copySelection(p5) {
    const b = getSelectionBounds(p5);
    if (!b) return;
    AppState.editor.clipboard = [];
    for (let r = b.r1; r <= b.r2; r++) {
        for (let c = b.c1; c <= b.c2; c++) {
            AppState.editor.clipboard.push({
                rOffset: r - b.r1,
                cOffset: c - b.c1,
                cell: AppState.grid[r][c] ? JSON.parse(JSON.stringify(AppState.grid[r][c])) : null,
                accidental: AppState.accidentals[r][c]
            });
        }
    }
}

export function cutSelection(p5, callbacks) {
    copySelection(p5);
    deleteSelection(p5, callbacks);
}

export function pasteSelection(p5, callbacks) {
    if (!AppState.editor.clipboard) return;
    const { saveState } = callbacks;

    let originR, originC;
    let c = p5.floor((p5.mouseX - MARGIN_LEFT) / (CELL_WIDTH / STEPS_PER_GRID_CELL));
    let r = p5.floor((p5.mouseY - PADDING_TOP) / CELL_HEIGHT);

    if (c >= 0 && c < AppState.cols && r >= 0 && r < AppState.rows) {
        originR = r; originC = c;
    } else if (AppState.editor.selectionStart) {
        originR = AppState.editor.selectionStart.r; originC = AppState.editor.selectionStart.c;
    } else return;

    for (let item of AppState.editor.clipboard) {
        let targetR = originR + item.rOffset;
        let targetC = originC + item.cOffset;
        if (targetR >= 0 && targetR < AppState.rows && targetC >= 0 && targetC < AppState.cols) {
            AppState.grid[targetR][targetC] = item.cell ? JSON.parse(JSON.stringify(item.cell)) : null;
            AppState.accidentals[targetR][targetC] = item.accidental;
        }
    }
    saveState();
}

export function deleteSelection(p5, callbacks) {
    const { saveState } = callbacks;
    const b = getSelectionBounds(p5);
    if (!b) return;
    for (let r = b.r1; r <= b.r2; r++) {
        for (let c = b.c1; c <= b.c2; c++) {
            AppState.grid[r][c] = null;
            AppState.accidentals[r][c] = null;
        }
    }
    saveState();
}
