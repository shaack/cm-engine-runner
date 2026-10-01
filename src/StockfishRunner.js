/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chess-engine-runner
 * License: MIT, see file 'LICENSE'
 */

import {ENGINE_STATE, EngineRunner} from "./EngineRunner.js"

// [depth, Skill Level]
export const LEVELS = {
    1: [3, 0],
    2: [3, 1],
    3: [4, 2],
    4: [5, 3],
    5: [5, 4],
    6: [6, 5],
    7: [7, 6],
    8: [8, 7],
    9: [9, 8],
    10: [10, 10],
    11: [11, 11],
    12: [12, 12],
    13: [13, 13],
    14: [14, 14],
    15: [15, 15],
    16: [16, 16],
    17: [17, 17],
    18: [18, 18],
    19: [19, 19],
    20: [20, 20]
}

export class StockfishRunner extends EngineRunner {

    constructor(props) {
        super(props)
        if (this.props.calculationTimeout === undefined) {
            // safety net: if the engine never answers with a "bestmove" line
            // (silently rejected position, crashed worker), calculateMove()
            // resolves with null after this many ms instead of hanging forever.
            // Generous default, deep searches on slow devices are legitimate.
            this.props.calculationTimeout = 120000
        }
        // UCI_Chess960 state actually sent to the engine (engine default is false)
        this.chess960Sent = false
        // Handshake after a timed-out search: the engine answers the "stop"
        // with one more "bestmove" line. Until it has arrived, no new search is
        // started, otherwise the engine's late answer would be taken for the
        // result of the next position (score of the wrong side, illegal move).
        this.stoppedSearch = null
        this.stoppedSearchResolve = undefined
    }

    /**
     * Resolves once the bestmove of a stopped search has arrived (or after a
     * short grace period, should the engine never answer, e.g. crashed worker).
     */
    waitForStoppedSearch() {
        if (!this.stoppedSearch) {
            return Promise.resolve()
        }
        const grace = new Promise((resolve) => setTimeout(resolve, 5000))
        return Promise.race([this.stoppedSearch, grace]).then(() => {
            this.stoppedSearch = null
            this.stoppedSearchResolve = undefined
        })
    }

    init() {
        return new Promise((resolve, reject) => {
            const listener = (event) => {
                this.workerListener(event)
                if (this.engineState === ENGINE_STATE.READY) {
                    resolve()
                }
            }
            if (this.engineWorker) {
                this.engineWorker.removeEventListener("message", listener)
                this.engineWorker.terminate()
            }
            this.engineWorker = new Worker(this.props.workerUrl)
            this.engineWorker.addEventListener("message", listener)
            this.engineWorker.addEventListener("error", () => {
                reject(new Error("Engine worker failed to load from: " + this.props.workerUrl))
            })

            this.uciCmd('uci')
            this.uciCmd('ucinewgame')
            this.uciCmd('isready')
        })
    }

    workerListener(event) {
        if(this.props.debug) {
            if(event.type === "message") {
                console.log("  msg", event.data)
            } else {
                console.log(event)
            }
        }
        const line = event.data
        if (line === 'uciok') {
            this.engineState = ENGINE_STATE.LOADED
        } else if (line === 'readyok') {
            this.engineState = ENGINE_STATE.READY
        } else if (line.startsWith("bestmove") && this.stoppedSearchResolve) {
            // late answer of a search stopped after calculationTimeout: consume it
            // and release the search waiting in calculateMove
            this.engineState = ENGINE_STATE.READY
            const resolve = this.stoppedSearchResolve
            this.stoppedSearchResolve = undefined
            resolve()
        } else {
            let match = line.match(/^info .*\bscore (\w+) (-?\d+)/)
            // With Skill Level below 20 Stockfish searches four lines (MultiPV 4)
            // and prints them in order, the last info line before "bestmove" is
            // the fourth best line. Only the principal variation (multipv 1, or
            // no multipv at all) carries the score of the position.
            const multipv = line.match(/ multipv (\d+)/)
            if (match && multipv && multipv[1] !== "1") {
                match = null
            }
            if (match) {
                const score = parseInt(match[2], 10)
                let tmpScore
                if (match[1] === 'cp') {
                    tmpScore = (score / 100.0).toFixed(1)
                } else if (match[1] === 'mate') {
                    tmpScore = '#' + Math.abs(score)
                }
                this.score = tmpScore
            }
            if (line.startsWith("bestmove (none)")) {
                // no legal move in this position (checkmate/stalemate or a
                // position the engine rejected): resolve with null instead of
                // waiting forever for a move that will never come
                this.engineState = ENGINE_STATE.READY
                this.ponder = undefined
                if (this.moveResponse) {
                    const respond = this.moveResponse
                    this.moveResponse = undefined
                    respond(null)
                }
                return
            }
            // match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/) // ponder is not always included
            match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?( ponder ([a-h][1-8])?([a-h][1-8])?)?/)
            if (match) {
                this.engineState = ENGINE_STATE.READY
                if (match[4] !== undefined) {
                    this.ponder = {from: match[5], to: match[6]}
                } else {
                    this.ponder = undefined
                }
                const move = {from: match[1], to: match[2], promotion: match[3], score: this.score, ponder: this.ponder}
                if (this.moveResponse) {
                    // undefined after a timed-out search (its late bestmove is
                    // handled above) or when "stop" was sent from outside
                    const respond = this.moveResponse
                    this.moveResponse = undefined
                    respond(move)
                }
            } else {
                match = line.match(/^info .*\bdepth (\d+) .*\bnps (\d+)/)
                if (match) {
                    this.engineState = ENGINE_STATE.THINKING
                    this.search = 'Depth: ' + match[1] + ' Nps: ' + match[2]
                }
            }
        }
    }

    /**
     * @param fen the position to search
     * @param props `level` 1-20 (maps to depth and Skill Level, see LEVELS),
     *              for a computer opponent of adjustable strength.
     *              `depth` search depth with full engine strength (Skill
     *              Level 20), for analysis; takes precedence over `level`.
     *              `chess960` true for Chess960 positions (sets the engine
     *              option UCI_Chess960, required for correct castling)
     * @returns Promise, resolves with the move or with null, if the engine
     *          found no move (mate/stalemate position, "bestmove (none)") or
     *          did not answer within props.calculationTimeout
     */
    calculateMove(fen, props = { level: 4 }) {
        this.engineState = ENGINE_STATE.THINKING
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(async () => {
                resolve()
            }, this.props.responseDelay)
        })
        // the timeout clock starts when "go" is sent, not while the runner is
        // still waiting for the late answer of a previously stopped search
        let onSearchStarted = () => {}
        const calculationPromise = new Promise ((resolve) => {
            setTimeout(async () => {
                // a search stopped by calculationTimeout must have answered first
                await this.waitForStoppedSearch()
                this.score = undefined // Reset score to avoid carrying over stale values
                const chess960 = !!props.chess960
                if (chess960 !== this.chess960Sent) {
                    this.uciCmd('setoption name UCI_Chess960 value ' + chess960)
                    this.chess960Sent = chess960
                }
                // Skill Level below 20 weakens the engine: MultiPV 4 (three to
                // four times the work per depth) plus a random pick among the
                // lines. An analysis wants the real best move, hence `depth`.
                let depth, skillLevel
                if (props.depth !== undefined) {
                    depth = props.depth
                    skillLevel = 20
                } else {
                    const level = LEVELS[props.level] ? props.level : 4
                    depth = LEVELS[level][0]
                    skillLevel = LEVELS[level][1]
                }
                this.uciCmd('setoption name Skill Level value ' + skillLevel)
                this.uciCmd('position fen ' + fen)
                this.uciCmd('go depth ' + depth)
                this.moveResponse = (move) => {
                    resolve(move)
                }
                onSearchStarted()
            }, this.props.responseDelay)
        })
        // never hang forever: if the engine stays silent, stop the search,
        // detach the stale moveResponse and resolve with null
        let guardedCalculation = calculationPromise
        if (this.props.calculationTimeout) {
            let timeoutHandle
            guardedCalculation = Promise.race([
                calculationPromise.then((move) => {
                    clearTimeout(timeoutHandle)
                    return move
                }),
                new Promise((resolve) => {
                    onSearchStarted = () => {
                        timeoutHandle = setTimeout(() => {
                            this.moveResponse = undefined
                            this.stoppedSearch = new Promise((resolveStopped) => {
                                this.stoppedSearchResolve = resolveStopped
                            })
                            this.uciCmd('stop')
                            resolve(null)
                        }, this.props.calculationTimeout)
                    }
                })
            ])
        }
        return new Promise((resolve) => {
            Promise.all([this.initialisation, timeoutPromise, guardedCalculation]).then((values) => {
                this.engineState = ENGINE_STATE.READY
                resolve(values[2])
            })
        })
    }

    uciCmd(cmd) {
        if(this.props.debug) {
            console.log("  uci ->", cmd)
        }
        this.engineWorker.postMessage(cmd)
    }

}
