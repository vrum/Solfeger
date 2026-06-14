import { AppState, DEFAULT_ROOT, DEFAULT_SCALE, STEPS_PER_GRID_CELL } from './state.js';
import { updateNoteLookup } from './gridLogic.js';
import { showMessage, showConfirm } from './ui.js';

export async function startQuiz(isAutoLoaded = false) {
    const hasNotes = AppState.grid.some(row => row.some(cell => cell));
    if (!hasNotes && !isAutoLoaded) {
        showMessage("The grid is empty! Place some notes first to set a target for the quiz.");
        return;
    }
    
    // Save current as target
    AppState.quiz.active = true;
    AppState.quiz.targetGrid = JSON.parse(JSON.stringify(AppState.grid));
    AppState.quiz.targetAccidentals = JSON.parse(JSON.stringify(AppState.accidentals));
    AppState.quiz.feedback = Array(AppState.rows).fill().map(() => Array(AppState.cols).fill(null));
    AppState.quiz.playTarget = true;
    
    // Clear the main grid for the user to start transcribing
    for (let r = 0; r < AppState.rows; r++) {
        for (let c = 0; c < AppState.cols; c++) {
            AppState.grid[r][c] = null;
            AppState.accidentals[r][c] = null;
        }
    }
    
    // Reset playback position so they hear from the beginning
    AppState.playback.currentStep = -1;
    
    updateNoteLookup();
    updateQuizUI();
}


export function generateRandomExercise(callbacks) {
    const { initGridState, saveState } = callbacks;
    initGridState();
    
    // Simple C Major melody generator
    // Find center DO (root)
    let centerRow = -1;
    for (let r = 0; r < AppState.rows; r++) {
        if (AppState.scale.solfege[r] === "DO" && Tone.Frequency(AppState.scale.current[r]).toNote().includes("4")) {
            centerRow = r; break;
        }
    }
    if (centerRow === -1) centerRow = Math.floor(AppState.rows / 2);

    const scaleIndices = [0, 1, 2, 3, 4, 5, 6]; // Major scale degrees
    let currentStep = 0;
    const totalSteps = 16; // 1 measure for a simple exercise

    while (currentStep < totalSteps) {
        const duration = [4, 4, 8][Math.floor(Math.random() * 3)]; // Quarter or Half notes
        if (currentStep + duration > totalSteps) break;

        // Pick a random row near centerRow that is in scale
        let offset = Math.floor(Math.random() * 7) - 3;
        let targetR = centerRow + offset;
        targetR = Math.max(0, Math.min(AppState.rows - 1, targetR));

        AppState.grid[targetR][currentStep] = { id: AppState.editor.selectedInst, len: duration };
        currentStep += duration;
    }

    updateNoteLookup();
    if (saveState) saveState();
    startQuiz(true);
}

export function endQuiz() {
    showConfirm("End quiz and restore original melody?", () => {
        AppState.grid = JSON.parse(JSON.stringify(AppState.quiz.targetGrid));
        AppState.accidentals = JSON.parse(JSON.stringify(AppState.quiz.targetAccidentals));
        AppState.quiz.active = false;
        AppState.quiz.feedback = [];
        AppState.quiz.playTarget = false;
        updateNoteLookup();
        updateQuizUI();
        if (window.updateSmartLoopEnd) window.updateSmartLoopEnd();
    });
}

export function togglePlayTarget() {
    AppState.quiz.playTarget = !AppState.quiz.playTarget;
    if (window.updateSmartLoopEnd) window.updateSmartLoopEnd();
    updateQuizUI();
}

export function checkQuizAnswers() {
    AppState.quiz.feedback = Array(AppState.rows).fill().map(() => Array(AppState.cols).fill(null));
    
    let correctCount = 0;
    let totalTargetNotes = 0;
    
    // We'll use a set of strings "r,c" to track which target notes were found
    const targetNotes = [];
    for (let r = 0; r < AppState.rows; r++) {
        for (let c = 0; c < AppState.cols; c++) {
            if (AppState.quiz.targetGrid[r][c]) {
                targetNotes.push({ r, c, note: AppState.quiz.targetGrid[r][c], acc: AppState.quiz.targetAccidentals[r][c] });
                totalTargetNotes++;
            }
        }
    }

    for (let target of targetNotes) {
        const user = AppState.grid[target.r][target.c];
        const userAcc = AppState.accidentals[target.r][target.c];
        
        if (user) {
            if (user.len === target.note.len && userAcc === target.acc) {
                AppState.quiz.feedback[target.r][target.c] = 'correct';
                correctCount++;
            } else {
                AppState.quiz.feedback[target.r][target.c] = 'incorrect';
            }
        } else {
            AppState.quiz.feedback[target.r][target.c] = 'missing';
        }
    }

    // Mark extra notes (notes that aren't where a target note should be)
    for (let r = 0; r < AppState.rows; r++) {
        for (let c = 0; c < AppState.cols; c++) {
            if (AppState.grid[r][c] && !AppState.quiz.feedback[r][c]) {
                AppState.quiz.feedback[r][c] = 'extra';
            }
        }
    }

    const accuracy = Math.round((correctCount / totalTargetNotes) * 100);
    showMessage(`Quiz Result: ${correctCount}/${totalTargetNotes} correct notes (${accuracy}% accuracy).`, "Quiz Results");
}

export function initQuizTunes() {
    fetch('presets/quiz-tunes.json')
        .then(res => res.ok ? res.json() : [])
        .then(builtIns => {
            const userQuizTunes = JSON.parse(localStorage.getItem('solfeger_user_quiz_tunes') || '{}');
            const archived = JSON.parse(localStorage.getItem('solfeger_archived_quiz_tunes') || '[]');
            
            const select = document.getElementById('quiz-tune-select');
            if (!select) return;
            while (select.options.length > 1) select.remove(1);
            
            // Built-in Quiz Tunes
            builtIns.sort().forEach(name => {
                if (archived.includes(name)) return;
                let opt = document.createElement('option');
                opt.value = name;
                opt.innerText = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                select.appendChild(opt);
            });

            // User Quiz Tunes
            Object.keys(userQuizTunes).sort().forEach(name => {
                if (archived.includes(name)) return;
                let opt = document.createElement('option');
                opt.value = "user:" + name;
                opt.innerText = "👤 " + name;
                select.appendChild(opt);
            });
        });
}

export async function loadQuizTune(name) {
    if (!name) return;
    let data;
    if (name.startsWith("user:")) {
        const userName = name.substring(5);
        const userQuizTunes = JSON.parse(localStorage.getItem('solfeger_user_quiz_tunes') || '{}');
        const entry = userQuizTunes[userName];
        if (!entry) return;
        // Backward compatibility: handle both raw data and {timestamp, data} objects
        data = entry.data || entry;
        if (data && window.restoreState) {
            await window.restoreState(data);
            await startQuiz(true);
        }
    } else {
        // Built-in
        try {
            const res = await fetch(`presets/${name}.json`);
            if (!res.ok) throw new Error("Built-in tune not found");
            const entry = await res.json();
            data = entry.data || entry;
            if (window.restoreState) {
                await window.restoreState(data);
                await startQuiz(true);
            }
        } catch (e) {
            console.error("Failed to load quiz tune", e);
        }
    }
}

export function updateQuizUI() {
    const startBtn = document.getElementById('quiz-start-btn');
    const randomBtn = document.getElementById('quiz-random-btn');
    const playTargetBtn = document.getElementById('quiz-play-target-btn');
    const checkBtn = document.getElementById('quiz-check-btn');
    const endBtn = document.getElementById('quiz-end-btn');

    // Destructive project tools to disable during quiz
    const loadingTools = [
        document.getElementById('new-project-btn'),
        document.getElementById('import-json-btn'),
        document.getElementById('import-hookpad-btn'),
        document.getElementById('preset-select'),
        document.getElementById('quiz-tune-select')
    ];

    if (!startBtn) return;

    if (AppState.quiz.active) {
        startBtn.disabled = true;
        if (randomBtn) randomBtn.disabled = true;
        playTargetBtn.disabled = false;
        checkBtn.disabled = false;
        endBtn.disabled = false;
        
        playTargetBtn.innerText = AppState.quiz.playTarget ? "👂 Hearing Target" : "🎹 Hearing My Input";
        playTargetBtn.classList.toggle('active', AppState.quiz.playTarget);
        
        loadingTools.forEach(el => { if (el) el.disabled = true; });
    } else {
        startBtn.disabled = false;
        if (randomBtn) randomBtn.disabled = false;
        playTargetBtn.disabled = true;
        checkBtn.disabled = true;
        endBtn.disabled = true;
        
        playTargetBtn.innerText = "👂 Play Target";
        playTargetBtn.classList.remove('active');
        
        loadingTools.forEach(el => { if (el) el.disabled = false; });
    }
}
