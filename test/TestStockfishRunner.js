/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-engine-runner
 * License: MIT, see file 'LICENSE'
 *
 * Unit tests for the StockfishRunner against the FakeStockfishWorker: UCI
 * parsing, level and depth handling, Chess960 option, timeout and the
 * handshake after a stopped search. No real engine involved.
 */
import {describe, it, assert} from "../node_modules/teevi/src/teevi.js"
import {StockfishRunner, LEVELS} from "../src/StockfishRunner.js"
import {ENGINE_STATE} from "../src/EngineRunner.js"
import {FakeStockfishWorker, createRunnerWithFakeWorker} from "./FakeStockfishWorker.js"

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"

function setup(props = {}) {
    const worker = new FakeStockfishWorker()
    const runner = createRunnerWithFakeWorker(StockfishRunner, worker, props)
    return {worker, runner}
}

describe("StockfishRunner: initialisation", () => {

    it("initialized resolves once the engine answered uciok and readyok", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        assert.equal(runner.engineState, ENGINE_STATE.READY)
        const commands = worker.takeCommands()
        assert.equal(commands[0], "uci")
        assert.equal(commands[1], "ucinewgame")
        assert.equal(commands[2], "isready")
    })
})

describe("StockfishRunner: calculateMove result", () => {

    it("resolves with from, to, score and ponder from the engine output", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: [
            "info depth 5 seldepth 7 score cp 30 nodes 1000 nps 50000 pv e2e4 e7e5",
            "bestmove e2e4 ponder e7e5"
        ]})
        const move = await runner.calculateMove(START, {level: 4})
        assert.equal(move.from, "e2")
        assert.equal(move.to, "e4")
        assert.equal(move.promotion, undefined)
        assert.equal(move.score, "0.3")
        assert.equal(move.ponder.from, "e7")
        assert.equal(move.ponder.to, "e5")
        assert.equal(runner.engineState, ENGINE_STATE.READY)
    })

    it("sends position and go for the given fen", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        worker.takeCommands()
        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START, {level: 4})
        const commands = worker.takeCommands()
        assert.true(commands.includes("position fen " + START), "position fen sent")
        assert.true(commands.some((c) => c.startsWith("go depth ")), "go depth sent")
    })

    it("parses a promotion", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: ["bestmove e7e8q"]})
        const move = await runner.calculateMove("4k3/4P3/4K3/8/8/8/8/8 w - - 0 1", {level: 4})
        assert.equal(move.from, "e7")
        assert.equal(move.to, "e8")
        assert.equal(move.promotion, "q")
    })

    it("parses a bestmove without ponder", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: ["info depth 1 score cp -120 pv g8f6", "bestmove g8f6"]})
        const move = await runner.calculateMove(AFTER_E4, {level: 4})
        assert.equal(move.from, "g8")
        assert.equal(move.to, "f6")
        assert.equal(move.ponder, undefined)
        assert.equal(move.score, "-1.2")
    })

    it("formats centipawns as pawns with one decimal", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: ["info depth 1 score cp 1234 pv e2e4", "bestmove e2e4"]})
        const move = await runner.calculateMove(START, {level: 4})
        assert.equal(move.score, "12.3")
    })

    it("formats a forced mate as #N, for both sides", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: ["info depth 1 score mate 3 pv e2e4", "bestmove e2e4"]})
        worker.answers.push({lines: ["info depth 1 score mate -2 pv e2e4", "bestmove e2e4"]})
        const winning = await runner.calculateMove(START, {level: 4})
        assert.equal(winning.score, "#3")
        const losing = await runner.calculateMove(START, {level: 4})
        assert.equal(losing.score, "#2")
    })

    it("takes the score from the last info line of the search", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: [
            "info depth 1 score cp 10 pv e2e4",
            "info depth 2 score cp 20 pv e2e4",
            "info depth 3 score cp 30 pv e2e4",
            "bestmove e2e4"
        ]})
        const move = await runner.calculateMove(START, {level: 4})
        assert.equal(move.score, "0.3")
    })

    it("takes the score from multipv 1 only, not from the last printed line", async () => {
        // with Skill Level below 20 Stockfish prints four lines per iteration
        const {worker, runner} = setup()
        worker.answers.push({lines: [
            "info depth 5 multipv 1 score cp 50 pv e2e4",
            "info depth 5 multipv 2 score cp 10 pv d2d4",
            "info depth 5 multipv 3 score cp -40 pv g1f3",
            "info depth 5 multipv 4 score cp -120 pv a2a3",
            "bestmove e2e4"
        ]})
        const move = await runner.calculateMove(START, {level: 10})
        assert.equal(move.score, "0.5")
    })

    it("does not carry a score over from the previous search", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: ["info depth 1 score cp 99 pv e2e4", "bestmove e2e4"]})
        worker.answers.push({lines: ["bestmove d2d4"]})
        await runner.calculateMove(START, {level: 4})
        const second = await runner.calculateMove(START, {level: 4})
        assert.equal(second.score, undefined)
    })

    it("resolves with null on bestmove (none)", async () => {
        const {worker, runner} = setup()
        worker.answers.push({lines: ["info depth 0 score mate 0", "bestmove (none)"]})
        const move = await runner.calculateMove("R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", {level: 4})
        assert.equal(move, null)
        assert.equal(runner.engineState, ENGINE_STATE.READY)
    })

    it("is THINKING while the engine searches", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        worker.answers.push({lines: ["bestmove e2e4"], delay: 30})
        const pending = runner.calculateMove(START, {level: 4})
        assert.equal(runner.engineState, ENGINE_STATE.THINKING)
        await pending
        assert.equal(runner.engineState, ENGINE_STATE.READY)
    })

    it("honors responseDelay as a minimum duration", async () => {
        const {worker, runner} = setup({responseDelay: 80})
        worker.answers.push({lines: ["bestmove e2e4"]})
        const started = Date.now()
        await runner.calculateMove(START, {level: 4})
        assert.true(Date.now() - started >= 75, "took at least responseDelay")
    })
})

describe("StockfishRunner: level and depth", () => {

    it("maps level to depth and Skill Level via LEVELS", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        for (const level of [1, 3, 10, 20]) {
            worker.takeCommands()
            worker.answers.push({lines: ["bestmove e2e4"]})
            await runner.calculateMove(START, {level})
            const commands = worker.takeCommands()
            assert.true(commands.includes("setoption name Skill Level value " + LEVELS[level][1]), "Skill Level for level " + level)
            assert.true(commands.includes("go depth " + LEVELS[level][0]), "depth for level " + level)
        }
    })

    it("defaults to level 4", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        worker.takeCommands()
        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START)
        const commands = worker.takeCommands()
        assert.true(commands.includes("setoption name Skill Level value " + LEVELS[4][1]))
        assert.true(commands.includes("go depth " + LEVELS[4][0]))
    })

    it("depth searches with full strength, Skill Level 20", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        worker.takeCommands()
        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START, {depth: 15})
        const commands = worker.takeCommands()
        assert.true(commands.includes("setoption name Skill Level value 20"), "Skill Level 20")
        assert.true(commands.includes("go depth 15"), "go depth 15")
    })

    it("depth takes precedence over level", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        worker.takeCommands()
        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START, {level: 3, depth: 12})
        const commands = worker.takeCommands()
        assert.true(commands.includes("setoption name Skill Level value 20"))
        assert.true(commands.includes("go depth 12"))
    })
})

describe("StockfishRunner: Chess960", () => {

    it("sends UCI_Chess960 only when the value changes", async () => {
        const {worker, runner} = setup()
        await runner.initialized
        const option = (value) => "setoption name UCI_Chess960 value " + value

        worker.takeCommands()
        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START, {level: 4})
        assert.false(worker.takeCommands().includes(option(false)), "engine default is false, nothing sent")

        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START, {level: 4, chess960: true})
        assert.true(worker.takeCommands().includes(option(true)), "switched on")

        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START, {level: 4, chess960: true})
        assert.false(worker.takeCommands().includes(option(true)), "not re-sent while unchanged")

        worker.answers.push({lines: ["bestmove e2e4"]})
        await runner.calculateMove(START, {level: 4})
        assert.true(worker.takeCommands().includes(option(false)), "switched off again")
    })
})

describe("StockfishRunner: calculationTimeout", () => {

    it("resolves with null and sends stop when the engine stays silent", async () => {
        const {worker, runner} = setup({calculationTimeout: 50})
        await runner.initialized
        worker.takeCommands()
        // no answer queued: the fake engine never responds to "go"
        const move = await runner.calculateMove(START, {level: 4})
        assert.equal(move, null)
        assert.true(worker.takeCommands().includes("stop"), "stop sent")
        assert.equal(runner.engineState, ENGINE_STATE.READY)
    })

    it("does not take the late bestmove of a stopped search as the next result", async () => {
        const {worker, runner} = setup({calculationTimeout: 50})
        await runner.initialized
        // the stopped search answers 10 ms after "stop", the next real search
        // takes 30 ms: without the handshake the late answer wins
        worker.stopAnswer = {lines: ["info depth 3 score cp 500 pv a2a3", "bestmove a2a3"], delay: 10}

        const timedOut = await runner.calculateMove(START, {level: 4}) // silent, runs into the timeout
        assert.equal(timedOut, null)
        worker.takeCommands()
        worker.answers.push({lines: ["info depth 5 score cp -10 pv g8f6", "bestmove g8f6"], delay: 30})

        const next = await runner.calculateMove(AFTER_E4, {level: 4})
        assert.equal(next.from, "g8")
        assert.equal(next.to, "f6")
        assert.equal(next.score, "-0.1")
    })

    it("sends the next position only after the stopped search has answered", async () => {
        const {worker, runner} = setup({calculationTimeout: 50})
        await runner.initialized
        worker.stopAnswer = {lines: ["bestmove a2a3"], delay: 40}

        await runner.calculateMove(START, {level: 4}) // silent, runs into the timeout
        const stoppedAt = Date.now()
        worker.takeCommands()
        worker.answers.push({lines: ["bestmove g8f6"]})
        await runner.calculateMove(AFTER_E4, {level: 4})
        // the fake answers "go" immediately, so the whole second call is
        // dominated by the wait for the late bestmove
        assert.true(Date.now() - stoppedAt >= 35, "waited for the late bestmove")
        assert.true(worker.takeCommands().includes("position fen " + AFTER_E4))
    })

    it("gives up waiting after the grace period if the engine never answers the stop", async () => {
        const {worker, runner} = setup({calculationTimeout: 30})
        await runner.initialized
        worker.stopAnswer = {lines: [], delay: 0} // dead engine

        await runner.calculateMove(START, {level: 4}) // silent, runs into the timeout
        const started = Date.now()
        worker.answers.push({lines: ["bestmove g8f6"]})
        const next = await runner.calculateMove(AFTER_E4, {level: 4})
        const waited = Date.now() - started
        assert.equal(next.from, "g8")
        assert.true(waited >= 4900 && waited < 7000, "grace period of about 5 s, was " + waited + " ms")
    })

    it("can be disabled with calculationTimeout 0", async () => {
        const {worker, runner} = setup({calculationTimeout: 0})
        worker.answers.push({lines: ["bestmove e2e4"], delay: 20})
        const move = await runner.calculateMove(START, {level: 4})
        assert.equal(move.from, "e2")
        assert.false(worker.commands.includes("stop"))
    })
})
