import { AppState, STEPS_PER_GRID_CELL } from './state.js';
import { getPlaybackId } from './audio.js';
import { ui, showLoading, hideLoading } from './ui.js';

/**
 * Encodes an AudioBuffer into an MP3 Blob using lamejs.
 * @param {AudioBuffer} audioBuffer 
 * @param {number} kbps - MP3 bitrate in kbps (default 128)
 * @returns {Blob} MP3 Blob
 */
export function audioBufferToMp3(audioBuffer, kbps = 128) {
    const lame = typeof window !== 'undefined' ? (window.lamejs || globalThis.lamejs) : globalThis.lamejs;
    if (!lame || !lame.Mp3Encoder) {
        throw new Error("lamejs MP3 encoder is not loaded.");
    }

    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const encoder = new lame.Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data = [];

    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : left;

    const sampleBlockSize = 1152;
    const leftInt16 = new Int16Array(sampleBlockSize);
    const rightInt16 = new Int16Array(sampleBlockSize);

    for (let i = 0; i < left.length; i += sampleBlockSize) {
        const blockSize = Math.min(sampleBlockSize, left.length - i);

        for (let j = 0; j < blockSize; j++) {
            const l = Math.max(-1, Math.min(1, left[i + j]));
            const r = Math.max(-1, Math.min(1, right[i + j]));
            leftInt16[j] = l < 0 ? l * 32768 : l * 32767;
            rightInt16[j] = r < 0 ? r * 32768 : r * 32767;
        }

        const lChunk = blockSize === sampleBlockSize ? leftInt16 : leftInt16.subarray(0, blockSize);
        const rChunk = blockSize === sampleBlockSize ? rightInt16 : rightInt16.subarray(0, blockSize);

        const mp3buf = channels === 1 ? encoder.encodeBuffer(lChunk) : encoder.encodeBuffer(lChunk, rChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    const flushBuf = encoder.flush();
    if (flushBuf.length > 0) {
        mp3Data.push(flushBuf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
}

/**
 * Decodes an Audio Blob (e.g. from MediaRecorder / Tone.Recorder) into an AudioBuffer.
 * @param {Blob} blob 
 * @param {AudioContext} [context]
 * @returns {Promise<AudioBuffer>}
 */
export async function blobToAudioBuffer(blob, context = null) {
    const ctx = context || (typeof Tone !== 'undefined' ? Tone.context.rawContext : new AudioContext());
    const arrayBuffer = await blob.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
}

/**
 * Triggers browser download for a Blob, using Web Share API on mobile if available.
 * @param {Blob} blob 
 * @param {string} filename 
 */
export async function downloadBlob(blob, filename) {
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
    if (isMobile && typeof navigator.share === 'function' && typeof File !== 'undefined') {
        try {
            const file = new File([blob], filename, { type: blob.type || 'audio/mp3' });
            if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: filename
                });
                return;
            }
        } catch (err) {
            // User cancelled share dialog
            if (err.name === 'AbortError') return;
            console.warn("Mobile share failed, falling back to download link:", err);
        }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1500);
}

/**
 * Schedules a single note on an OfflineAudioContext.
 */
function scheduleOfflineNote(offlineCtx, synths, playId, note, startTime, duration, targetNode) {
    const synthObj = synths[playId];
    if (!synthObj) return;

    // 1. Soundfont instrument with buffers
    if (synthObj.player && synthObj.player.buffers) {
        let midi = null;
        try {
            midi = Tone.Frequency(note).toMidi();
        } catch (e) {
            // ignore
        }

        const buffer = (midi !== null && synthObj.player.buffers[midi])
            || (midi !== null && synthObj.player.buffers[String(midi)])
            || synthObj.player.buffers[note];

        if (buffer) {
            const src = offlineCtx.createBufferSource();
            src.buffer = buffer;

            // Envelope gain to avoid clicks
            const env = offlineCtx.createGain();
            env.gain.setValueAtTime(1.0, startTime);
            env.gain.setValueAtTime(1.0, startTime + duration);
            env.gain.exponentialRampToValueAtTime(0.001, startTime + duration + 0.3);

            src.connect(env);
            env.connect(targetNode);
            src.start(startTime);
            src.stop(startTime + duration + 0.4);
            return;
        }
    }

    // 2. Synthetic fallback (e.g. piano_pad or synth)
    try {
        const midi = Tone.Frequency(note).toMidi();
        const freq = Tone.Frequency(note).toFrequency();

        const osc = offlineCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        const filter = offlineCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, startTime);

        const env = offlineCtx.createGain();
        env.gain.setValueAtTime(0.001, startTime);
        env.gain.exponentialRampToValueAtTime(0.4, startTime + 0.05);
        env.gain.exponentialRampToValueAtTime(0.2, startTime + 0.25);
        env.gain.setValueAtTime(0.2, startTime + duration);
        env.gain.exponentialRampToValueAtTime(0.001, startTime + duration + 0.5);

        osc.connect(filter);
        filter.connect(env);
        env.connect(targetNode);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.6);
    } catch (e) {
        // Ignore note render failure
    }
}

/**
 * Renders the composition offline and returns the AudioBuffer.
 * @param {object} callbacks 
 * @param {object} synths 
 * @returns {Promise<AudioBuffer>}
 */
export async function renderOfflineAudio(callbacks, synths) {
    const findLast = callbacks.findLastActiveStep || (() => AppState.cols);
    const lastStep = findLast();
    const totalSteps = AppState.playback.loopActive ? AppState.playback.loopEnd : (lastStep > 0 ? Math.ceil(lastStep / 16) * 16 : 32);

    const bpm = Tone.Transport.bpm.value || 120;
    const secondsPerStep = (60 / bpm) / 4; // 16th note step
    const tailSeconds = 0.8;
    const totalDuration = totalSteps * secondsPerStep + tailSeconds;

    const sampleRate = 44100;
    const OfflineCtxClass = (typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext))
        || (typeof globalThis !== 'undefined' && (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext));
    const offlineCtx = new OfflineCtxClass(2, Math.ceil(sampleRate * totalDuration), sampleRate);

    // Master Volume Gain
    const masterGainNode = offlineCtx.createGain();
    const volDb = ui.volumeSlider ? parseFloat(ui.volumeSlider.value) : -5;
    masterGainNode.gain.value = Math.pow(10, volDb / 20);
    masterGainNode.connect(offlineCtx.destination);

    // Layer Gain nodes
    const layerGainNodes = {};
    for (const l of AppState.layers) {
        const g = offlineCtx.createGain();
        const initVol = l.volume !== undefined ? l.volume : 0.8;
        g.gain.value = initVol;
        g.connect(masterGainNode);
        layerGainNodes[l.id] = g;
    }

    const anySolo = AppState.rowSolos.some(s => s);
    const gridToUse = (AppState.quiz && AppState.quiz.active && AppState.quiz.playTarget) ? AppState.quiz.targetGrid : AppState.grid;
    const accidentalsToUse = (AppState.quiz && AppState.quiz.active && AppState.quiz.playTarget) ? AppState.quiz.targetAccidentals : AppState.accidentals;

    for (let next = 0; next < totalSteps; next++) {
        for (let r = 0; r < AppState.rows; r++) {
            if (anySolo ? !AppState.rowSolos[r] : AppState.rowMutes[r]) continue;
            const cell = gridToUse[r] && gridToUse[r][next];
            if (cell) {
                const playId = getPlaybackId(cell.id);
                const baseNote = AppState.scale.current[r];
                const accidental = accidentalsToUse[r] && accidentalsToUse[r][next];
                const note = accidental ? Tone.Frequency(baseNote).transpose(accidental).toNote() : baseNote;

                const startTime = next * secondsPerStep;
                const duration = cell.len * secondsPerStep;
                const targetNode = layerGainNodes[cell.id] || masterGainNode;

                scheduleOfflineNote(offlineCtx, synths, playId, note, startTime, duration, targetNode);
            }
        }
    }

    return await offlineCtx.startRendering();
}

/**
 * One-click Offline Export to MP3: renders composition in background, encodes to MP3, and triggers download.
 * @param {object} callbacks 
 * @param {object} synths 
 */
export async function exportProjectMP3(callbacks, synths) {
    if (typeof showLoading === 'function') showLoading("Rendering MP3...");
    try {
        const audioBuffer = await renderOfflineAudio(callbacks, synths);
        if (typeof showLoading === 'function') showLoading("Encoding MP3...");
        await new Promise(resolve => setTimeout(resolve, 30));
        const mp3Blob = audioBufferToMp3(audioBuffer);

        const tuneName = (ui.presetSelect && ui.presetSelect.value && ui.presetSelect.selectedIndex > 0)
            ? ui.presetSelect.value.replace(/[^a-zA-Z0-9_-]/g, '_')
            : 'solfeger-tune';
        await downloadBlob(mp3Blob, `${tuneName}.mp3`);
    } catch (err) {
        console.error("Failed to export MP3:", err);
        alert("Failed to export MP3: " + err.message);
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}
