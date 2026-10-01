/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-engine-runner
 * License: MIT, see file 'LICENSE'
 *
 * A stand-in for the Stockfish Web Worker. It speaks just enough UCI to drive
 * the StockfishRunner and answers every "go" with a script the test provides,
 * so the runner's parsing, option handling and timeout logic can be tested
 * deterministically and in milliseconds, without the WASM engine.
 */

export class FakeStockfishWorker {

    constructor() {
        this.listeners = []
        // every command the runner sent, in order
        this.commands = []
        // one entry per expected "go": {lines: [...], delay: ms}. Without an
        // entry the search stays silent, like an engine that never answers.
        this.answers = []
        // what a silent search prints when the runner sends "stop"
        this.stopAnswer = {lines: ["info depth 3 score cp 500 nps 1000 pv a2a3", "bestmove a2a3"], delay: 0}
        this.searching = false
    }

    addEventListener(type, listener) {
        if (type === "message") {
            this.listeners.push(listener)
        }
    }

    removeEventListener(type, listener) {
        this.listeners = this.listeners.filter((l) => l !== listener)
    }

    terminate() {
        this.listeners = []
    }

    /** Emit lines to the runner asynchronously, like a real worker does. */
    emit(lines, delay = 0) {
        setTimeout(() => {
            for (const line of lines) {
                for (const listener of this.listeners) {
                    listener({type: "message", data: line})
                }
            }
        }, delay)
    }

    postMessage(command) {
        this.commands.push(command)
        if (command === "uci") {
            this.emit(["id name Fake Stockfish", "uciok"])
        } else if (command === "isready") {
            this.emit(["readyok"])
        } else if (command.startsWith("go")) {
            const answer = this.answers.shift()
            if (answer) {
                this.emit(answer.lines, answer.delay || 0)
            } else {
                this.searching = true
            }
        } else if (command === "stop") {
            if (this.searching) {
                this.searching = false
                this.emit(this.stopAnswer.lines, this.stopAnswer.delay || 0)
            }
        }
    }

    /** The commands sent since the last call, handy to inspect one search. */
    takeCommands() {
        const commands = this.commands
        this.commands = []
        return commands
    }
}

/**
 * Creates a StockfishRunner that talks to the given fake worker. The runner
 * constructs its worker with `new Worker(url)` inside init(), so the global
 * Worker is swapped for the duration of the constructor call only.
 */
export function createRunnerWithFakeWorker(RunnerClass, fakeWorker, props = {}) {
    const RealWorker = window.Worker
    window.Worker = function () {
        return fakeWorker
    }
    try {
        return new RunnerClass(Object.assign({workerUrl: "fake", responseDelay: 0}, props))
    } finally {
        window.Worker = RealWorker
    }
}
