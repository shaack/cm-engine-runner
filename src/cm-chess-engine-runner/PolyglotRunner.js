/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chess-engine-runner
 * License: MIT, see file 'LICENSE'
 */
import {ENGINE_STATE, EngineRunner} from "./EngineRunner.js"
import {Polyglot} from "../../lib/cm-polyglot/Polyglot.js"

export class PolyglotRunner extends EngineRunner{

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
        return new Promise ((resolve) => {
            this.engineState = ENGINE_STATE.THINKING
            setTimeout(async () => {
                const moves = await this.polyglot.getMovesFromFen(fen)
                // handle propability
                const propabilityMatrix = []
                for (const move of moves) {
                    for (let i = 0; i < (move.probability * 10); i++) {
                        propabilityMatrix.push(move)
                    }
                }
                const luckyIndex = Math.floor(Math.random() * propabilityMatrix.length)
                this.engineState = ENGINE_STATE.READY
                resolve(propabilityMatrix[luckyIndex])
            }, this.props.responseDelay)
        })
    }

}