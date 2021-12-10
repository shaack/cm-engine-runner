/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * License: MIT, see file 'LICENSE'
 */

const ModRator = require("modrator/src/ModRator.js")
const modRator = new ModRator(__dirname)

modRator.addToLibrary("cm-polyglot")
modRator.addToLibrary("cm-polyglot", "src", "stakelbase")
modRator.addToLibrary("stockfish", "src", "stockfish.js")
modRator.addToLibrary("stockfish", "src", "stockfish.wasm")
