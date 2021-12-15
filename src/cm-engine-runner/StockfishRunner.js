/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-engine-runner
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
    9: 13,
    10: 16
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
            let match = line.match(/^info .*\bscore (\w+) (-?\d+)/)
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
            // match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbk])?/) // ponder is not always included
            match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbk])?( ponder ([a-h][1-8])?([a-h][1-8])?)?/)
            if (match) {
                this.engineState = ENGINE_STATE.READY
                if (match[4] !== undefined) {
                    this.ponder = {from: match[5], to: match[6]}
                } else {
                    this.ponder = undefined
                }
                const move = {from: match[1], to: match[2], promotion: match[3], score: this.score, ponder: this.ponder}
                this.moveResponse(move)
            } else {
                match = line.match(/^info .*\bdepth (\d+) .*\bnps (\d+)/)
                if (match) {
                    this.engineState = ENGINE_STATE.THINKING
                    this.search = 'Depth: ' + match[1] + ' Nps: ' + match[2]
                }
            }
        }
    }

    calculateMove(fen, props = { level: 4 }) {
        this.engineState = ENGINE_STATE.THINKING
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(async () => {
                resolve()
            }, this.props.responseDelay)
        })
        const calculationPromise = new Promise ((resolve) => {
            setTimeout(() => {
                this.uciCmd('position fen ' + fen)
                this.uciCmd('go depth ' + (LEVEL_DEPTH[props.level]))
                this.moveResponse = (move) => {
                    resolve(move)
                }
            }, this.props.responseDelay)
        })
        return new Promise((resolve) => {
            Promise.all([this.initialisation, timeoutPromise, calculationPromise]).then((values) => {
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