import { chromium } from "playwright";
const base = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base + "/#explore", { waitUntil: "networkidle" });
await page.waitForSelector(".summary-pill", { timeout: 15000 });
await page.waitForTimeout(4500); // let map load + idle fire + courses fetch
await page.screenshot({ path: "screenshots/explore.png" });
const cards = await page.locator(".ccard").count();

// open filter sheet
await page.locator(".summary-pill").click();
await page.waitForSelector(".fs-sheet", { timeout: 5000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshots/explore-filter.png" });

console.log(JSON.stringify({ cards, errors: errors.slice(0, 8) }, null, 2));
await browser.close();
