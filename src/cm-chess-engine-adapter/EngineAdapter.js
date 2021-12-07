/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chess-engine-adapter
 * License: MIT, see file 'LICENSE'
 */

export class EngineAdapter {

    constructor(props) {
        this.props = {
            level: 2
        }
        Object.assign(this.props, props)
    }

    calculateMove(fen, depth) {
        if(this.props.debug) {
            console.log("moveRequest", fen)
        }
        return new Promise((resolve) => {
            this.engineState = ENGINE_STATE.THINKING
            this.uciCmd('position fen ' + fen)
            this.uciCmd('go depth ' + depth)
        })
    }

}