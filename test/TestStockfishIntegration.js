/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-engine-runner
 * License: MIT, see file 'LICENSE'
 *
 * Integration test with the real Stockfish WASM build from the npm package
 * `stockfish`. Loads the engine once and keeps the searches shallow, so the
 * whole file runs in a few seconds.
 */
import {describe, it, assert} from "../node_modules/teevi/src/teevi.js"
import {StockfishRunner} from "../src/StockfishRunner.js"
import {ENGINE_STATE} from "../src/EngineRunner.js"

const WORKER_URL = "../node_modules/stockfish/bin/stockfish-18-lite-single.js"
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1" // Ra8#
const CHECKMATED = "R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1"
const SQUARE = /^[a-h][1-8]$/

const runner = new StockfishRunner({workerUrl: WORKER_URL, responseDelay: 0})

describe("StockfishRunner with the real Stockfish 18 lite build", () => {

    it("loads the engine", async () => {
        await runner.initialized
        assert.equal(runner.engineState, ENGINE_STATE.READY)
    })

    it("finds a move with a numeric score in the starting position", async () => {
        const move = await runner.calculateMove(START, {depth: 6})
        assert.true(SQUARE.test(move.from) && SQUARE.test(move.to), "a legal looking move: " + move.from + move.to)
        assert.equal(move.promotion, undefined)
        assert.true(/^-?\d+\.\d$/.test(move.score), "score in pawns with one decimal: " + move.score)
        assert.equal(runner.engineState, ENGINE_STATE.READY)
    })

    it("plays the mate in one and reports #1", async () => {
        const move = await runner.calculateMove(MATE_IN_ONE, {depth: 6})
        assert.equal(move.from, "a1")
        assert.equal(move.to, "a8")
        assert.equal(move.score, "#1")
    })

    it("resolves with null in a checkmated position", async () => {
        const move = await runner.calculateMove(CHECKMATED, {depth: 6})
        assert.equal(move, null)
    })

    it("answers a low level with a move too", async () => {
        const move = await runner.calculateMove(START, {level: 1})
        assert.true(SQUARE.test(move.from) && SQUARE.test(move.to))
    })

    it("searches consecutive positions without mixing up the answers", async () => {
        const first = await runner.calculateMove(MATE_IN_ONE, {depth: 4})
        const second = await runner.calculateMove(START, {depth: 4})
        assert.equal(first.score, "#1")
        assert.notEqual(second.score, "#1")
        assert.true(second.from !== "a1" || second.to !== "a8", "the start position gets its own move")
    })
})
