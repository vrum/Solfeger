import { INSTRUMENT_DEFAULTS, AppState } from './state.js';

export const ui = {};

export const tooltip = {
    el: null,
    visible: false,
    text: "",
    x: 0,
    y: 0,
    init() {
        this.el = document.createElement('div');
        this.el.id = 'custom-tooltip';
        this.el.style.cssText = `
            position: fixed;
            pointer-events: none;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            z-index: 10000;
            display: none;
            border: 1px solid #444;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            white-space: nowrap;
        `;
        document.body.appendChild(this.el);
    },
    show(text, x, y) {
        if (!this.el) this.init();
        this.el.innerText = text;
        this.el.style.display = 'block';
        this.el.style.left = (x + 15) + 'px';
        this.el.style.top = (y + 15) + 'px';
        this.visible = true;
    },
    hide() {
        if (this.el) this.el.style.display = 'none';
        this.visible = false;
    }
};

export function initPresets() {
    fetch('presets/presets.json')
        .then(response => response.json())
        .then(presets => {
            const userPresets = JSON.parse(localStorage.getItem('solfeger_user_presets') || '{}');
            const archived = JSON.parse(localStorage.getItem('solfeger_archived_presets') || '[]');
            
            const select = ui.presetSelect;
            if (!select) return;
            while (select.options.length > 1) select.remove(1);
            
            // Built-in Presets
            presets.sort().forEach(name => {
                if (archived.includes(name)) return;
                let opt = document.createElement('option');
                opt.value = name;
                opt.innerText = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                select.appendChild(opt);
            });

            // User Presets
            Object.keys(userPresets).sort().forEach(name => {
                if (archived.includes(name)) return;
                let opt = document.createElement('option');
                opt.value = "user:" + name;
                opt.innerText = "👤 " + name;
                select.appendChild(opt);
            });
        })
        .catch(err => console.warn("Could not load presets manifest.", err));
}

let archiveManagerType = 'preset'; // 'preset' or 'quiz'

export function toggleArchiveManager(type) {
    const overlay = document.getElementById('archive-overlay');
    if (!overlay) return;

    if (type) archiveManagerType = type;

    if (overlay.style.display === 'flex') {
        overlay.style.display = 'none';
    } else {
        overlay.style.display = 'flex';
        renderArchiveList();
    }
}

export function renderArchiveList() {
    const container = document.getElementById('archive-list');
    const title = document.getElementById('archive-title');
    const actions = document.getElementById('archive-actions');
    if (!container) return;
    container.innerHTML = '';

    const isQuiz = archiveManagerType === 'quiz';
    title.innerText = isQuiz ? "Quiz Tunes Manager" : "Preset Manager";
    if (actions) actions.style.display = isQuiz ? 'flex' : 'none';

    const archivedKey = isQuiz ? 'solfeger_archived_quiz_tunes' : 'solfeger_archived_presets';
    const userKey = isQuiz ? 'solfeger_user_quiz_tunes' : 'solfeger_user_presets';
    
    const archived = JSON.parse(localStorage.getItem(archivedKey) || '[]');
    const userItems = JSON.parse(localStorage.getItem(userKey) || '{}');
    
    fetch(isQuiz ? 'presets/quiz-tunes.json' : 'presets/presets.json')
        .then(res => res.ok ? res.json() : [])
        .then(builtIns => {
            const allBuiltInNames = builtIns || [];
            const allUserNames = Object.keys(userItems);

            // Render Built-ins
            allBuiltInNames.sort().forEach(name => {
                const isArchived = archived.includes(name);
                container.appendChild(createArchiveItem(name, false, isArchived, null));
            });

            // Render User items
            allUserNames.sort().forEach(name => {
                const isArchived = archived.includes(name);
                const item = userItems[name];
                const timestamp = item ? item.timestamp : null;
                container.appendChild(createArchiveItem(name, true, isArchived, timestamp));
            });
        });
}

function createArchiveItem(name, isUser, isArchived, timestamp) {
    const item = document.createElement('div');
    item.className = 'archive-item';
    
    const timeStr = timestamp ? new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    
    item.innerHTML = `
        <div class="name-info">
            <span class="name">${isUser ? '👤 ' : ''}${name}</span>
            ${timeStr ? `<span class="timestamp">${timeStr}</span>` : ''}
        </div>
        <div class="actions">
            ${isUser ? `<button onclick="renameUserItem('${name}')">✏️</button>` : ''}
            <button class="${isArchived ? 'restore-btn' : 'archive-btn'}" onclick="toggleArchiveStatus('${name}', ${isArchived})">
                ${isArchived ? 'Restore' : 'Archive'}
            </button>
            ${isUser ? `<button class="delete-btn" onclick="deleteUserItem('${name}')">🗑️</button>` : ''}
        </div>
    `;
    return item;
}

window.renameUserItem = (oldName) => {
    const isQuiz = archiveManagerType === 'quiz';
    const key = isQuiz ? 'solfeger_user_quiz_tunes' : 'solfeger_user_presets';
    
    const newName = prompt("Rename to:", oldName);
    if (!newName || newName === oldName) return;

    const items = JSON.parse(localStorage.getItem(key) || '{}');
    if (items[newName]) {
        showMessage("A tune with that name already exists.", "Error");
        return;
    }

    items[newName] = items[oldName];
    delete items[oldName];
    localStorage.setItem(key, JSON.stringify(items));

    // Update archived list if needed
    const archKey = isQuiz ? 'solfeger_archived_quiz_tunes' : 'solfeger_archived_presets';
    let archived = JSON.parse(localStorage.getItem(archKey) || '[]');
    if (archived.includes(oldName)) {
        archived = archived.map(n => n === oldName ? newName : n);
        localStorage.setItem(archKey, JSON.stringify(archived));
    }

    renderArchiveList();
    if (isQuiz) { if (window.initQuizTunes) window.initQuizTunes(); }
    else { initPresets(); }
};

window.deleteUserItem = (name) => {
    showConfirm(`Permanently delete "${name}"? This cannot be undone.`, () => {
        const isQuiz = archiveManagerType === 'quiz';
        const key = isQuiz ? 'solfeger_user_quiz_tunes' : 'solfeger_user_presets';
        const items = JSON.parse(localStorage.getItem(key) || '{}');
        delete items[name];
        localStorage.setItem(key, JSON.stringify(items));
        renderArchiveList();
        if (isQuiz) { if (window.initQuizTunes) window.initQuizTunes(); }
        else { initPresets(); }
    }, null, "Delete Confirmation");
};


// --- Custom Modal System ---

export function showMessage(msg, title = "Notification") {
    const overlay = document.getElementById('message-modal-overlay');
    const titleEl = document.getElementById('message-modal-title');
    const bodyEl = document.getElementById('message-modal-body');
    if (!overlay || !bodyEl) return;

    titleEl.innerText = title;
    bodyEl.innerHTML = msg.replace(/\n/g, '<br>');
    overlay.style.display = 'flex';
}

export function closeMessageModal() {
    const overlay = document.getElementById('message-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

export function showConfirm(msg, onConfirm, onCancel, title = "Are you sure?") {
    const overlay = document.getElementById('confirm-modal-overlay');
    const titleEl = document.getElementById('confirm-modal-title');
    const bodyEl = document.getElementById('confirm-modal-body');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    
    if (!overlay || !bodyEl || !okBtn || !cancelBtn) return;

    titleEl.innerText = title;
    bodyEl.innerHTML = msg.replace(/\n/g, '<br>');
    overlay.style.display = 'flex';

    const cleanup = () => {
        overlay.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
        cleanup();
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        cleanup();
        if (onCancel) onCancel();
    };
}

window.closeMessageModal = closeMessageModal;

// --- Save Quiz Modal Logic ---

export function openSaveQuizModal() {
    const overlay = document.getElementById('save-quiz-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    renderExistingQuizzes();
    document.getElementById('new-quiz-name').value = '';
    document.getElementById('new-quiz-name').focus();
}

export function closeSaveQuizModal() {
    const overlay = document.getElementById('save-quiz-overlay');
    if (overlay) overlay.style.display = 'none';
}

function renderExistingQuizzes() {
    const container = document.getElementById('existing-quizzes-list');
    if (!container) return;
    container.innerHTML = '';

    const userQuizTunes = JSON.parse(localStorage.getItem('solfeger_user_quiz_tunes') || '{}');
    const sortedNames = Object.keys(userQuizTunes).sort((a, b) => {
        const itemA = userQuizTunes[a];
        const itemB = userQuizTunes[b];
        const timeA = itemA ? (itemA.timestamp || 0) : 0;
        const itemB_ts = itemB ? (itemB.timestamp || 0) : 0;
        return itemB_ts - timeA;
    });

    if (sortedNames.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding: 20px;">No saved quiz tunes yet.</div>';
        return;
    }

    sortedNames.forEach(name => {
        const item = userQuizTunes[name];
        const timestamp = item ? (item.timestamp || 0) : 0;
        const dateStr = timestamp ? new Date(timestamp).toLocaleString() : 'Legacy Save';
        
        const el = document.createElement('div');
        el.className = 'list-item';
        el.innerHTML = `
            <div class="name-group">
                <div class="name">${name}</div>
                <div class="timestamp">Last saved: ${dateStr}</div>
            </div>
            <div class="actions">
                <button class="overwrite-btn" onclick="handleOverwriteTune('${name}')">Overwrite</button>
            </div>
        `;
        container.appendChild(el);
    });
}

window.handleOverwriteTune = (name) => {
    showConfirm(`Overwrite existing tune "${name}"?`, () => {
        if (window.saveAsQuizTune) window.saveAsQuizTune(name);
    });
};

window.saveNewQuizTune = () => {
    const name = document.getElementById('new-quiz-name').value.trim();
    if (!name) return;
    const userQuizTunes = JSON.parse(localStorage.getItem('solfeger_user_quiz_tunes') || '{}');
    if (userQuizTunes[name]) {
        showConfirm(`"${name}" already exists. Overwrite?`, () => {
            if (window.saveAsQuizTune) window.saveAsQuizTune(name);
        });
    } else {
        if (window.saveAsQuizTune) window.saveAsQuizTune(name);
    }
};

export function updatePlayButtonState(instrumentsLoadingCount) {
    if (!ui.playBtn) return;
    if (instrumentsLoadingCount > 0) {
        ui.playBtn.classList.add('loading');
        ui.playBtn.title = "Waiting for instruments to load...";
    } else {
        ui.playBtn.classList.remove('loading');
        ui.playBtn.title = "Play/Pause (Space)";
    }
}

export function showLoading(msg) {
    if (ui.loadingText) ui.loadingText.innerText = msg;
    if (ui.loadingOverlay) ui.loadingOverlay.style.display = 'flex';
}

export function hideLoading() {
    if (ui.loadingOverlay) ui.loadingOverlay.style.display = 'none';
    if (ui.loadingText) ui.loadingText.innerText = "Loading...";
}

export function toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('is-open');
}

export function toggleToolbarCollapse() {
    const toolbar = document.getElementById('toolbar');
    if (toolbar) toolbar.classList.toggle('is-expanded');
}

let selectLayerCallback = null;
let deleteLayerCallback = null;
let addLayerCallback = null;
let saveStateCallback = null;
let setLayerVolumeCallback = null;

export function setUICallbacks(callbacks) {
    selectLayerCallback = callbacks.selectLayer;
    deleteLayerCallback = callbacks.deleteLayer;
    addLayerCallback = callbacks.addLayer;
    saveStateCallback = callbacks.saveState;
    setLayerVolumeCallback = callbacks.setLayerVolume;
}

export function initPalette() {
    if (!ui.palette) return;
    ui.palette.innerHTML = '';
    
    AppState.layers.forEach(layer => {
        let container = document.createElement('div');
        container.className = 'palette-item-container' + (layer.id === AppState.editor.selectedInst ? ' active' : '');

        let btn = document.createElement('button');
        btn.className = 'inst-btn' + (layer.id === AppState.editor.selectedInst ? ' active' : '');
        btn.dataset.id = layer.id;
        
        let label = document.createElement('span');
        label.innerHTML = `<span class="inst-indicator" style="background:rgb(${layer.color})"></span>${layer.name}`;
        label.style.flex = "1";
        label.style.minWidth = "0";
        label.style.whiteSpace = "nowrap";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.textAlign = "left";
        label.title = "Double-click to rename";
        label.ondblclick = (e) => {
            e.stopPropagation();
            const newName = prompt("Enter new layer name:", layer.name);
            if (newName !== null) {
                layer.name = newName.trim() || layer.name;
                initPalette();
                if (saveStateCallback) saveStateCallback();
            }
        };
        btn.appendChild(label);
        
        let delBtn = document.createElement('button');
        delBtn.className = 'inst-delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = "Delete Layer";
        delBtn.onclick = (e) => {
            e.stopPropagation();
            showConfirm(`Are you sure you want to delete layer "${layer.name}"?`, () => {
                if (deleteLayerCallback) deleteLayerCallback(layer.id);
            });
        };
        
        btn.onclick = () => { if (selectLayerCallback) selectLayerCallback(layer.id); };
        btn.appendChild(delBtn);
        container.appendChild(btn);

        // Volume Slider
        let volGroup = document.createElement('div');
        volGroup.className = 'vol-group';
        let volIcon = document.createElement('span');
        volIcon.innerText = "🔈";
        
        let slider = document.createElement('input');
        slider.type = "range";
        slider.min = "0";
        slider.max = "1.5";
        slider.step = "0.05";
        slider.value = layer.volume !== undefined ? layer.volume : 0.8;
        slider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            layer.volume = val;
            if (setLayerVolumeCallback) setLayerVolumeCallback(layer.id, val);
        };
        slider.onchange = () => {
            if (saveStateCallback) saveStateCallback();
        };

        volGroup.appendChild(volIcon);
        volGroup.appendChild(slider);
        container.appendChild(volGroup);

        ui.palette.appendChild(container);
    });

    let addBtn = document.createElement('button');
    addBtn.className = 'add-layer-btn';
    addBtn.innerText = '+ Add Layer';
    addBtn.onclick = () => { if (addLayerCallback) addLayerCallback(); };
    ui.palette.appendChild(addBtn);

    if (ui.globalOverrideSelect) {
        ui.globalOverrideSelect.innerHTML = '';
        AppState.layers.forEach(layer => {
            let opt = document.createElement('option');
            opt.value = layer.id;
            opt.innerText = `${layer.id}: ${layer.name}`;
            ui.globalOverrideSelect.appendChild(opt);
        });
    }
}


export function initGMPatches(gmPatchList) {
    const sel = ui.instPatchSelect;
    if (!sel) return;
    sel.innerHTML = '';

    let def = document.createElement('option');
    def.value = "default";
    def.innerText = "(Default Synth)";
    sel.appendChild(def);

    gmPatchList.forEach(patch => {
        let opt = document.createElement('option');
        opt.value = patch;
        const defaultInst = Object.values(INSTRUMENT_DEFAULTS).find(i => i.patch === patch);
        opt.innerText = defaultInst ? defaultInst.name : patch.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        sel.appendChild(opt);
    });
}

export function toggleGlobalOverride() {
    const chk = document.getElementById('global-override-check');
    if(chk) {
        if (document.activeElement !== chk) chk.checked = !chk.checked;
        AppState.settings.globalOverrideActive = chk.checked;
    }
    const sel = document.getElementById('global-override-select');
    if (sel) sel.disabled = !AppState.settings.globalOverrideActive;
}

export function setGlobalOverrideInst(id) {
    AppState.settings.globalOverrideInst = parseInt(id);
}

export function toggleRemapOverlay() {
    const overlay = document.getElementById('remap-overlay');
    if(!overlay) return;
    if (overlay.style.display === 'flex') {
        overlay.style.display = 'none';
    } else {
        overlay.style.display = 'flex';
        renderRemapList();
    }
}

export function renderRemapList() {
    const container = document.getElementById('remap-list');
    if(!container) return;
    container.innerHTML = '';
    
    const instrumentIds = Object.keys(INSTRUMENT_DEFAULTS).map(Number).sort((a, b) => a - b);
    
    instrumentIds.forEach(id => {
        let row = document.createElement('div');
        row.className = 'remap-row';

        let label = document.createElement('label');
        label.innerHTML = `<span style="color:rgb(${INSTRUMENT_DEFAULTS[id].color})">●</span> ${id}: ${INSTRUMENT_DEFAULTS[id].name} &rarr;`;

        let select = document.createElement('select');
        select.style.width = '120px';
        instrumentIds.forEach(targetId => {
            let opt = document.createElement('option');
            opt.value = targetId;
            opt.innerText = `${targetId}: ${INSTRUMENT_DEFAULTS[targetId].name}`;
            if (AppState.settings.instrumentMapping[id] === targetId) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e) => AppState.settings.instrumentMapping[id] = parseInt(e.target.value);

        row.appendChild(label);
        row.appendChild(select);
        container.appendChild(row);
    });
}

export function randomizeMapping() { 
    Object.keys(INSTRUMENT_DEFAULTS).forEach(id => {
        AppState.settings.instrumentMapping[id] = Math.ceil(Math.random() * Object.keys(INSTRUMENT_DEFAULTS).length);
    });
    renderRemapList(); 
}

export function resetMapping() { 
    Object.keys(INSTRUMENT_DEFAULTS).forEach(id => {
        AppState.settings.instrumentMapping[id] = parseInt(id);
    });
    renderRemapList(); 
}

export function showWelcomeScreen() {
    console.log("Solfeger: showWelcomeScreen() called");
    const overlay = document.getElementById('welcome-modal-overlay');
    const closeBtn = document.getElementById('welcome-close-btn');
    
    if (!overlay || !closeBtn) {
        console.error("Solfeger: Welcome modal elements not found in DOM!");
        return;
    }

    // One-time Migration from Tyonarr to Solfeger namespace
    if (!localStorage.getItem('solfeger_migrated') && localStorage.getItem('tyonarr_state')) {
        console.log("Solfeger: Migrating legacy Tyonarr data...");
        const keys = ['state', 'user_presets', 'archived_presets', 'user_quiz_tunes', 'archived_quiz_tunes'];
        keys.forEach(k => {
            const oldVal = localStorage.getItem('tyonarr_' + k);
            if (oldVal) localStorage.setItem('solfeger_' + k, oldVal);
        });
        localStorage.setItem('solfeger_migrated', 'true');
    }

    if (localStorage.getItem('solfeger_welcomed')) {
        console.log("Solfeger: User already welcomed, skipping modal.");
        return;
    }

    console.log("Solfeger: Displaying welcome modal.");
    overlay.style.display = 'flex';
    
    closeBtn.onclick = async () => {
        console.log("Solfeger: Welcome screen dismissed, starting audio context.");
        await Tone.start();
        overlay.style.display = 'none';
        localStorage.setItem('solfeger_welcomed', 'true');
    };
}
