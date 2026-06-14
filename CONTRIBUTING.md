# Contributing to Solfeger Sequencer

Thank you for your interest in contributing to Solfeger! We welcome contributions from everyone, whether it's fixing a bug, adding a new feature, or improving documentation.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/vrum/solfeger.git
    cd solfeger
    ```
3.  **Run the application locally**. Because the app loads external resources (JSON presets, soundfonts), you must use a local web server to avoid CORS errors.
    *   **Python 3**: `python3 -m http.server`
    *   **Node.js**: `npx http-server`
    *   **VS Code**: Use the "Live Server" extension.
4.  Open `http://localhost:8000` (or the port provided by your server) in your browser.

## Project Structure

The project is built with vanilla JavaScript, HTML, and CSS, utilizing **p5.js** for rendering and **Tone.js** for audio.

*   `index.html`: Main application entry point and UI layout.
*   `style.css`: Application styling (dark theme, responsive layout).
*   `main.js`: Orchestrates the p5.js lifecycle and global event binding.
*   `src/`: Core logic divided into modules:
    *   `state.js`: Global `AppState` and musical constants.
    *   `audio.js`: Soundfont management and Tone.js initialization.
    *   `gridLogic.js`: Coordinate mapping, scales, and transformations.
    *   `input.js`: Low-level mouse and keyboard event handling.
    *   `ui.js`: DOM manipulation and toolbar management.
    *   `fileIO.js`: JSON/MIDI export and local storage persistence.
    *   `quiz.js`: Dictation mode logic and management.
*   `presets/`: Built-in song and quiz tune JSON data.

## Development Guidelines

### Code Style
*   Use **4 spaces** for indentation.
*   Use `const` and `let` (avoid `var`).
*   **State Management**: All application state should reside in the `AppState` object in `script.js`. Avoid creating new global variables if possible.
*   **DOM Interaction**: Cache new UI elements in the `ui` object inside the `setup()` function rather than querying the DOM repeatedly.
*   **Comments**: Add JSDoc-style comments to new functions to explain their purpose and parameters.

### Adding Features
*   **New Instruments**: If adding instruments, ensure they map correctly in `instrumentData` and have a valid General MIDI patch name for `soundfont-player`.
*   **Keyboard Shortcuts**: If adding shortcuts, update the `keyPressed` function and ensure they are documented in the Help Overlay within `index.html`.

## Submitting a Pull Request

1.  Create a new branch for your feature or fix:
    ```bash
    git checkout -b feature/amazing-new-feature
    ```
2.  Make your changes.
3.  **Test your changes**:
    *   Verify playback works.
    *   Check that the UI is responsive.
    *   Ensure Undo/Redo still functions correctly after your changes.
4.  Commit your changes with a clear message.
5.  Push to your fork and submit a Pull Request.

## Reporting Bugs

If you find a bug, please open an issue on GitHub. Include:
*   Steps to reproduce the bug.
*   Expected behavior vs. actual behavior.
*   Browser and OS version.
*   Any error messages from the browser console.

Thank you for contributing!