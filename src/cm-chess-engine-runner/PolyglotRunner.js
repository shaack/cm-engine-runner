/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chess-engine-runner
 * License: MIT, see file 'LICENSE'
 */
import {ENGINE_STATE, EngineRunner} from "./EngineRunner.js"
import {Polyglot} from "../../lib/cm-polyglot/Polyglot.js"

export class PolyglotRunner extends EngineRunner {

    constructor(props) {
        super(props)
    }

    init() {
        this.polyglot = new Polyglot(this.props.bookUrl)
        this.polyglot.initialisation.then(() => {
            this.engineState = ENGINE_STATE.READY
            return Promise.resolve()
        })
    }

    calculateMove(fen) {
        this.engineState = ENGINE_STATE.THINKING
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(async () => {
                resolve()
            }, this.props.responseDelay)
        })
        const calculationPromise = new Promise(async (resolve) => {
            const moves = await this.polyglot.getMovesFromFen(fen)
            // handle propability
            const propabilityMatrix = []
            for (const move of moves) {
                for (let i = 0; i < (move.probability * 10); i++) {
                    propabilityMatrix.push(move)
                }
            }
            const luckyIndex = Math.floor(Math.random() * propabilityMatrix.length)
            resolve(propabilityMatrix[luckyIndex])
        })
        return new Promise((resolve) => {
            Promise.all([timeoutPromise, calculationPromise]).then((values) => {
                this.engineState = ENGINE_STATE.READY
                resolve(values[1])
            })
        })
    }

}