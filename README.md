# cm-engine-runner

A small ES6 module that runs chess engines in the browser behind one common interface. It ships two runners:

- `StockfishRunner` drives a Stockfish WASM build in a Web Worker over the UCI protocol.
- `PolyglotRunner` plays moves from a Polyglot opening book (`.bin`) via [cm-polyglot](https://github.com/shaack/cm-polyglot).

Both answer the same call, `calculateMove(fen, props)`, and resolve with a move object. That makes it easy to try the opening book first and fall back to the engine, as [chess-console-stockfish](https://github.com/shaack/chess-console-stockfish) does.

No build step, no TypeScript. The sources in `src/` run directly in the browser as ES modules. The library is used on [chessmail.de](https://www.chessmail.de) for the computer opponent and the game analysis board.

## Installation

```bash
npm install cm-engine-runner
```

The package depends on `stockfish` (the WASM builds) and `cm-polyglot`. Serve `node_modules` so the browser can load the worker file and the book.

## Quick start

```html
<script type="importmap">
{
    "imports": {
        "cm-polyglot/": "./node_modules/cm-polyglot/"
    }
}
</script>
<script type="module">
    import {StockfishRunner} from "./node_modules/cm-engine-runner/src/StockfishRunner.js"
    import {PolyglotRunner} from "./node_modules/cm-engine-runner/src/PolyglotRunner.js"

    const book = new PolyglotRunner({bookUrl: "./assets/books/openings.bin"})
    const engine = new StockfishRunner({
        workerUrl: "./node_modules/stockfish/bin/stockfish-18-lite-single.js"
    })

    const fen = "rnbqkbnr/pppppp2/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1"
    let move = await book.calculateMove(fen)
    if (!move) {
        move = await engine.calculateMove(fen, {level: 8})
    }
    console.log(move) // {from: "g1", to: "f3", promotion: undefined, score: "0.3", ponder: {...}}
</script>
```

`index.html` in this repository is a runnable demo. Open it in a browser, the output is in the developer console.

## Common interface

Every runner extends `EngineRunner` (`src/EngineRunner.js`).

### Constructor props

| Prop | Default | Meaning |
|---|---|---|
| `responseDelay` | `1000` | Artificial minimum delay in ms before a result is delivered. A computer opponent that answers instantly feels wrong, hence the default. Set `0` for analysis. |
| `debug` | `false` | Logs every message to and from the engine to the console. |

Runner specific props are listed below.

### `calculateMove(fen, props)`

Returns a Promise that resolves with a move object:

```javascript
{
    from: "e2",        // square
    to: "e4",
    promotion: "q",    // only when the move promotes, otherwise undefined
    score: "0.3",      // StockfishRunner only, see below
    ponder: {from, to} // StockfishRunner only, the expected reply, if reported
}
```

The Promise resolves with `null` when no move is available. Callers must handle that.

### `engineState`

Each runner tracks its state in `runner.engineState` with the values from `ENGINE_STATE`:

| State | Meaning |
|---|---|
| `LOADING` | Worker or book is being loaded |
| `LOADED` | Engine answered `uciok`, not yet ready |
| `READY` | Idle, a search can start |
| `THINKING` | A search is running |

`runner.initialized` is the Promise of `init()` and resolves once the runner is `READY`.

## StockfishRunner

`src/StockfishRunner.js`

### Props

| Prop | Default | Meaning |
|---|---|---|
| `workerUrl` | required | URL of the Stockfish worker file, for example `node_modules/stockfish/bin/stockfish-18-lite-single.js` |
| `calculationTimeout` | `120000` | Safety net in ms. If the engine stays silent that long, the search is stopped and `calculateMove` resolves with `null`. `0` disables the timeout. |

### `calculateMove(fen, props)`

| Prop | Default | Meaning |
|---|---|---|
| `level` | `4` | 1 to 20, maps to search depth and the engine option `Skill Level`, see the table below. For a computer opponent of adjustable strength. |
| `depth` | none | Search depth with full engine strength (`Skill Level` 20). For analysis. Takes precedence over `level`. |
| `chess960` | `false` | Set `true` for Chess960 positions. The runner sets the engine option `UCI_Chess960`, without it Stockfish applies the wrong castling rules. The option is only re-sent when the value changes. |

The runner sends `position fen ...` followed by `go depth N` and resolves on the engine's `bestmove` line.

### Score

`move.score` is the last `info ... score` line the engine printed before `bestmove`, as a string:

- centipawns converted to pawns with one decimal, for example `"0.3"` or `"-2.5"`
- forced mate as `"#N"`, for example `"#3"`

The value is from the point of view of the side to move in the given position, as UCI defines it. Callers who want "from White's point of view" have to negate it for Black.

### Levels

`level` picks a pair of search depth and `Skill Level` from `LEVELS`:

| Level | Depth | Skill Level |
|---|---|---|
| 1 | 3 | 0 |
| 2 | 3 | 1 |
| 3 | 4 | 2 |
| 4 | 5 | 3 |
| 5 | 5 | 4 |
| 6 | 6 | 5 |
| 7 | 7 | 6 |
| 8 | 8 | 7 |
| 9 | 9 | 8 |
| 10 | 10 | 10 |
| 11 to 20 | same as level | same as level |

Stockfish's `Skill Level` 0 plays at roughly 1100 Elo and each step adds about 65 Elo, so level 20 is the full engine strength. How depth relates to Elo is discussed on [chess.stackexchange](https://chess.stackexchange.com/questions/8123/stockfish-elo-vs-search-depth?rq=1).

A `Skill Level` below 20 does more than weaken the move choice. Stockfish then searches four lines (`MultiPV` 4) and picks among them with a random element. Four lines cost three to four times the work per depth, which is why level 19 usually takes longer than level 20. That is fine for an opponent. An analysis wants the real best move and the real score at the lowest possible cost, so it should pass `depth` instead of `level`:

```javascript
await engine.calculateMove(fen, {depth: 15}) // Skill Level 20, one line
```

When several lines are searched, the runner takes `score` only from the principal variation (`multipv 1`), not from the last `info` line the engine printed.

Depth 20 is a lot for the single threaded WASM build. On a slow device a search at that depth can run into `calculationTimeout`. An analysis that runs over a whole game should offer the user a lower depth.

### When `calculateMove` resolves with `null`

- The engine reports `bestmove (none)`: the position is checkmate or stalemate, or the engine rejected the FEN.
- The engine did not answer within `calculationTimeout`.

After a timeout the runner sends `stop` and remembers that the engine still owes one `bestmove` line for the stopped search. The next `calculateMove` waits for that line, drops it, and only then sends the new position. Without this handshake the late answer would be taken as the result of the next position, which shows up as a score with the wrong sign and a suggested move that is illegal in that position. The wait is capped at five seconds in case the worker died.

### Serial use

One runner handles one search at a time. Do not call `calculateMove` again before the previous Promise settled. Callers that may fire several requests, like an analysis board, should chain them through a queue:

```javascript
let queue = Promise.resolve()
function analyze(fen) {
    queue = queue.then(() => engine.calculateMove(fen, {level: 20}))
    return queue
}
```

### Debugging

With `debug: true` the runner logs every UCI command (`uci ->`) and every engine line (`msg`) to the console. `runner.search` holds the last `Depth: N Nps: M` summary while thinking.

## PolyglotRunner

`src/PolyglotRunner.js`

### Props

| Prop | Default | Meaning |
|---|---|---|
| `bookUrl` | required | URL of a Polyglot `.bin` file. A small example book is in `assets/books/openings.bin`. |

### `calculateMove(fen)`

Looks up the position in the book and picks one of the book moves at random, weighted by the probability stored in the book. Resolves with `undefined` when the position is not in the book, so a `!move` check works for the fallback to the engine. The move object has `from`, `to` and `promotion`, no score.

## Writing your own runner

1. Extend `EngineRunner`.
2. Implement `init()` and return a Promise that resolves when the engine is ready. Set `this.engineState = ENGINE_STATE.READY` on success.
3. Implement `calculateMove(fen, props)` and resolve with `{from, to, promotion}` plus whatever extra data your engine delivers. Keep `engineState` up to date, `THINKING` while searching, `READY` afterwards.
4. Honor `this.props.responseDelay` if the runner is meant for a computer opponent.

## Supported engine builds

- `stockfish` npm package, version 18, file `bin/stockfish-18-lite-single.js`, WASM, single threaded. This is the build used in the demo and on chessmail.de. Multi threaded builds need cross origin isolation headers (`SharedArrayBuffer`), the single threaded build does not. See [stockfish.js](https://github.com/nmrugg/stockfish.js).

Other UCI engines compiled to a Web Worker should work as long as they answer `uci`, `isready`, `position fen`, `go depth` and `stop` as the protocol describes.

## References

- [UCI protocol](http://page.mi.fu-berlin.de/block/uci.htm)
- [Official Stockfish](https://github.com/official-stockfish/Stockfish)
- [stockfish.js](https://github.com/nmrugg/stockfish.js/), the WASM builds on npm
- [cm-polyglot](https://github.com/shaack/cm-polyglot), the Polyglot book reader
- [Opening book formats](https://www.chessprogramming.org/Opening_Book#Formats)

## License

MIT.

---

Find more high quality JavaScript modules from [shaack.com](https://shaack.com)
on [our projects page](https://shaack.com/works).
