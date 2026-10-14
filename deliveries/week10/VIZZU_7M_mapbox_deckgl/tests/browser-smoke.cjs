/* Run with node tests/browser-smoke.cjs. No npm install needed with the bundled runtime. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/alons/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname,'..');
// Occupy the requested port with a different app to reproduce the reported issue.
const server = http.createServer((request,response) => {
  response.writeHead(request.url === '/' ? 200 : 404,{'Content-Type':'text/html'}).end('<title>Otra aplicacion - graficas antiguas</title>');
});
(async () => {
  let browser, launcher, appURL, previousPort8000 = null;
  const shutdownToken = randomBytes(24).toString('hex');
  const errors = [], requests = [];
  try {
    try {
      const response = await fetch('http://127.0.0.1:8000/',{signal:AbortSignal.timeout(1200)});
      const text = await response.text();
      previousPort8000 = {title:text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.slice(0,120) || '(sin titulo)',hasClock:text.includes('id="hourClock"'),hasCurrentLines:text.includes('Semana vs. fin de semana')};
    } catch { /* No existing listener is also a valid initial condition. */ }
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    // Launch the actual BAT from another folder, rather than a separate test server.
    launcher = spawn('cmd.exe',['/d','/c','call',path.join(root,'run_server.bat'),'--no-open','--port',String(server.address().port)],{
      cwd:path.dirname(root),windowsHide:true,env:{...process.env,VIZZU_NO_PAUSE:'1',VIZZU_TEST_SHUTDOWN_TOKEN:shutdownToken}
    });
    let output = '';
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error(`BAT startup timed out: ${output}`)),20000);
      launcher.stdout.on('data',data => {
        output += data.toString();
        const match = output.match(/VIZZU_URL=(http:\/\/127\.0\.0\.1:[^\s]+)/);
        if (match) { appURL = match[1]; clearTimeout(timer); resolve(); }
      });
      launcher.stderr.on('data',data => { output += data.toString(); });
      launcher.once('error',error => { clearTimeout(timer); reject(error); });
      launcher.once('exit',code => { if (!appURL) { clearTimeout(timer); reject(new Error(`BAT exited (${code}): ${output}`)); } });
    });
    assert.notEqual(new URL(appURL).port,String(server.address().port),'An occupied port must not open the other application');
    const provenance = await (await fetch(new URL('/__vizzu_server__',appURL))).json();
    assert.equal(provenance.root.toLowerCase(),root.toLowerCase(),'BAT must always serve its own folder');
    assert.equal(provenance.layout,'radviz-clock-lasso-weekday-weekend');
    const scriptResponse = await fetch(new URL('/js/charts.js',appURL));
    assert.match(scriptResponse.headers.get('cache-control'),/no-store/);
    assert.equal(await scriptResponse.text(),fs.readFileSync(path.join(root,'js/charts.js'),'utf8'));
    browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page = await browser.newPage({viewport:{width:1440,height:1100}});
    page.on('pageerror',error => errors.push(error.message));
    page.on('request',request => requests.push(request.url()));
    const documentResponse = await page.goto(appURL,{waitUntil:'domcontentloaded'});
    assert.match(documentResponse.headers()['cache-control'],/no-store/);
    assert.equal(await page.locator('meta[name="vizzu-build"]').getAttribute('content'),provenance.version);
    assert.match(await page.locator('script[src*="js/charts.js"]').getAttribute('src'),/\?v=[a-f0-9]+$/);
    assert.equal(await page.locator('#parallelPlot, #infraChart, #analytics').count(),0);
    await page.waitForFunction(() => typeof overlay !== 'undefined' && overlay && cameraKey === 'usa',{timeout:60000});
    assert.equal(await page.locator('#climatePanel').isVisible(),false);
    await page.selectOption('#stateSelect','CA');
    await page.waitForFunction(() => currentSample.length > 0 && S.state === 'CA' && document.querySelector('#loading').classList.contains('hidden'));
    await page.waitForFunction(() => map.isStyleLoaded() && map.areTilesLoaded(),{timeout:60000});
    assert.equal(await page.locator('#error').isVisible(),false);
    assert.equal(await page.locator('#climatePanel').isVisible(),true);
    assert.equal(await page.locator('#roadPanel').isVisible(),true);
    const state = await page.evaluate(() => ({rows:currentSample.length,style:map.getStyle().name,pan:map.dragPan.isEnabled(),total:document.querySelector('#totalStat').textContent,rad:document.querySelectorAll('#weatherChart circle').length}));
    assert.ok(state.rows <= 2500 && state.rows > 0); assert.ok(state.pan); assert.ok(state.rad > 3);
    assert.equal(await page.locator('#timeChart .time-series').count(),2);
    assert.equal(await page.evaluate(() => currentSample.every(d => Number.isInteger(d.hour) && Number.isInteger(d.weekday))),true);
    await page.screenshot({path:path.join(root,'tests','state-view.png'),fullPage:true});
    await page.selectOption('#severitySelect','4');
    await page.waitForFunction(() => currentDisplay.every(row => row.Severity === 4));
    assert.equal(await page.locator('#totalStat').textContent(),state.total);
    await page.click('#resetFilters');
    await page.waitForFunction(() => currentDisplay.length === currentSample.length);
    await page.evaluate(() => navigate('county',{county:'Los Angeles',countySlug:'los_angeles'}));
    await page.waitForFunction(() => cameraKey === 'county/CA/Los Angeles/' && currentSample.length > 0);
    await page.evaluate(() => navigate('city',{city:'Los Angeles'}));
    await page.waitForFunction(() => cameraKey === 'city/CA/Los Angeles/Los Angeles' && currentSample.length > 0);
    const city = await page.evaluate(() => ({rows:currentSample.length,allCity:currentSample.every(d => d.City === 'Los Angeles'),total:document.querySelector('#totalStat').textContent}));
    assert.ok(city.allCity); assert.ok(city.rows <= 2500);
    await page.waitForFunction(() => !map.isMoving());
    // Draw a real freehand lasso around a visible accident (not a synthetic predicate).
    await page.click('#lassoBtn');
    const point = await page.evaluate(() => {
      map.stop();
      const width = document.querySelector('#map').clientWidth, height = document.querySelector('#map').clientHeight;
      return currentDisplay.map(row => map.project([row.Start_Lng,row.Start_Lat]))
        .filter(p => p.x>50 && p.x<width-50 && p.y>50 && p.y<height-50)
        .sort((a,b) => Math.hypot(a.x-width/2,a.y-height/2)-Math.hypot(b.x-width/2,b.y-height/2))[0];
    });
    assert.ok(point,'A visible accident is needed for the lasso test');
    const bounds = await page.locator('#lassoOverlay').boundingBox(), half = 35;
    const expectedIds = await page.evaluate(({point,half}) => currentDisplay.filter(row => {
      const p = map.project([row.Start_Lng,row.Start_Lat]);
      return p.x>=point.x-half && p.x<=point.x+half && p.y>=point.y-half && p.y<=point.y+half;
    }).map(row => row.ID).sort(),{point,half});
    const polygon = [[point.x-half,point.y-half],[point.x+half,point.y-half],[point.x+half,point.y+half],[point.x-half,point.y+half],[point.x-half,point.y-half]];
    await page.mouse.move(bounds.x+polygon[0][0],bounds.y+polygon[0][1]); await page.mouse.down();
    for (const [x,y] of polygon.slice(1)) await page.mouse.move(bounds.x+x,bounds.y+y,{steps:8});
    await page.mouse.up();
    await page.waitForFunction(() => ExplorerFilters.hasLasso() && currentDisplay.length < currentSample.length);
    const lassoCount = await page.evaluate(() => currentDisplay.length);
    assert.ok(lassoCount > 0,'The enclosed accident must be selected');
    const ids = await page.evaluate(() => currentDisplay.map(d => d.ID).sort());
    assert.deepEqual(ids,expectedIds,'Lasso membership must match an independently checked screen rectangle');
    await page.click('#hourSummary');
    await page.screenshot({path:path.join(root,'tests','lasso-clock-view.png'),fullPage:true});
    await page.click('#closeClock');
    await page.evaluate(() => { map.zoomTo(map.getZoom()+.25,{duration:0}); VizCharts.refresh(); });
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => currentDisplay.map(d => d.ID).sort()),ids,'Geographic selection must survive zoom');
    await page.click('#clearLasso');
    await page.waitForFunction(() => currentDisplay.length === currentSample.length);
    await page.click('#hourSummary');
    async function clockPoint(hour) {
      return page.evaluate(hour => {
        const svg = document.querySelector('#hourClock'), p = svg.createSVGPoint();
        p.x = 140+Math.sin((hour+.5)*Math.PI/12)*80; p.y = 140-Math.cos((hour+.5)*Math.PI/12)*80;
        const result = p.matrixTransform(svg.getScreenCTM()); return {x:result.x,y:result.y};
      },hour);
    }
    const eight = await clockPoint(8); await page.mouse.click(eight.x,eight.y);
    await page.waitForFunction(() => ExplorerFilters.getHours().size === 1 && currentDisplay.every(d => d.hour === 8));
    assert.ok((await page.locator('#timeChart .time-point').count()) === 2);
    // Paint continuously across midnight on the real dial.
    await page.click('#allHours');
    const late = await clockPoint(23), early = await clockPoint(0);
    await page.mouse.move(late.x,late.y); await page.mouse.down(); await page.mouse.move(early.x,early.y,{steps:8}); await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => [...ExplorerFilters.getHours()].sort((a,b) => a-b)),[0,23]);
    await page.click('#closeClock');
    await page.waitForFunction(() => currentDisplay.every(d => [0,23].includes(d.hour)));
    const lineCounts = await page.evaluate(() => [...document.querySelectorAll('#timeChart .time-point')].reduce((n,point) => n+Number(point.dataset.count),0));
    assert.equal(lineCounts,await page.evaluate(() => currentDisplay.length));
    await page.selectOption('#yearSelect','2023'); await page.selectOption('#sourceSelect','Source1');
    await page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => currentSample.every(d => d.year === 2023 && d.Source === 'Source1')),true);
    await page.click('#resetFilters');
    await page.waitForFunction(() => currentDisplay.length === currentSample.length && currentSample.length > 0);
    assert.equal(await page.evaluate(() => S.city),'Los Angeles');
    assert.equal(await page.evaluate(() => ExplorerFilters.getHours().size),24);
    assert.equal(await page.locator('#sourceSelect').inputValue(),'ALL');
    assert.equal(await page.locator('#yearSelect').inputValue(),'ALL');
    assert.equal(await page.locator('#severitySelect').inputValue(),'ALL');
    await page.setViewportSize({width:390,height:844});
    await page.click('#hourSummary');
    const mobileHour = await clockPoint(12); await page.mouse.click(mobileHour.x,mobileHour.y);
    await page.waitForFunction(() => [...ExplorerFilters.getHours()].join(',') === '12' && currentDisplay.every(d => d.hour === 12));
    await page.click('#closeClock');
    await page.click('#resetFilters');
    await page.waitForFunction(() => currentDisplay.length === currentSample.length);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'The mobile page should not overflow horizontally');
    await page.screenshot({path:path.join(root,'tests','mobile-view.png'),fullPage:true});
    // Rapid navigation: a late state request must not repaint the national view.
    await page.evaluate(() => {navigate('state',{state:'TX'}); navigate('state',{state:'NY'}); navigate('usa');});
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#climatePanel').isVisible(),false);
    assert.equal(await page.evaluate(() => S.level),'usa');
    assert.ok(!requests.some(url => url.endsWith('/accidents.csv')),'Browser must not request entire county CSVs');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({actualBAT:true,correctFolder:true,occupiedPortHandled:true,cacheDisabled:true,previousPort8000,state,city,lassoCount,clockCrossesMidnight:true,mobileClock:true,javascriptErrors:errors,accidentCSVRequests:0},null,2));
  } finally {
    if (browser) await browser.close();
    if (appURL) {
      await fetch(new URL('/__vizzu_test_shutdown__',appURL),{method:'POST',headers:{'X-Vizzu-Test-Token':shutdownToken},signal:AbortSignal.timeout(5000)});
      if (launcher.exitCode === null) await new Promise(resolve => launcher.once('close',resolve));
    } else launcher?.kill();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
