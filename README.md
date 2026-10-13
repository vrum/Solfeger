# Solfeger Sequencer Release

**Live Demo:** [https://vrum.github.io/Solfeger/](https://vrum.github.io/Solfeger/)

Solfeger is a web-based music sequencer and ear-training tool.

## How to use
Simply upload these files to a web server (like GitHub Pages) or run a local web server in this directory.

### Running locally
Because of browser security (CORS), you cannot simply double-click `index.html`. You need to serve it:
- If you have Node.js: `npx serve`
- If you have Python: `python3 -m http.server 8000`

Then open `http://localhost:8000` in your browser.

## Acknowledgments
Solfeger is built with the help of wonderful open-source libraries:
- [Tone.js](https://tonejs.github.io/) - Web Audio framework for synthesis and scheduling.
- [p5.js](https://p5js.org/) - Creative coding and interactive visual canvas.
- [soundfont-player](https://github.com/danigb/soundfont-player) - Realistic Soundfont instrument synthesis.
- [lamejs](https://github.com/gyumei/lamejs) - Pure JavaScript MP3 encoding in the browser.
