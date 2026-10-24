const {spawn} = require("node:child_process");
const path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.SHOTS || path.join(ROOT, "tests");
const PORT = 8123;
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn("python3", [path.join(ROOT, "scripts", "serve.py"), "--port", String(PORT), "--no-open"], {stdio: ["ignore", "pipe", "inherit"]});
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", chunk => {
      const m = String(chunk).match(/VIZZU_URL=(\S+)/);
      if (m) resolve(m[1]);
    });
    setTimeout(() => reject(new Error("El servidor no arrancó")), 10000);
  });
  const browser = await chromium.launch({args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
  const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
  const problems = [];
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", r => {
    const aborted = /api\.mapbox\.com/.test(r.url()) && r.failure()?.errorText === "net::ERR_ABORTED";
    if (!aborted) problems.push(`requestfailed: ${r.url().replace(/access_token=[^&]+/, "access_token=…")} ${r.failure()?.errorText}`);
  });
  page.on("response", r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  const check = (ok, text) => { if (!ok) problems.push(text); };
  const shot = async name => { await page.screenshot({path: path.join(OUT, `${name}.png`)}); console.log(`captura ${name}.png`); };
  const settle = async () => {
    await page.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, {timeout: 90000});
    await wait(2000);
  };
  const kpis = () => page.evaluate(() => ["kpiTotal", "kpiHigh", "kpiIndex"].map(id => document.getElementById(id).textContent));

  await page.goto(url);
  await settle();
  const usaKpis = await kpis();
  console.log("USA", usaKpis);
  check(usaKpis[0] === "7,728,394" && usaKpis[2] === "1.00×", "Los totales nacionales no cuadran");
  const painted = await page.evaluate(() => {
    const layer = overlay._deck?.props.layers.find(l => l.id === "states");
    const stats = DataCore.byAreaIndex(usa.areas, S.range, S.source, rates);
    return {features: layer ? layer.props.data.length : 0, withIndex: [...stats.values()].filter(c => c.e >= MIN_E).length};
  });
  console.log("mapa nacional:", painted);
  check(painted.features >= 49 && painted.withIndex >= 45, "El mapa nacional no tiene los estados con índice");
  await shot("01-usa");

  await page.locator("#contextChart").scrollIntoViewIfNeeded();
  const box = await page.locator("#contextChart").boundingBox();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width * (0.4 + 0.03 * i), box.y + box.height * 0.5);
    await wait(60);
  }
  await page.mouse.up();
  await wait(800);
  const period = await page.textContent("#periodLabel");
  const brushed = await kpis();
  console.log("brush", period, brushed);
  check(period !== "2016-01 a 2023-03" && brushed[0] !== usaKpis[0], "El brush no cambió el periodo ni los KPI");
  await page.click("#fullPeriod");
  await wait(500);

  await page.selectOption("#stateSelect", "CA");
  await settle();
  const matched = await page.evaluate(() => stateCounties.filter(f => countyOf(f)).length + " de " + stateCounties.length);
  console.log("California", await kpis(), "condados con datos:", matched);
  check(!matched.startsWith("0 "), "Ningún condado se emparejó con los datos");
  await page.click("#pinA");
  await shot("02-california");

  await page.evaluate(() => navigate("county", {county: "Los Angeles", countySlug: "los_angeles"}));
  await settle();
  console.log("Los Ángeles", await kpis());
  await page.click("#pinB");
  await wait(1500);
  const compareTitle = await page.textContent("#timeTitle");
  check(compareTitle.includes("A frente a B"), "La comparación A/B no se activó");
  await page.click("#clearPins");
  await wait(800);

  await page.evaluate(() => map.jumpTo({center: [-118.25, 34.05], zoom: 10}));
  await wait(1500);
  await page.click("#lassoBtn");
  const m = await page.locator("#mapStage").boundingBox();
  const cx = m.x + m.width * 0.5;
  const cy = m.y + m.height * 0.5;
  const r = m.height * 0.42;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) {
    const a = i / 39 * 2 * Math.PI;
    await page.mouse.move(cx + Math.cos(a) * r + r, cy + Math.sin(a) * r);
    await wait(15);
  }
  await page.mouse.up();
  await wait(1200);
  const radius = await page.evaluate(() => {
    const poly = window.ExplorerFilters.polygon();
    return poly.length ? Math.max(...poly.map(p => FilterCore.distanceKm(poly[0], p))) : null;
  });
  const profile = await page.textContent("#profileTitle");
  console.log("lazo: radio máximo", radius, "km ·", profile);
  check(radius !== null && radius <= 5.0001, "El lazo pasó de 5 km");
  check(profile.includes("lazo"), "El perfil no pasó a la muestra del lazo");
  await shot("03-lasso");
  await page.click("#clearLasso");

  await page.evaluate(() => navigate("city", {city: "Pasadena"}));
  await settle();
  const cityNote = await page.textContent("#profileNote");
  console.log("Pasadena", await kpis(), "·", cityNote.slice(0, 80));
  await shot("04-pasadena");

  await page.selectOption("#stateSelect", "KY");
  await settle();
  await page.evaluate(() => navigate("county", {county: "Hardin", countySlug: "hardin"}));
  await settle();
  await page.evaluate(() => navigate("city", {city: "Elizabethtown"}));
  await settle();
  const inView = await page.evaluate(() => {
    const [[w, south], [e, north]] = map.getBounds().toArray();
    const pad = 1e-6;
    const inside = r => r.Start_Lng >= w - pad && r.Start_Lng <= e + pad && r.Start_Lat >= south - pad && r.Start_Lat <= north + pad;
    return areaRows.filter(r => Number.isFinite(r.Start_Lng) && inside(r)).length + " de " + areaRows.length;
  });
  console.log("Elizabethtown: puntos dentro de la vista", inView);
  check(inView.split(" de ")[0] === inView.split(" de ")[1], "La vista de la ciudad no muestra todos sus accidentes");
  await shot("05-elizabethtown");

  await page.selectOption("#stateSelect", "SC");
  await settle();
  await page.click("#pinA");
  await page.selectOption("#stateSelect", "OH");
  await settle();
  await page.click("#pinB");
  await page.evaluate(() => navigate("usa"));
  await settle();
  await wait(1500);
  const pins = await page.textContent("#pinSummary");
  console.log("A/B:", pins);
  check(pins.includes("0.54×") && pins.includes("1.22×"), "Carolina del Sur y Ohio no dan 0.54× y 1.22×");
  await shot("06-sc-oh");

  console.log(problems.length ? `PROBLEMAS (${problems.length}):\n${[...new Set(problems)].join("\n")}` : "Sin errores de consola ni de red.");
  await browser.close();
  server.kill();
  process.exit(problems.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(2);
});
