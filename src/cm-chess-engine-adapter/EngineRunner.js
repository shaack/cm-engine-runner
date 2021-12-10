/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chess-engine-adapter
 * License: MIT, see file 'LICENSE'
 */

export const ENGINE_STATE = {
    LOADING: 1,
    LOADED: 2,
    READY: 3,
    THINKING: 4
}

export class EngineRunner {

    constructor(props) {
        this.props = {
            level: 1
        }
        Object.assign(this.props, props)
    }

    calculateMove(fen, level) {

    }

}