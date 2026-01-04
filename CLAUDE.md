# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

cm-engine-runner is a lightweight JavaScript library for running chess engines in the browser. It provides an abstraction layer supporting multiple backends: Stockfish (via WebWorkers) and Polyglot opening books.

## Development Commands

```bash
# Install dependencies
npm install

# Run the demo/test page
# Open index.html in a browser (uses importmap for ES6 module resolution)
```

No build step is required - the library uses pure ES6 modules that run directly in browsers.

## Architecture

The project uses an **adapter pattern** with a base class and engine-specific implementations:

```
EngineRunner (base class)
    ├── StockfishRunner  →  WebWorker  →  Stockfish WASM engine
    └── PolyglotRunner   →  cm-polyglot  →  Opening book (.bin)
```

### Core Files

- `src/EngineRunner.js` - Abstract base class defining the interface and state machine (`ENGINE_STATE`: LOADING, LOADED, READY, THINKING)
- `src/StockfishRunner.js` - Stockfish adapter implementing UCI protocol communication, skill levels 1-20 with depth mapping
- `src/PolyglotRunner.js` - Polyglot opening book reader with probability-weighted move selection
- `engines/stockfish-v10-niklasf.js` - Compiled Stockfish v10 engine (runs in WebWorker)

### API Pattern

All adapters share this interface:
```javascript
runner.calculateMove(fen, props) → Promise<{from, to, promotion?, score?, ponder?}>
```

### Adding a New Engine

1. Extend `EngineRunner` class
2. Implement `init()` to set up the engine
3. Implement `calculateMove(fen, props)` returning a Promise with move data
4. Manage engine state via `ENGINE_STATE` constants

## Key Implementation Details

- Uses `importmap` in index.html for browser-based ES6 module resolution (no bundler)
- StockfishRunner communicates with the engine via `postMessage` using UCI protocol
- `responseDelay` prop adds artificial delay for UX purposes
- `debug` prop enables console logging
