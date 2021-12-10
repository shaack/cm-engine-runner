/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chess-engine-adapter
 * License: MIT, see file 'LICENSE'
 */

import {EngineRunner} from "./EngineRunner.js"

export class StockfishBjedrzejewski5Runner extends EngineRunner {
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

}