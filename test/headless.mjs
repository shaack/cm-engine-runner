/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/teevi
 * License: MIT, see file 'LICENSE'
 *
 * Optional headless test runner. Serves the project over a tiny static server,
 * opens test/index.html in headless Chrome, prints the Teevi summary and exits
 * non-zero when a test failed.
 *
 * Puppeteer is intentionally NOT a dependency of Teevi. Install it globally:
 *
 *     npm install -g puppeteer
 *     npm run test:headless
 *
 * Copy this file into your own project to run your Teevi tests in CI. The only
 * thing to adapt is TEST_PAGE, in case your test page is not test/index.html.
 */

import {createServer} from "http"
import {createRequire} from "module"
import {execSync} from "child_process"
import {readFile} from "fs/promises"
import {fileURLToPath} from "url"
import {dirname, join, normalize, extname} from "path"

const TEST_PAGE = "/test/index.html"
const TIMEOUT = 120000 // the integration test runs the real Stockfish WASM build

const projectRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."))

// Resolve puppeteer from the global npm root, or from the project if it is installed there.
function loadPuppeteer() {
    let globalRoot = ""
    try {
        globalRoot = execSync("npm root -g", {encoding: "utf8"}).trim()
    } catch { /* npm not available, try the project only */ }
    for (const base of [globalRoot + "/", projectRoot + "/"]) {
        try {
            return createRequire(base)("puppeteer")
        } catch { /* try next */ }
    }
    console.error(
        "\nCould not find puppeteer. This headless runner needs it installed globally:\n" +
        "    npm install -g puppeteer\n" +
        "Or just open test/index.html in a browser.\n")
    process.exit(2)
}

const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".map": "application/json",
    // cm-engine-runner: the Stockfish worker loads its .wasm and the Polyglot
    // test reads a .bin book, both need a sensible content type
    ".wasm": "application/wasm", ".bin": "application/octet-stream"
}

// ES modules do not load from file://, so serve the project over http.
function startServer() {
    const server = createServer(async (req, res) => {
        const urlPath = decodeURIComponent(req.url.split("?")[0])
        const filePath = normalize(join(projectRoot, urlPath))
        if (!filePath.startsWith(projectRoot)) { // block path traversal
            res.writeHead(403).end()
            return
        }
        try {
            const body = await readFile(filePath)
            res.writeHead(200, {"Content-Type": MIME[extname(filePath)] || "application/octet-stream"})
            res.end(body)
        } catch {
            res.writeHead(404).end()
        }
    })
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve({server, port: server.address().port}))
    })
}

const puppeteer = loadPuppeteer()
const {server, port} = await startServer()
const url = `http://127.0.0.1:${port}${TEST_PAGE}`

let exitCode = 1
const browser = await puppeteer.launch({headless: true})
try {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto(url, {waitUntil: "networkidle0", timeout: TIMEOUT})
    // teevi.run() appends #teevi-summary when all tests are done
    await page.waitForSelector("#teevi-summary", {timeout: TIMEOUT})
    const {summary, failed, fails} = await page.evaluate(() => {
        const summary = document.getElementById("teevi-summary")
        const fails = [...document.querySelectorAll(".teevi-test.teevi-fail")]
            .map((line) => line.innerText.replace(/\s+/g, " ").trim().slice(0, 500))
        return {summary: summary.innerText, failed: Number(summary.dataset.failed), fails}
    })
    console.log(summary)
    for (const fail of fails) console.log("  FAIL: " + fail)
    for (const error of errors.slice(0, 10)) console.log("  pageerror: " + error)
    exitCode = failed > 0 ? 1 : 0
} finally {
    await browser.close()
    server.close()
}
process.exit(exitCode)
