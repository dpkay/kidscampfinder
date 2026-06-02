import { chromium } from "playwright";

const base = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".card", { timeout: 15000 });
const cardCount = await page.locator(".card").count();
await page.screenshot({ path: "screenshots/browse.png" });

// course detail (with Google map)
await page.locator(".card").first().click();
await page.waitForSelector(".modal", { timeout: 5000 });
await page.waitForTimeout(2500); // let google map tiles load
await page.screenshot({ path: "screenshots/detail.png" });
await page.keyboard.press("Escape").catch(() => {});

// map view
await page.locator(".view-toggle button").nth(1).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: "screenshots/map.png" });

// admin
await page.goto(base + "/#admin", { waitUntil: "networkidle" });
await page.waitForSelector(".panel", { timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: "screenshots/admin.png", fullPage: true });

console.log(JSON.stringify({ cardCount, errors: errors.slice(0, 8) }, null, 2));
await browser.close();
