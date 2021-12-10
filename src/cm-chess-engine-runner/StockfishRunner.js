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

export class StockfishRunner extends EngineRunner {

    constructor(props) {
        super(props)
    }

    init() {
        return new Promise((resolve) => {
            const listener = (event) => {
                this.workerListener(event)
            }
            if (this.engineWorker) {
                this.engineWorker.removeEventListener("message", listener)
                this.engineWorker.terminate()
            }
            this.engineWorker = new Worker(this.props.workerUrl)
            this.engineWorker.addEventListener("message", listener)

            this.uciCmd('uci')
            this.uciCmd('ucinewgame')
            this.uciCmd('isready')
            resolve()
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
        } else {
            let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbk])?/)
            // let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbk])? ponder ([a-h][1-8])?([a-h][1-8])?/)
            if (match) {
                this.engineState = ENGINE_STATE.READY
                /*
                if (match[4] !== undefined) {
                    this.ponder = {from: match[4], to: match[5]}
                } else {
                    this.ponder = undefined
                }
                */
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
                const score = parseInt(match[2], 10)
                let tmpScore
                if (match[1] === 'cp') {
                    tmpScore = (score / 100.0).toFixed(1)
                } else if (match[1] === 'mate') {
                    tmpScore = '#' + Math.abs(score)
                }
                this.score = tmpScore
            }
        }
    }

    calculateMove(fen, level) {
        return new Promise ((resolve) => {
            this.engineState = ENGINE_STATE.THINKING
            // this.moveResponse = moveResponse
            const timeout = 1000    // https://www.reddit.com/r/ProgrammerHumor/comments/6xwely/from_the_apple_chess_engine_code/
                                    // https://opensource.apple.com/source/Chess/Chess-347/Sources/MBCEngine.mm.auto.html
            setTimeout(() => {
                this.uciCmd('position fen ' + fen)
                this.uciCmd('go depth ' + (LEVEL_DEPTH[level]))
                this.moveResponse = (move) => {
                    resolve(move)
                }
            }, this.props.responseDelay)
        })
    }

    uciCmd(cmd) {
        this.engineWorker.postMessage(cmd)
    }
/*
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
*/

}