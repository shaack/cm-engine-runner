/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chess-engine-runner
 * License: MIT, see file 'LICENSE'
 */

import {ENGINE_STATE, EngineRunner} from "./EngineRunner.js"

const LEVEL_DEPTH = {
    1: 0,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 7,
    8: 10,
    9: 14,
    10: 18
}

export class Stockfish5BjedrzejewskiRunner extends EngineRunner {

    constructor(props) {
        super(props)
        this.initWorker()
        this.loadBook()
    }

    uciCmd(cmd) {
        this.engineWorker.postMessage(cmd)
    }

    listener(event) {
        // console.log("listener", event)
        const line = event.data
        if (line === 'uciok') {
            this.engineState = ENGINE_STATE.LOADED
        } else if (line === 'readyok') {
            this.engineState = ENGINE_STATE.READY
        } else {
            let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbk])? ponder ([a-h][1-8])?([a-h][1-8])?/)
            if (match) {
                this.engineState = ENGINE_STATE.READY
                if (match[4] !== undefined) {
                    this.ponder = {from: match[4], to: match[5]}
                } else {
                    this.ponder = undefined
                }
                const move = {from: match[1], to: match[2], promotion: match[3]}
                this.moveResponse(move)
            } else {
                match = line.match(/^info .*\bdepth (\d+) .*\bnps (\d+)/)
                if (match) {
                    this.engineState = ENGINE_STATE.THINKING
                    this.search = 'Depth: ' + match[1] + ' Nps: ' + match[2]
                }
            }
            match = line.match(/^info .*\bscore (\w+) (-?\d+)/)
            if (match) {
                const score = parseInt(match[2], 10) * (this.chessConsole.playerWhite() === this ? 1 : -1)
                let tmpScore
                if (match[1] === 'cp') {
                    tmpScore = (score / 100.0).toFixed(1)
                } else if (match[1] === 'mate') {
                    tmpScore = '#' + Math.abs(score)
                }
                this.scoreHistory[this.model.plyCount] = tmpScore
                this.score = tmpScore
            }
        }
    }

    initWorker() {
        this.engineState = ENGINE_STATE.LOADING
        const listener = (event) => {
            this.listener(event)
        }
        if (this.engineWorker !== null) {
            this.engineWorker.removeEventListener("message", listener)
            this.engineWorker.terminate()
        }
        this.engineWorker = new Worker(this.props.worker)
        this.engineWorker.addEventListener("message", listener)

        this.loadBook()
        this.uciCmd('uci')
        this.uciCmd('ucinewgame')
        this.uciCmd('isready')
    }

    loadBook() {
        const bookRequest = new XMLHttpRequest()
        bookRequest.open('GET', this.props.book, true)
        bookRequest.responseType = "arraybuffer"
        bookRequest.onload = (() => {
            if (bookRequest.status === 200) {
                this.engineWorker.postMessage({book: bookRequest.response})
            } else {
                console.error("engine book not loaded")
            }
        })
        bookRequest.send(null)
    }

    calculateMove(fen, moveResponse, level) {
        this.engineState = ENGINE_STATE.THINKING
        this.moveResponse = moveResponse
        const timeout = 1000    // https://www.reddit.com/r/ProgrammerHumor/comments/6xwely/from_the_apple_chess_engine_code/
                                // https://opensource.apple.com/source/Chess/Chess-347/Sources/MBCEngine.mm.auto.html
        setTimeout(() => {
            this.uciCmd('position fen ' + fen)
            this.uciCmd('go depth ' + (LEVEL_DEPTH[level]))
        }, timeout)
    }

}