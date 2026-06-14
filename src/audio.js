import { AppState, USE_LOCAL_SOUNDFONTS } from './state.js';
import { ui, updatePlayButtonState } from './ui.js';

export let synths = {};
export let recorder = new Tone.Recorder();
export let masterGain;
export let masterReverb;
export let instrumentsLoadingCount = 0;

export function initAudio() {
    masterGain = new Tone.Gain(-5, "decibels").toDestination();
    masterGain.connect(recorder);
    masterReverb = new Tone.Reverb({ decay: 3, wet: 0 }).connect(masterGain);
    Tone.Transport.swingSubdivision = "16n";
}

export function setLayerVolume(id, volume) {
    if (synths[id] && synths[id].gainNode) {
        synths[id].gainNode.gain.rampTo(volume, 0.1);
    }
}

export function getPlaybackId(id) {
    if (AppState.settings.globalOverrideActive) return parseInt(AppState.settings.globalOverrideInst);
    return AppState.settings.instrumentMapping[id] || id;
}

export function disposeAllSynths() {
    for (let key in synths) {
        if (synths[key] && typeof synths[key].dispose === 'function') {
            synths[key].dispose();
        }
        delete synths[key];
    }
}

export async function loadInstrument(id, patchName, updateName = true, onComplete = null) {
    instrumentsLoadingCount++;
    updatePlayButtonState(instrumentsLoadingCount);

    if (synths[id] && typeof synths[id].dispose === 'function') {
        synths[id].dispose();
    }

    try {
        const layer = AppState.layers.find(l => l.id === id);
        const initialVol = layer ? (layer.volume !== undefined ? layer.volume : 0.8) : 0.8;
        const gainNode = new Tone.Gain(initialVol).connect(masterReverb);

        if (patchName === 'piano_pad') {
            const filter = new Tone.Filter(1500, "lowpass").connect(gainNode);
            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle" },
                envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 2 }
            }).connect(filter);
            
            synths[id] = {
                gainNode: gainNode,
                triggerAttackRelease: (note, duration, time) => synth.triggerAttackRelease(note, duration, time),
                dispose: () => {
                    synth.dispose();
                    filter.dispose();
                    gainNode.dispose();
                }
            };
            if (onComplete) onComplete(id, patchName, updateName);
            return;
        }

        const options = {
            destination: gainNode.input,
            format: 'mp3'
        };
        if (USE_LOCAL_SOUNDFONTS) {
            options.nameToUrl = (name, sf, fmt) => `soundfonts/${name}-${fmt}.js`;
        }

        const player = await Soundfont.instrument(Tone.context.rawContext, patchName, options);
        synths[id] = {
            gainNode: gainNode,
            triggerAttackRelease: (note, duration, time) => {
                if (Array.isArray(note)) note.forEach(n => player.play(n, time, { duration: Tone.Time(duration).toSeconds() }));
                else player.play(note, time, { duration: Tone.Time(duration).toSeconds() });
            },
            dispose: () => { 
                // We don't dispose the player itself as soundfont-player handles it,
                // but we dispose our gain node.
                gainNode.dispose();
            }
        };
        if (onComplete) onComplete(id, patchName, updateName);
    } catch (e) {
        console.error(`Failed to load patch ${patchName}`, e);
    } finally {
        instrumentsLoadingCount--;
        updatePlayButtonState(instrumentsLoadingCount);
    }
}

export async function togglePlay(findLastActiveStep) {
    if (instrumentsLoadingCount > 0) return;
    await Tone.start();
    if (Tone.Transport.state !== 'started') {
        if (!ui.loopActive.checked) {
            const lastStep = findLastActiveStep();
            let loopEnd = 32;
            if (lastStep > 0) loopEnd = Math.ceil(lastStep / 16) * 16;
            AppState.playback.isSmartLooping = true;
            AppState.playback.smartLoopEnd = loopEnd;
        }
        Tone.Transport.start();
        ui.playBtn.innerText = "⏸ Pause";
    } else {
        Tone.Transport.stop();
        AppState.playback.currentStep = -1;
        AppState.playback.isSmartLooping = false;
        AppState.playback.smartLoopEnd = 0;
        ui.playBtn.innerText = "▶ Play";
    }
}

export async function toggleRecord() {
    if (recorder.state === "stopped") {
        recorder.start(); 
        ui.recBtn.innerText = "Stop Rec"; 
        ui.recBtn.classList.add('recording');
    } else {
        const recording = await recorder.stop();
        const a = document.createElement("a"); 
        a.download = "track.webm"; 
        a.href = URL.createObjectURL(recording); 
        a.click();
        ui.recBtn.innerText = "⏺ Record"; 
        ui.recBtn.classList.remove('recording');
    }
}

export function updateBPM(val) {
    Tone.Transport.bpm.value = val;
    ui.bpmSlider.value = val;
    if (ui.bpmInput) ui.bpmInput.value = val;
}
