/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-engine-runner
 * License: MIT, see file 'LICENSE'
 *
 * Tests for the PolyglotRunner with the real example book assets/books/openings.bin.
 */
import {describe, it, assert} from "../node_modules/teevi/src/teevi.js"
import {PolyglotRunner} from "../src/PolyglotRunner.js"
import {ENGINE_STATE} from "../src/EngineRunner.js"

const BOOK_URL = "../assets/books/openings.bin"
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1"
const BARE_KINGS = "8/8/8/2k5/4K3/8/8/8 w - - 0 1"
const SQUARE = /^[a-h][1-8]$/

describe("PolyglotRunner", () => {

    it("plays a book move in the starting position", async () => {
        const runner = new PolyglotRunner({bookUrl: BOOK_URL, responseDelay: 0})
        const move = await runner.calculateMove(START)
        assert.true(move !== undefined, "a move from the book")
        assert.true(SQUARE.test(move.from), "from is a square: " + move.from)
        assert.true(SQUARE.test(move.to), "to is a square: " + move.to)
        assert.equal(runner.engineState, ENGINE_STATE.READY)
    })

    it("plays a book move after 1. e4 e5", async () => {
        const runner = new PolyglotRunner({bookUrl: BOOK_URL, responseDelay: 0})
        const move = await runner.calculateMove(AFTER_E4_E5)
        assert.true(move !== undefined, "a move from the book")
        assert.true(SQUARE.test(move.from) && SQUARE.test(move.to))
    })

    it("only plays moves that are in the book for the position", async () => {
        // every book move for the start position moves a white piece from rank 1 or 2
        const runner = new PolyglotRunner({bookUrl: BOOK_URL, responseDelay: 0})
        for (let i = 0; i < 20; i++) {
            const move = await runner.calculateMove(START)
            assert.true(move.from.endsWith("1") || move.from.endsWith("2"), "white move from the back ranks: " + move.from)
        }
    })

    it("resolves with undefined when the position is not in the book", async () => {
        const runner = new PolyglotRunner({bookUrl: BOOK_URL, responseDelay: 0})
        const move = await runner.calculateMove(BARE_KINGS)
        assert.equal(move, undefined)
    })

    it("honors responseDelay as a minimum duration", async () => {
        const runner = new PolyglotRunner({bookUrl: BOOK_URL, responseDelay: 80})
        const started = Date.now()
        await runner.calculateMove(START)
        assert.true(Date.now() - started >= 75, "took at least responseDelay")
    })
})
