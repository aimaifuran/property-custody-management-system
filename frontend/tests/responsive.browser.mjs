// Browser audit against isolated API fixtures; no real accounts or database are changed.
// Run after npm.cmd run build: node tests/responsive.browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, access, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';

const dist = resolve(import.meta.dirname, '../dist');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.pdf': 'application/pdf' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let filename = resolve(dist, `.${pathname}`);
  if (!filename.startsWith(dist)) { response.writeHead(403).end(); return; }
  try { await access(filename); if (!extname(filename)) filename = join(dist, 'index.html'); }
  catch { filename = join(dist, 'index.html'); }
  try { response.setHeader('Content-Type', mime[extname(filename)] || 'application/octet-stream'); response.end(await readFile(filename)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'pcms-responsive-'));
let browserPath = process.env.BROWSER_PATH;
for (const candidate of ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe']) {
  if (!browserPath) { try { await access(candidate); browserPath = candidate; } catch { /* Try the next installed browser. */ } }
}
if (!browserPath) throw new Error('Set BROWSER_PATH to an installed Chromium browser.');
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(done => setTimeout(done, ms));
let ws;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await delay(100); }
  }
  assert.ok(port, 'Browser debugging port must open');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const browserInfo = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  ws = new WebSocket(browserInfo.webSocketDebuggerUrl);
  await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  let sessionId;
  const pending = new Map();
  const calls = [];
  const failures = [];
  let role = 'admin';
  let rejectLogin = false;
  const nextSequences = { IAR: 2, RIS: 2, ICS: 2, PAR: 2, PTR: 2, PRS: 2 };
  const nextNumber = type => type === 'IAR' ? String(nextSequences[type]).padStart(3, '0') : `2026-10-${String(nextSequences[type]).padStart(3, '0')}`;
  const id = '000000000000000000000001';
  const otherId = '000000000000000000000002';
  const date = '2026-10-08T08:00:00Z';
  const description = 'Office laptop with a long description and additional property details for responsive testing';
  const person = { user: id, name: 'Cherie Mae Long Accountable Officer Name', designation: 'Municipal Treasury and Administrative Services', position: 'Municipal Treasury and Administrative Services', date };
  const stock = { _id: 'stock-1', stockNumber: 'STOCK-000000000000001', description, unit: 'unit', quantityOnHand: 10, cost: 60000, itemType: 'ASSET' };
  const line = { _id: 'line-1', stockNumber: stock.stockNumber, description, unit: 'unit', quantityRequested: 1, quantityIssued: 1, quantity: 1, unitCost: 60000, totalCost: 60000, amount: 60000, unitValue: 60000, totalValue: 60000, propertyNumber: stock.stockNumber, inventoryItemNo: stock.stockNumber, mrNumber: '2026-10-001', quantityRemaining: 1, condition: 'Serviceable', ris: 'ris-1', risItem: 'line-1' };
  const asset = { _id: 'asset-1', user: id, employee: person.name, office: person.designation, inventory: { _id: 'inventory-1', item: stock, unitCost: 60000, purchaseDate: date, propertyNumber: stock.stockNumber }, formType: 'PAR', documentNumber: '2026-10-001', issuanceForm: 'par-1', acceptedAt: date, quantityRemaining: 1, quantity: 1, ris: 'ris-1', risItem: 'line-1' };
  const transferredDescription = 'Transferred laptop received from another office';
  const transferredAsset = { ...asset, _id: 'transferred-asset-1', ris: 'sender-ris-1', risItem: 'sender-line-1', documentNumber: '2026-10-099', issuanceForm: 'transferred-par-1', inventory: { ...asset.inventory, _id: 'transferred-inventory-1', item: { ...stock, _id: 'transferred-stock-1', stockNumber: 'TRANSFERRED-LAPTOP', description: transferredDescription } }, transferHistory: [{ from: otherId, to: id, fromDocumentNumber: '2026-10-098', toDocumentNumber: '2026-10-099', date }] };
  const form = { entityName: 'Municipality of Carigara', fundCluster: 'Trust Fund', office: person.designation, items: [line], receivedBy: person, issuedBy: person, receivedFrom: person, user: id, createdAt: date, totalAmount: 60000 };
  const ris = { ...form, _id: 'ris-1', risNumber: '2026-10-001', purpose: 'Daily office operations', requestedBy: person, approvedBy: person, status: 'PENDING_REVIEW', division: 'Finance', date };
  const ics = { ...form, _id: 'ics-1', icsNumber: '2026-10-001' };
  const par = { ...form, _id: 'par-1', parNumber: '2026-10-001' };
  const ptr = { ...form, _id: 'ptr-1', ptrNumber: '2026-10-001', fromUser: otherId, toUser: id, fromAccountableOfficer: 'Previous Custodian', toAccountableOfficer: person.name, reasonForTransfer: 'Office reassignment', transferType: 'Reassignment', date, approvedBy: person, items: [{ ...line, accountability: asset._id }] };
  const prs = { ...form, _id: 'prs-1', prsNumber: '2026-10-001', lguName: form.entityName, purpose: 'Returned To Stock', status: 'PENDING', submittedBy: id, returnedBy: person, returnedTo: person, items: [{ ...line, accountability: asset._id }] };
  const myReturn = { ...line, stockNumber: 'SUPPLY-PAPER', description: 'Office bond paper', unit: 'ream', itemType: 'SUPPLY', unitCost: 25, risId: 'ris-1', itemId: 'supply-line-1', risNumber: ris.risNumber, issued: true, formType: '', documentNumber: '', quantityIssued: 2, quantityRemaining: 2, quantityReturned: 0, returns: [], status: 'Not returned' };
  const ownedIssuedRow = { ...line, risId: 'ris-1', itemId: 'line-1', risNumber: ris.risNumber, issued: true, formType: 'PAR', documentNumber: par.parNumber, quantityReturned: 0, returns: [], status: 'Not returned' };
  const custodyReturns = [{ ...prs, _id: 'completed-custody-return', prsNumber: 'PRS-HISTORY-001', status: 'RETURNED', returnedTo: { ...person, name: 'Receiving Officer For Completed Return' }, items: [{ ...line, accountability: 'completed-asset-1', ris: 'historic-ris-1', risItem: 'historic-line-1', description: 'Previously returned office printer', mrNumber: '2026-10-050' }] }];
  const report = { _id: 'report-1', month: '2026-10', entityName: form.entityName, rows: [{ ...line, item: description, source: 'IAR', sourceId: 'iar-1', sourceRow: 0 }], recapitulation: [{ ...line, item: description }], items: [line] };
  const iarRecords = [{ ...form, _id: 'iar-1', iarNumber: '001', acceptanceStatus: 'Complete', iarDate: date }];
  const managedUsers = [
    { _id: id, firstName: 'Cherie Mae', lastName: 'Long Accountable Officer Name', username: 'responsive-test', role: 'admin', office: person.designation, division: 'Finance', email: 'test@example.test', permissions: ['canManageUsers', 'canViewRIS'], status: 'active', locked: false },
    ...Array.from({ length: 8 }, (_, index) => ({
      _id: `managed-user-${index + 1}`, firstName: `Office ${index + 1}`, lastName: index === 0 ? 'Accountable Officer With A Long Name' : 'Officer',
      username: `fixture-user-${index + 1}`, email: `officer${index + 1}@example.test`, office: index === 0 ? 'Municipal General Services and Administrative Office' : 'Supply Office',
      division: 'Administration', role: index === 1 ? 'admin' : 'user', permissions: ['canViewRIS'], status: 'active', locked: false,
    })),
  ];
  let expireNextIarSave = false;
  let refreshDenied = false;
  let registrationRequests = [];
  const fixture = path => {
    const user = { _id: id, firstName: 'Cherie Mae', lastName: 'Long Accountable Officer Name', username: 'responsive-test', role, office: person.designation, division: 'Finance', email: 'test@example.test', permissions: ['canViewRIS', 'canViewDashboard', 'canManageUsers', 'canManageInventory', 'canViewIAR', 'canManageIAR'] };
    if (path === '/auth/me') return { user };
    if (path.startsWith('/document-numbers')) return { nextNumber: nextNumber(path.split('/').at(-1)) };
    if (path === '/settings/entity-name') return { entityName: form.entityName };
    if (path.startsWith('/settings')) return {};
    if (path === '/users/password-reset-requests') return [];
    if (path === '/users') return managedUsers;
    if (path === '/registration') return registrationRequests;
    if (path === '/items' || path === '/ris/request-items') return [stock];
    if (path === '/ris') return [ris];
    if (path === '/ris/returnable-items') return [{ ...ris, status: 'ISSUED' }];
    if (/^\/users\/[^/]+\/records$/.test(path)) return { risRows: [{ ...myReturn, returns: [...myReturn.returns] }, ownedIssuedRow], assets: [asset, transferredAsset], returnSlips: [] };
    if (path === '/ris/my-items') return [{ ...myReturn, returns: [...myReturn.returns] }, ownedIssuedRow];
    if (path === '/ris/my-returns') return [myReturn, ownedIssuedRow];
    if (path === '/ics') return [ics];
    if (path === '/par') return [par];
    if (path === '/ptr') return [{ ...ptr, status: role === 'admin' ? 'PENDING_ADMIN' : 'PENDING_RECEIVER' }];
    if (path === '/prs') return [prs];
    if (path === '/custody/assets') return [asset, transferredAsset];
    if (path === '/custody/returns') return custodyReturns;
    if (path === '/custody/people') return [{ _id: otherId, name: 'Receiving Custodian With A Long Name', office: person.designation }];
    if (path === '/iar') return iarRecords;
    if (path === '/property-cards') return [{ ...form, _id: 'card-1', propertyNumber: stock.stockNumber, month: '2026-10' }];
    if (path === '/returned-supply') return [{ ...line, _id: 'supply-1', lguName: form.entityName, returnedBy: person, returnedTo: person }];
    if (path === '/suppliers') return [{ _id: 'supplier-1', name: 'Supplier With A Long Business Name', address: 'Municipality of Carigara, Leyte, Philippines', contactNumber: '09123456789' }];
    if (path === '/monthly-item-reports' || path === '/ppe-lists') return { report, records: [report] };
    if (path === '/ppe-station-reports') return { defaults: {}, records: [report] };
    if (path.endsWith('/summary')) return process.env.DASHBOARD_ONLY ? {
      counts: { iar: 120, propertyCards: 210, ris: 340, ics: 150, par: 200, ptr: 30, prs: 40, returnedSupply: 50, users: 80 },
      recentActivity: Array.from({ length: 30 }, (_, index) => ({ _id: `activity-${index}`, action: 'Property accountability updated', details: description, createdAt: date, user })),
      returnSlipBreakdown: [{ label: 'Serviceable', count: 25 }, { label: 'Unserviceable', count: 15 }],
      returnedSupplyBreakdown: [{ label: 'Returned', count: 30 }, { label: 'Received', count: 20 }],
      userBreakdown: [{ label: 'Admin', count: 5 }, { label: 'User', count: 75 }],
    } : { counts: {}, recentActivity: [], returnSlipBreakdown: [], returnedSupplyBreakdown: [], userBreakdown: [] };
    if (path.endsWith('/annual-office-items')) return { groups: [{ itemType: 'Laptops', quantity: 1, rows: [{ ...line, id: 'annual-1', office: person.designation, custodian: person.name, documentNumber: par.parNumber }], offices: [person.designation] }] };
    if (path.endsWith('/archive')) return [{ id: 'archive-1', type: 'PAR', documentNumber: par.parNumber, description, office: person.designation, employee: person.name, date }];
    return [];
  };
  const send = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(id, { done, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const job = pending.get(message.id); if (!job) return;
      clearTimeout(job.timer); pending.delete(message.id);
      if (message.error) job.reject(new Error(message.error.message)); else job.done(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      failures.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const path = new URL(request.url).pathname.replace(/^.*\/api/, '');
      calls.push({ path, method: request.method, body: request.postData });
      let data = request.method === 'GET' ? fixture(path) : {};
      let responseCode = request.method === 'OPTIONS' ? 204 : 200;
      let responseMessage = 'Recorded';
      if (request.method === 'POST' && path === '/registration') {
        const payload = JSON.parse(request.postData);
        delete payload.password; delete payload.confirmPassword;
        registrationRequests.push({ ...payload, _id: `registration-${registrationRequests.length}`, createdAt: date, status: 'PENDING' });
        responseCode = 201;
      }
      if (request.method === 'POST' && /^\/registration\/[^/]+\/(approve|reject)$/.test(path)) {
        const requestId = path.split('/')[2];
        const registration = registrationRequests.find(row => row._id === requestId);
        if (path.endsWith('/approve')) managedUsers.push({ ...registration, _id: `approved-${requestId}`, role: 'user', status: 'active', permissions: ['canViewRIS'] });
        registrationRequests = registrationRequests.filter(row => row._id !== requestId);
      }
      if (request.method === 'POST' && path === '/auth/login') {
        if (rejectLogin) { responseCode = 401; responseMessage = 'Invalid login details'; }
        else data = { accessToken: 'login-transition-fixture', user: fixture('/auth/me').user };
      }
      if (request.method === 'POST' && path === '/ics' && JSON.parse(request.postData || '{}').autoNumber) {
        data = { ...JSON.parse(request.postData), _id: 'created-ics', icsNumber: nextNumber('ICS') };
        nextSequences.ICS++;
      }
      if (request.method === 'POST' && path === '/auth/refresh') {
        if (refreshDenied) { responseCode = 401; responseMessage = 'Invalid token'; }
        else data = { accessToken: 'renewed-access-fixture', user: fixture('/auth/me').user };
      }
      if (request.method === 'POST' && path === '/ris/my-returns') {
        const payload = JSON.parse(request.postData || '{}');
        myReturn.pendingReturn = true;
        myReturn.status = 'Awaiting admin confirmation';
        myReturn.returns = [{ prsNumber: prs.prsNumber, quantity: payload.quantity, date, status: 'PENDING' }];
        data = { ...prs, items: [{ ...line, quantity: payload.quantity }] };
      }
      if (request.method === 'POST' && path === '/custody/returns') {
        const payload = JSON.parse(request.postData || '{}');
        const returnedAsset = [asset, transferredAsset].find(row => row._id === payload.accountability);
        data = { ...prs, _id: `pending-${returnedAsset._id}`, prsNumber: 'PRS-ASSET-001', status: 'PENDING', returnedTo: {}, items: [{ ...line, accountability: returnedAsset._id, ris: returnedAsset.ris, risItem: returnedAsset.risItem, quantity: Number(payload.quantity), description: returnedAsset.inventory.item.description, mrNumber: returnedAsset.documentNumber }] };
        returnedAsset.pendingMovement = `PRS:${data._id}`;
        custodyReturns.unshift(data);
      }
      if (request.method === 'POST' && path === '/prs/prs-1/confirm') {
        const payload = JSON.parse(request.postData || '{}');
        prs.status = 'RETURNED';
        prs.returnedTo = { ...payload.returnedTo };
        data = prs;
      }
      if (request.method === 'PUT' && path === '/prs/prs-1') {
        const payload = JSON.parse(request.postData || '{}');
        prs.returnedTo = { ...payload.returnedTo };
        data = prs;
      }
      if (request.method === 'POST' && path === '/iar') {
        if (expireNextIarSave || refreshDenied) {
          expireNextIarSave = false; responseCode = 401; responseMessage = 'Invalid token';
        } else {
          const payload = JSON.parse(request.postData);
          data = { ...payload, _id: `created-iar-${iarRecords.length}`, iarNumber: payload.autoNumber ? nextNumber('IAR') : payload.iarNumber };
          nextSequences.IAR = Math.max(nextSequences.IAR, Number(data.iarNumber) + 1);
          iarRecords.unshift(data); responseCode = 201;
        }
      }
      if (request.method === 'POST' && path === '/users') {
        const payload = JSON.parse(request.postData || '{}');
        delete payload.password;
        data = { ...payload, _id: payload.role === 'admin' ? 'created-managed-admin' : 'created-managed-user', status: 'active', locked: false };
        managedUsers.unshift(data);
        responseCode = 201;
      }
      if (request.method === 'PUT' && /^\/users\/[^/]+$/.test(path)) {
        const account = managedUsers.find(user => user._id === path.split('/').at(-1));
        const payload = JSON.parse(request.postData || '{}');
        delete payload.password;
        Object.assign(account, payload);
        data = account;
      }
      if (request.method === 'PATCH' && /^\/users\/[^/]+\/lock$/.test(path)) {
        const account = managedUsers.find(user => user._id === path.split('/').at(-2));
        account.locked = Boolean(JSON.parse(request.postData || '{}').locked);
        data = account;
      }
      if (request.method === 'PUT' && path.startsWith('/iar/')) {
        const saved = iarRecords.find(record => record._id === path.split('/').at(-1));
        data = { ...saved, ...JSON.parse(request.postData), lastEditedAt: date };
        Object.assign(saved, data);
      }
      send('Fetch.fulfillRequest', { requestId, responseCode, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Credentials', value: 'true' }, { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' }], body: Buffer.from(JSON.stringify({ success: responseCode < 400, message: responseMessage, data })).toString('base64') }).catch(error => failures.push(error.message));
    }
  });
  sessionId = (await send('Target.attachToTarget', { targetId: target.id, flatten: true })).sessionId;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*', requestStage: 'Request' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('pais_auth_token', 'isolated-responsive-fixture');` });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 50; attempt++) {
      await delay(100);
      if (await evaluate(expression)) return;
    }
    const state = await evaluate(`({ path: location.pathname, ready: document.readyState, text: document.body.textContent.slice(0, 300) })`);
    throw new Error(`Browser state did not settle: ${expression}; state ${JSON.stringify(state)}; exceptions ${JSON.stringify(failures)}`);
  };
  const navigate = async (path, expectedPath = path) => {
    await send('Page.navigate', { url: `${origin}${path}` });
    await delay(150);
    try {
      await waitFor(`location.pathname === ${JSON.stringify(expectedPath)} && document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(['/login', '/register'].includes(expectedPath) ? '.login-page' : 'main')}) && !document.querySelector('[aria-label="Loading page"], [data-form-loading]')`);
    } catch (error) {
      const state = await evaluate(`({ path: location.pathname, ready: document.readyState, main: !!document.querySelector('main'), text: document.body.textContent.slice(0, 300) })`);
      throw new Error(`${path} expected ${expectedPath}: ${error.message}; state ${JSON.stringify(state)}; exceptions ${JSON.stringify(failures)}`, { cause: error });
    }
  };
  const captureUserManagement = async name => {
    if (!process.env.USER_MANAGEMENT_SCREENSHOTS) return;
    const directory = resolve(import.meta.dirname, '../../.tmp-user-management-review');
    await mkdir(directory, { recursive: true });
    await evaluate(`window.scrollTo(0, 0)`);
    await delay(350);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(directory, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  };
  const completeRequiredDocumentFields = async () => {
    await evaluate(`(() => {
      for (const field of document.querySelectorAll('form input:required, form select:required, form textarea:required')) {
        if (field.matches(':disabled') || field.readOnly || field.value.trim()) continue;
        const value = field.type === 'date' ? '2026-10-08' : field.type === 'number' ? '1' : field.tagName === 'SELECT' ? [...field.options].find(option => option.value)?.value : 'Completed fixture detail';
        const prototype = field.tagName === 'SELECT' ? HTMLSelectElement.prototype : field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
        field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      }
    })()`);
    await delay(100);
  };
  if (process.env.DASHBOARD_ONLY) {
    for (const [width, height] of [[1024, 540], [1024, 600], [1280, 600], [1280, 720], [1366, 650], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await navigate('/dashboard');
      await waitFor(`document.querySelectorAll('.dashboard-page .recharts-surface').length === 4`);
      await delay(350);
      const layout = await evaluate(`(() => {
        const main = document.querySelector('main');
        const page = document.querySelector('.dashboard-page');
        const viewport = main.getBoundingClientRect();
        return {
          client: main.clientHeight, scroll: main.scrollHeight,
          horizontal: main.scrollWidth <= main.clientWidth + 1,
          bodyFits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          panels: [...page.querySelectorAll('.minimal-surface, .dashboard-activity')].map(panel => {
            const box = panel.getBoundingClientRect();
            return box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1 && box.left >= viewport.left - 1 && box.right <= viewport.right + 1;
          }),
          charts: [...page.querySelectorAll('.dashboard-return-chart, .monthly-report-chart, .annual-bar-chart')].map(chart => chart.getBoundingClientRect().height),
          activityScrolls: page.querySelector('.dashboard-activity > .overflow-y-auto').scrollHeight > page.querySelector('.dashboard-activity > .overflow-y-auto').clientHeight,
        };
      })()`);
      assert.ok(layout.scroll <= layout.client + 1, `${width}x${height}: dashboard fits vertically ${JSON.stringify(layout)}`);
      assert.ok(layout.horizontal && layout.bodyFits && layout.panels.every(Boolean), `${width}x${height}: all dashboard panels fit the viewport ${JSON.stringify(layout)}`);
      assert.ok(layout.charts.every(size => size >= 40), `${width}x${height}: charts remain visible ${JSON.stringify(layout)}`);
      assert.equal(layout.activityScrolls, true, 'Activity history scrolls inside its panel');
      assert.ok(await evaluate(`Math.abs(document.querySelector('.title-bar').getBoundingClientRect().bottom - document.querySelector('.sidebar-brand').getBoundingClientRect().bottom) <= 1`), 'Header lines up with the sidebar divider');
      console.log(`PASS dashboard fits ${width}x${height} without browser zoom or page scrolling.`);
    }
  } else if (process.env.FORM_VALIDATION_ONLY) {
    const writes = () => calls.filter(call => ['POST', 'PUT', 'PATCH'].includes(call.method));
    for (const route of ['/iar', '/inventory', '/ris', '/inventory-custodian', '/par', '/transfers', '/returns', '/returned-supply', '/users', '/suppliers', '/reports/monthly', '/reports/ppe-list', '/register']) {
      await navigate(route);
      await evaluate(`(document.querySelector('button[aria-label="New Form"]') || [...document.querySelectorAll('button')].find(button => button.textContent.includes('Create User')))?.click()`);
      await waitFor(`!!document.querySelector('form input:required, form textarea:required')`);
      await evaluate(`(() => {
        window.validationField = [...document.querySelectorAll('form input:required, form textarea:required')].find(field => !field.matches(':disabled') && !field.readOnly && field.getAttribute('aria-label') !== 'Entity Name');
        const field = window.validationField;
        if (!field) throw new Error('No editable required field');
        Object.getOwnPropertyDescriptor(field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(field, '');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await delay(100);
      const before = writes().length;
      await evaluate(`window.validationField.form.requestSubmit()`);
      await waitFor(`window.validationField.getAttribute('aria-invalid') === 'true' && !document.querySelector('.form-validation-errors')`);
      assert.equal(writes().length, before, `${route}: missing required text must not send a save request`);
      assert.equal(await evaluate(`getComputedStyle(window.validationField).outlineColor`), 'rgb(220, 38, 38)', `${route}: invalid field is red`);
      assert.equal(await evaluate(`document.activeElement.getAttribute('aria-invalid')`), 'true', `${route}: focus first error`);
      if (await evaluate(`window.validationField.type === 'text' || window.validationField.tagName === 'TEXTAREA'`)) {
        await evaluate(`(() => {
          const field = window.validationField;
          Object.getOwnPropertyDescriptor(field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(field, '   ');
          field.dispatchEvent(new Event('input', { bubbles: true })); field.form.requestSubmit();
        })()`);
        await delay(100);
        assert.equal(writes().length, before, `${route}: spaces-only text must not save`);
        assert.equal(await evaluate(`window.validationField.getAttribute('aria-invalid')`), 'true');
      }
      console.log(`PASS ${route}: incomplete form blocks saving and shows highlighted errors.`);
    }
    await navigate('/users');
    await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Create User')).click()`);
    await waitFor(`!!document.querySelector('#user-first-name')`);
    await evaluate(`(() => {
      const values = { 'user-first-name': 'Validation', 'user-last-name': 'Test', 'user-email': 'validation@example.test', 'user-username': 'validation', 'user-password': 'ValidPassword123!', 'user-office': 'Treasury', 'user-division': 'Finance' };
      for (const [id, value] of Object.entries(values)) {
        const field = document.getElementById(id);
        field.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    const before = calls.filter(call => call.path === '/users' && call.method === 'POST').length;
    await evaluate(`document.querySelector('#user-first-name').form.requestSubmit()`);
    for (let attempt = 0; attempt < 50 && calls.filter(call => call.path === '/users' && call.method === 'POST').length === before; attempt++) await delay(100);
    assert.equal(calls.filter(call => call.path === '/users' && call.method === 'POST').length, before + 1, 'Complete required fields permit exactly one save request');
    console.log('PASS complete required fields permit saving.');
  } else {
  await send('Page.navigate', { url: `${origin}/login` });
  await waitFor(`!!document.querySelector('button[aria-label="Sign in"]')`);
  const typeLoginCredentials = async username => {
    await evaluate(`(() => {
      for (const [id, value] of [['login-identifier', ${JSON.stringify(username)}], ['login-password', 'IsolatedFixture123!']]) {
        const field = document.getElementById(id);
        field.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
  };
  assert.deepEqual(await evaluate(`[document.getElementById('login-identifier').value, document.getElementById('login-password').value]`), ['', ''], 'Login starts with empty credentials');
  assert.deepEqual(await evaluate(`[document.getElementById('login-identifier').readOnly, document.getElementById('login-password').readOnly]`), [true, true], 'Untouched fields prevent browser autofill until typing');
  await send('Page.bringToFront');
  await delay(400);
  await evaluate(`(() => {
    const username = document.getElementById('login-identifier');
    const password = document.getElementById('login-password');
    username.value = 'restored-admin'; password.value = 'restored-password';
    username.focus(); password.focus();
  })()`);
  assert.deepEqual(await evaluate(`[document.getElementById('login-identifier').value, document.getElementById('login-password').value]`), ['', ''], 'Focusing clears browser-restored credentials before typing');
  const initialLoginRequests = calls.filter(call => call.path === '/auth/login').length;
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await waitFor(`!!document.querySelector('form [aria-invalid="true"]')`);
  assert.equal(await evaluate(`document.querySelector('.form-validation-errors, .form-required-hint')`), null, 'Login highlights required fields without validation messages');
  assert.equal(calls.filter(call => call.path === '/auth/login').length, initialLoginRequests, 'Empty credentials must not submit a login request');
  await typeLoginCredentials('incorrect-account');
  rejectLogin = true;
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await waitFor(`!document.querySelector('button[aria-label="Sign in"]').disabled`);
  await waitFor(`!document.querySelector('.form-loader--login-transition')`);
  assert.equal(await evaluate(`!!document.querySelector('.login-illustration-stage--signing-in')`), false, 'Failed login restores the original illustration');
  assert.equal(await evaluate(`location.pathname`), '/login', 'Failed login stays on the sign-in page');
  rejectLogin = false;
  for (const [loginRole, destination, width] of [['admin', '/dashboard', 1440], ['user', '/my-issued-items', 375]]) {
    role = loginRole;
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${origin}/login` });
    await waitFor(`!!document.querySelector('button[aria-label="Sign in"]')`);
    assert.deepEqual(await evaluate(`[document.getElementById('login-identifier').value, document.getElementById('login-password').value]`), ['', ''], `${loginRole}: reopening login clears credentials`);
    await typeLoginCredentials(`${loginRole}-fixture`);
    await evaluate(`document.querySelector('form').requestSubmit()`);
    await waitFor(`!!document.querySelector('.form-loader--login-transition')`);
    const started = Date.now();
    assert.equal(await evaluate(`!!document.querySelector('.login-card__form') && !!document.querySelector('.login-card__illustration .form-loader--login-transition')`), true, 'Laptop appears beside the existing login form');
    assert.equal(await evaluate(`document.querySelector('button[aria-label="Sign in"]').disabled`), true, 'Successful login keeps duplicate submits disabled');
    assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Sign in"] .login-hourglass .hourglassBackground')`), true, 'Login button uses the circular hourglass loader');
    assert.equal(await evaluate(`document.querySelector('button[aria-label="Sign in"] .skeleton')`), null, 'Login button has no skeleton');
    assert.equal(await evaluate(`document.querySelector('.form-loader--full-screen')`), null, 'Login animation stays inside the illustration panel');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.form-loader__progress'), '::after').animationIterationCount`), '1', 'Login animation plays once');
    await delay(1000);
    assert.equal(await evaluate(`location.pathname`), '/login', 'Dashboard waits while animation plays');
    await waitFor(`location.pathname === ${JSON.stringify(destination)} && !!document.querySelector('main') && !document.querySelector('[aria-label="Loading page"]')`);
    assert.ok(Date.now() - started >= 1700, 'Successful login displays the animation for approximately two seconds');
    assert.equal(await evaluate(`!!document.querySelector('.form-loader--login-transition')`), false, 'Laptop disappears after navigation');
  }
  role = 'admin';
  console.log('PASS inline desktop/mobile login animation, admin/user timing, and failed-login restoration.');
  await navigate('/login');
  assert.equal(await evaluate(`document.querySelector('.form-required-hint')`), null, 'Sign in has no required-fields sentence');
  assert.equal(await evaluate(`!!document.querySelector('a[href="/register"]')`), true, 'Sign in links to registration');
  await navigate('/register');
  await waitFor(`!!document.querySelector('input[name="position"]')`);
  for (const width of [320, 375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), `Registration @${width} fits viewport`);
  }
  const beforeRegistration = calls.filter(call => call.path === '/registration' && call.method === 'POST').length;
  await evaluate(`document.querySelector('form').requestSubmit()`);
  assert.equal(calls.filter(call => call.path === '/registration' && call.method === 'POST').length, beforeRegistration, 'Blank registration is blocked');
  const applicant = { firstName: 'Applicant', lastName: 'Registration Test', email: 'registration-browser@example.test', username: 'registration-browser', office: 'Municipal Planning Office', division: 'Planning', position: 'Administrative Officer', password: 'Registration123!', confirmPassword: 'Registration123!' };
  await evaluate(`(() => { for (const [key, value] of Object.entries(${JSON.stringify(applicant)})) { const input = document.querySelector('input[name="' + key + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await waitFor(`document.querySelector('main') === null && document.body.textContent.includes('Request sent')`);
  assert.equal(await evaluate(`document.querySelector('form')`), null, 'Registration success clears password form');
  assert.equal(JSON.parse(calls.findLast(call => call.path === '/registration' && call.method === 'POST').body).position, applicant.position, 'Registration includes LGU position');
  await navigate('/users');
  await waitFor(`!!document.querySelector('.registration-request-card')`);
  assert.ok(await evaluate(`document.querySelector('.registration-request-card').textContent.includes('Administrative Officer')`), 'Admin sees LGU position in the request');
  await evaluate(`document.querySelector('.registration-request-card .registration-approve').click()`);
  await waitFor(`!document.querySelector('.registration-request-card') && document.querySelector('[aria-label="Office accounts"]').textContent.includes('@registration-browser')`);
  assert.ok(calls.some(call => call.path === '/registration/registration-0/approve' && call.method === 'POST'), 'Admin approval creates the user in the directory');
  console.log('PASS registration link, responsive form, required validation, request submission and admin approval.');

  if (!process.env.LOGIN_ONLY) {
  const widths = [320, 375, 768, 1024, 1440];
  const routes = {
    admin: ['/dashboard', '/iar', '/inventory', '/ris', '/inventory-custodian', '/par', '/transfers', '/returns', '/returned-supply', '/users', '/suppliers', '/reports/monthly', '/reports/annual', '/reports/ppe-list', '/historical-records', '/profile'],
    user: ['/my-issued-items', '/my-returns'],
  };
  let checks = 0;
  for (const currentRole of ['admin', 'user']) {
    role = currentRole;
    for (const route of routes[currentRole]) {
      await navigate(route);
      if (currentRole === 'user') {
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#app-sidebar nav a')].map(link => ({ path: link.getAttribute('href'), text: link.textContent.trim() }))`), [
          { path: '/my-issued-items', text: 'Issued Items' },
          { path: '/my-returns', text: 'Returned Items' },
          { path: '/about', text: 'About' },
        ], 'User workspace shows exactly Issued Items and Returned Items');
        if (route === '/my-issued-items') {
          assert.equal(await evaluate(`[...document.querySelectorAll('main a, main button')].some(control => control.textContent.includes('View Returned Items'))`), false, 'Issued Items has no extra View Returned Items control');
        }
      } else if (route === '/dashboard') {
        await evaluate(`[...document.querySelectorAll('#app-sidebar button[aria-expanded="false"]')].filter(button => ['Issue', 'Reports'].includes(button.textContent.trim())).forEach(button => button.click())`);
        await delay(250);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#app-sidebar nav a')].map(link => link.getAttribute('href')).sort()`), [...routes.admin.filter(path => !['/suppliers', '/users', '/profile'].includes(path)), '/about'].sort(), 'Admin retains the full existing workspace menu');
      }
      await evaluate(`document.querySelector(${JSON.stringify(currentRole === 'admin' ? 'button[aria-label="New Form"]' : '.record-action--edit')})?.click()`);
      await delay(250);
      if (currentRole === 'admin' && route === '/inventory') {
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('form table thead th')].map(cell => cell.textContent.replaceAll('*', '').trim())`), ['Date', 'Reference PAR No.', 'Receipt Qty', 'ITD Qty', 'ITD Office/Officer', 'Balance Qty', 'Amount', 'Remarks'], 'Property Card shows only the remaining columns');
        assert.equal(await evaluate(`document.querySelectorAll('form input[aria-label="Property Number"], form input[aria-label="Description"], form input[aria-label="S/N"]').length`), 3, 'Property Card retains Property Number, Description, and S/N at the top');
      }
      if (currentRole === 'admin' && route === '/reports/ppe-list') {
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('.ppe-station-form table thead th')].map(cell => cell.textContent.replaceAll('*', '').trim())`), ['ARTICLE/ITEM', 'DESCRIPTION', 'NEW PROPERTY NO. ASSIGNED', 'PERSON ACCOUNTABLE', 'UNIT COST / VALUE', 'TOTAL COST / VALUE', 'REMARKS'], 'List of PPEs preserves all seven table columns');
        await evaluate(`(() => {
          const description = document.querySelector('.ppe-station-form textarea[aria-label="DESCRIPTION, row 1"]');
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(description, 'Long office equipment details\\n'.repeat(20));
          description.dispatchEvent(new Event('input', { bubbles: true }));
          for (const input of document.querySelectorAll('.ppe-station-form table input[type="number"]')) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '350000.00');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()`);
      }
      const numberType = { '/iar': 'IAR', '/ris': 'RIS', '/inventory-custodian': 'ICS', '/par': 'PAR', '/transfers': 'PTR', '/returns': 'PRS' }[route];
      if (currentRole === 'admin' && route === '/users') {
        await waitFor(`document.querySelectorAll('.user-account-record').length >= 3`);
        assert.equal(await evaluate(`!!document.querySelector('dialog form')`), false, 'Account creation form starts hidden');
        assert.equal(await evaluate(`[...document.querySelectorAll('.user-management-page button')].filter(button => button.textContent.trim() === 'Create User').length`), 1, 'User Management offers one Create User action');
        assert.ok(await evaluate(`[...document.querySelectorAll('.user-account-record')].some(card => card.textContent.includes('@fixture-user-1') && card.textContent.includes('Municipal General Services and Administrative Office'))`), 'Account cards show username and office with long names');
      }
      if (currentRole === 'admin' && numberType) {
        const number = await evaluate(`(() => { const input = document.querySelector('[aria-label="${numberType} No."]'); return { value: input?.value, readOnly: input?.readOnly }; })()`);
        assert.equal(number.value, nextNumber(numberType), `${numberType}: existing new form displays the next number`);
        assert.equal(number.readOnly, numberType !== 'IAR', `${numberType}: IAR accepts an entered number; other previews stay automatic`);
      }
      for (const width of widths) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
        await delay(100);
        const layout = await evaluate(`(() => {
          const main = document.querySelector('main');
          return { path: location.pathname, page: [document.documentElement.clientWidth, document.documentElement.scrollWidth], workspace: main ? [main.clientWidth, main.scrollWidth] : [], tables: [...document.querySelectorAll('.table-scroll')].map(table => [Math.round(table.getBoundingClientRect().width), Math.round(table.querySelector('.table-scroll__content').getBoundingClientRect().width)]), outliers: [...document.querySelectorAll('main input, main select, main textarea, main button')].filter(element => element.getClientRects().length && !element.closest('.table-scroll__content') && element.getBoundingClientRect().right > main.getBoundingClientRect().right + 2).map(element => element.outerHTML.slice(0, 120)) };
        })()`);
        assert.equal(layout.path, route, `${currentRole}: ${route} must remain accessible`);
        assert.ok(layout.page[1] <= layout.page[0] + 1, `${currentRole} ${route} @${width}: page overflow ${JSON.stringify(layout)}`);
        assert.ok(!layout.workspace.length || layout.workspace[1] <= layout.workspace[0] + 1, `${currentRole} ${route} @${width}: workspace overflow ${JSON.stringify(layout)}`);
        assert.equal(layout.outliers.length, 0, `${currentRole} ${route} @${width}: controls must fit ${JSON.stringify(layout.outliers)}`);
        if (currentRole === 'admin' && route === '/users') {
          const cards = await evaluate(`(() => {
            const grid = document.querySelector('[aria-label="Office accounts"]');
            const boxes = [...grid.querySelectorAll('.user-account-record')].map(card => card.getBoundingClientRect());
            const firstTop = boxes[0].top;
            return { columns: boxes.filter(box => Math.abs(box.top - firstTop) <= 1).length, visible: boxes.length, clipped: grid.scrollWidth > grid.clientWidth + 1 };
          })()`);
          assert.ok(cards.visible >= 3 && !cards.clipped, `User Management @${width}: account cards stay visible without horizontal scrolling`);
          if (width <= 375) assert.equal(cards.columns, 1, `User Management @${width}: accounts use one readable column`);
          if (width >= 1024) assert.ok(cards.columns >= 2, `User Management @${width}: accounts use a multi-column grid`);
        }
        if (currentRole === 'admin' && route === '/reports/ppe-list') {
          const fields = await evaluate(`(() => {
            const row = document.querySelector('.ppe-station-form tbody tr');
            const controls = [...row.querySelectorAll('input, textarea')];
            const canvas = document.createElement('canvas').getContext('2d');
            return {
              stacked: getComputedStyle(row).display === 'block',
              controls: controls.map(control => {
                const style = getComputedStyle(control), box = control.getBoundingClientRect(), cell = control.closest('td').getBoundingClientRect();
                canvas.font = style.fontSize + ' ' + style.fontFamily;
                return { height: box.height, top: box.top, inside: box.left >= cell.left && box.right <= cell.right + 1, resize: style.resize, value: control.value, available: control.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), valueWidth: canvas.measureText(control.value).width, type: control.type };
              }),
              descriptionScrolls: controls[1].scrollHeight > controls[1].clientHeight,
            };
          })()`);
          assert.equal(fields.controls.length, 7, `List of PPEs @${width}: all existing fields remain available`);
          assert.equal(new Set(fields.controls.map(control => control.height)).size, 1, `List of PPEs @${width}: text boxes have the same height ${JSON.stringify(fields)}`);
          assert.ok(fields.controls.every(control => control.height >= 80 && control.inside), `List of PPEs @${width}: fields have comfortable space inside their cells`);
          assert.ok(fields.controls.filter(control => control.type === 'textarea').every(control => control.resize === 'none'), `List of PPEs @${width}: resizing cannot break row alignment`);
          assert.ok(fields.descriptionScrolls, `List of PPEs @${width}: long descriptions remain available by scrolling`);
          assert.ok(fields.controls.filter(control => control.type === 'number').every(control => control.value === '350000.00' && control.valueWidth <= control.available), `List of PPEs @${width}: normal money values fit their text boxes`);
          if (!fields.stacked) assert.ok(Math.max(...fields.controls.map(control => control.top)) - Math.min(...fields.controls.map(control => control.top)) <= 1, `List of PPEs @${width}: desktop text boxes align at the top`);
        }
        checks++;
      }
      console.log(`PASS ${currentRole} ${route}: ${widths.join(', ')}px`);
    }
  }
  role = 'admin';
  await navigate('/profile');
  await waitFor(`!!document.querySelector('[aria-label="My account details"]')`);
  assert.equal(await evaluate(`document.querySelectorAll('form, dialog').length`), 0, 'My Profile initially shows only account details');
  assert.equal(await evaluate(`[...document.querySelectorAll('main button')].some(button => button.textContent.trim() === 'Add Admin')`), false, 'Add Admin moved out of My Profile');
  assert.ok(await evaluate(`document.querySelector('.admin-profile-card').getBoundingClientRect().width >= document.querySelector('main').clientWidth - 60`), 'My Profile card fills the available width');
  await navigate('/users');
  await waitFor(`!!document.querySelector('.admin-account-section')`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Add Admin').click()`);
  await waitFor(`!!document.querySelector('dialog form')`);
  assert.ok(await evaluate(`[...document.querySelectorAll('dialog input')].every(input => input.value === '')`), 'Add Admin opens blank fields');
  const adminCalls = calls.filter(call => call.path === '/users' && call.method === 'POST').length;
  await evaluate(`document.querySelector('dialog form').requestSubmit()`);
  assert.equal(calls.filter(call => call.path === '/users' && call.method === 'POST').length, adminCalls, 'Empty admin form does not save');
  await evaluate(`(() => {
    const values = { 'First Name': 'New', 'Last Name': 'Administrator', Email: 'new-admin@example.test', Username: 'new-administrator', Password: 'AdminFixture123!', 'Confirm Password': 'AdminFixture123!', Office: 'Supply Office', Division: 'Administration' };
    for (const [label, value] of Object.entries(values)) { const input = document.querySelector('dialog input[aria-label="' + label + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }
  })()`);
  await evaluate(`document.querySelector('dialog form').requestSubmit()`);
  await waitFor(`!document.querySelector('dialog')`);
  const adminCreation = calls.findLast(call => call.path === '/users' && call.method === 'POST');
  assert.equal(JSON.parse(adminCreation.body).role, 'admin', 'Add Admin creates an administrator');
  assert.equal(await evaluate(`document.querySelectorAll('form').length`), 0, 'Admin form closes after saving');
  await navigate('/users');
  await waitFor(`!!document.querySelector('.user-account-grid')`);
  assert.equal(await evaluate(`document.querySelectorAll('.user-management-stats .user-stat').length`), 0, 'Account summary cards are removed');
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Office accounts"] .user-account-record').length`), managedUsers.filter(account => account.role === 'user').length, 'User section lists only user accounts');
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Administrator accounts"] .user-account-record').length`), managedUsers.filter(account => account.role === 'admin').length, 'Admin section lists administrators');
  assert.ok(await evaluate(`document.querySelector('.admin-account-section').getBoundingClientRect().bottom < document.querySelector('[aria-label="Office accounts"]').getBoundingClientRect().top`), 'Admin accounts appear above the divider and user accounts');
  assert.equal(await evaluate(`document.querySelectorAll('.user-directory-heading, .user-role-filters').length`), 0, 'Account heading and role tabs are removed');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Search office accounts"]')`), null, 'Account search bar is removed');
  const beforeRecords = calls.length;
  await evaluate(`document.querySelector('button[aria-label="Actions for fixture-user-1"]').click()`);
  await waitFor(`!![...document.querySelectorAll('.user-card-menu button')].find(button => button.textContent.trim() === 'View Records')`);
  await evaluate(`[...document.querySelectorAll('.user-card-menu button')].find(button => button.textContent.trim() === 'View Records').click()`);
  await waitFor(`!!document.querySelector('.user-records-table')`);
  assert.ok(await evaluate(`document.querySelector('.user-records-dialog').textContent.includes('Returned items')`), 'Read-only records include returned items');
  assert.equal(await evaluate(`document.querySelectorAll('.user-records-dialog input, .user-records-dialog form').length`), 0, 'Records have no editable fields');
  assert.ok(calls.slice(beforeRecords).every(call => ['GET', 'OPTIONS'].includes(call.method)), 'Viewing records performs only GET requests');
  await evaluate(`document.querySelector('[aria-label="Close user records"]').click()`);
  await waitFor(`!document.querySelector('.user-records-dialog')`);
  const openUserEditor = async () => {
    await evaluate(`[...document.querySelectorAll('.user-management-page button')].find(button => button.textContent.trim() === 'Create User').click()`);
    await waitFor(`!!document.querySelector('dialog form')`);
  };
  const fillUserField = async (label, value) => {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(`dialog [aria-label="${label}"]`)});
      Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    })()`);
  };
  for (const width of [320, 375, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    if (width !== 320) await captureUserManagement(`accounts-${width}`);
    await openUserEditor();
    const editorLayout = await evaluate(`(() => {
      const dialog = document.querySelector('dialog');
      const box = dialog.getBoundingClientRect();
      return { left: box.left, right: box.right, viewport: innerWidth, client: dialog.clientWidth, scroll: dialog.scrollWidth, firstName: dialog.querySelector('[aria-label="First Name"]').value,
        footerFits: [...dialog.querySelectorAll('.user-editor-footer button')].every(button => { const buttonBox = button.getBoundingClientRect(); return buttonBox.top >= box.top && buttonBox.bottom <= box.bottom; }) };
    })()`);
    assert.ok(editorLayout.left >= 0 && editorLayout.right <= editorLayout.viewport + 1 && editorLayout.scroll <= editorLayout.client + 1, `Create User @${width}: editor fits the viewport ${JSON.stringify(editorLayout)}`);
    assert.equal(editorLayout.firstName, '', 'Create User opens a blank account editor');
    assert.ok(editorLayout.footerFits, `Create User @${width}: Cancel and Save remain fully visible in the dialog`);
    if (width !== 320) await captureUserManagement(`create-user-${width}`);
    await evaluate(`[...document.querySelectorAll('dialog button')].find(button => button.textContent.trim() === 'Cancel').click()`);
    await waitFor(`!document.querySelector('dialog')`);
  }
  await openUserEditor();
  await fillUserField('First Name', 'Unsaved');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor(`!document.querySelector('dialog')`);
  assert.equal(await evaluate(`document.activeElement.textContent.trim()`), 'Create User', 'Closing the editor restores focus to Create User');
  await openUserEditor();
  assert.equal(await evaluate(`document.querySelector('dialog [aria-label="First Name"]').value`), '', 'Cancelled account details do not return on reopening');
  const newAccount = { firstName: 'New', lastName: 'Office User', email: 'new-user@example.test', username: 'new-office-user', password: 'IsolatedFixture123!', office: 'Supply Office', division: 'Administration', role: 'user' };
  for (const [key, label] of Object.entries({ firstName: 'First Name', lastName: 'Last Name', email: 'Email', username: 'Username', password: 'Password', office: 'Office', division: 'Division' })) await fillUserField(label, newAccount[key]);
  await evaluate(`document.querySelector('dialog form').requestSubmit()`);
  await waitFor(`!document.querySelector('dialog') && document.querySelector('[aria-label="Office accounts"]')?.textContent.includes('@new-office-user')`);
  const creation = calls.findLast(call => call.path === '/users' && call.method === 'POST');
  assert.ok(creation, 'Create User submits through the existing users endpoint');
  const createdPayload = JSON.parse(creation.body);
  for (const [key, value] of Object.entries(newAccount)) assert.equal(createdPayload[key], value, `Create User preserves ${key}`);
  assert.ok(Array.isArray(createdPayload.permissions), 'Create User preserves the page access payload');
  const fixtureAccount = managedUsers.find(user => user.username === 'fixture-user-1');
  await evaluate(`document.querySelector('button[aria-label="Actions for fixture-user-1"]').click()`);
  await waitFor(`!![...document.querySelectorAll('[aria-label="Account actions for fixture-user-1"] button')].find(button => button.textContent.trim() === 'Edit user')`);
  await evaluate(`[...document.querySelectorAll('[aria-label="Account actions for fixture-user-1"] button')].find(button => button.textContent.trim() === 'Edit user').click()`);
  await waitFor(`!!document.querySelector('dialog form')`);
  assert.equal(await evaluate(`document.querySelector('dialog [aria-label="Username"]').value`), fixtureAccount.username, 'Edit opens the selected existing account');
  assert.equal(await evaluate(`document.querySelector('dialog [aria-label="Office"]').value`), fixtureAccount.office, 'Edit retains the selected account office');
  assert.equal(await evaluate(`document.querySelector('dialog [aria-label="Password"]').value`), '', 'Editing does not expose the saved password');
  await fillUserField('Office', 'Updated General Services Office');
  await evaluate(`document.querySelector('dialog form').requestSubmit()`);
  await waitFor(`!document.querySelector('dialog') && document.querySelector('[aria-label="Office accounts"]')?.textContent.includes('Updated General Services Office')`);
  const update = calls.findLast(call => call.path === `/users/${fixtureAccount._id}` && call.method === 'PUT');
  assert.ok(update, 'Edit submits only the selected account to its existing endpoint');
  assert.equal(JSON.parse(update.body).office, 'Updated General Services Office');
  assert.equal(Object.hasOwn(JSON.parse(update.body), 'password'), false, 'Blank edit password preserves the existing password');
  await evaluate(`document.querySelector('button[aria-label="Actions for fixture-user-1"]').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Account lock for fixture-user-1"]')`);
  await evaluate(`document.querySelector('[aria-label="Account lock for fixture-user-1"]').click()`);
  await waitFor(`document.querySelector('[aria-label="Office accounts"]')?.textContent.includes('Locked')`);
  assert.equal(fixtureAccount.locked, true, 'Card actions retain account locking');
  assert.deepEqual(JSON.parse(calls.findLast(call => call.path === `/users/${fixtureAccount._id}/lock` && call.method === 'PATCH').body), { locked: true }, 'Lock action uses the existing lock endpoint');
  console.log('PASS User Management card grid, hidden create form, responsive editor, cancellation, user creation, account editing, and locking.');
  await navigate('/inventory-custodian');
  await waitFor(`!!document.querySelector('button[aria-label="New Form"]')`);
  await evaluate(`document.querySelector('button[aria-label="New Form"]').click()`);
  await delay(200);
  await evaluate(`(() => {
    for (const [label, value] of [['Description', 'Office chair'], ['Quantity', '1']]) {
      const input = document.querySelector('input[aria-label="' + label + '"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await completeRequiredDocumentFields();
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await delay(250);
  assert.ok(calls.some(call => call.path === '/ics' && call.method === 'POST' && JSON.parse(call.body).autoNumber === true), 'Existing ICS submit requests server numbering');
  await evaluate(`document.querySelector('button[aria-label="New Form"]').click()`);
  await delay(200);
  assert.equal(await evaluate(`document.querySelector('[aria-label="ICS No."]').value`), '2026-10-003', 'The next editor advances after a successful save');
  await evaluate(`document.querySelector('.record-action--edit').click()`);
  await delay(150);
  assert.equal(await evaluate(`document.querySelector('[aria-label="ICS No."]').value`), '2026-10-001', 'Editing preserves the saved number');
  await navigate('/iar');
  const fillIar = async number => {
    await evaluate(`document.querySelector('button[aria-label="New Form"]').click()`);
    await delay(200);
    await evaluate(`(() => {
      for (const [label, value] of ${JSON.stringify([['IAR No.', number], ['stockPropertyNumber', 'BROWSER-PAPER'], ['description', 'Received office paper'], ['unit', 'ream'], ['Quantity', '2']])}) {
        const input = document.querySelector('input[aria-label="' + label + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await completeRequiredDocumentFields();
  };
  await fillIar('12');
  assert.equal(await evaluate(`document.querySelector('[aria-label="IAR No."]').validity.patternMismatch`), true, 'IAR rejects fewer than three digits');
  await fillIar('a0b1c0d2e9');
  assert.equal(await evaluate(`document.querySelector('[aria-label="IAR No."]').value`), '0102', 'IAR removes letters, preserves leading zeros, and limits input to four digits');
  const initialIarSaves = calls.filter(call => call.path === '/iar' && call.method === 'POST').length;
  expireNextIarSave = true;
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`[...document.querySelectorAll('.saved-record')].some(record => record.textContent.includes('0102'))`);
  const savedCalls = calls.filter(call => call.path === '/iar' && call.method === 'POST').slice(initialIarSaves);
  assert.equal(savedCalls.length, 2, 'Expired IAR save retries exactly once after refreshing the session');
  assert.equal(savedCalls[0].body, savedCalls[1].body, 'Retry preserves the filled IAR payload');
  assert.equal(JSON.parse(savedCalls[1].body).autoNumber, false, 'Entered IAR number is preserved');
  assert.equal(await evaluate(`localStorage.getItem('pais_auth_token')`), 'renewed-access-fixture');
  assert.equal(iarRecords.filter(record => record.iarNumber === '0102').length, 1, 'Receipt is saved once');
  await fillIar('0103');
  refreshDenied = true;
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`!!document.querySelector('form [role="alert"]')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="IAR No."]').value`), '0103', 'Failed session recovery keeps the current form');
  assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('pams.iar-draft.${id}')).form.iarNumber`), '0103');
  refreshDenied = false;
  await navigate('/iar');
  assert.equal(await evaluate(`document.querySelector('[aria-label="IAR No."]').value`), '0103', 'Same account restores its unsaved IAR after signing in');
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`[...document.querySelectorAll('.saved-record')].some(record => record.textContent.includes('0103'))`);
  assert.equal(await evaluate(`sessionStorage.getItem('pams.iar-draft.${id}')`), null, 'Successful save clears the recovered draft');
  const oldDraft = { form: { ...JSON.parse(savedCalls[1].body), iarNumber: '2026-10-005' }, editingId: null, numberEdited: true };
  await evaluate(`sessionStorage.setItem('pams.iar-draft.${id}', ${JSON.stringify(JSON.stringify(oldDraft))})`);
  const migratedNumber = nextNumber('IAR');
  await navigate('/iar');
  await waitFor(`document.querySelector('[aria-label="IAR No."]').value === ${JSON.stringify(migratedNumber)}`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="description"]').value`), 'Received office paper', 'Old unsaved draft keeps its received item details');
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`[...document.querySelectorAll('.saved-record')].some(record => record.textContent.includes(${JSON.stringify(migratedNumber)}))`);
  // The saved row appears before the follow-up record reload finishes. Wait for
  // the save action to complete before replacing storage with the next draft.
  await waitFor(`document.querySelector('form button[type="submit"]')?.disabled === false && document.querySelector('form')?.getAttribute('aria-busy') === 'false'`);
  assert.equal(JSON.parse(calls.findLast(call => call.path === '/iar' && call.method === 'POST').body).autoNumber, true, 'Old new-form draft saves with a current numeric number');
  const legacyRecord = { ...JSON.parse(savedCalls[1].body), _id: 'legacy-iar-1', iarNumber: '2026-10-001' };
  iarRecords.push(legacyRecord);
  const oldEditDraft = { form: { ...legacyRecord, supplierName: 'Corrected supplier' }, editingId: legacyRecord._id, numberEdited: true };
  await evaluate(`sessionStorage.setItem('pams.iar-draft.${id}', ${JSON.stringify(JSON.stringify(oldEditDraft))})`);
  await navigate('/iar');
  assert.equal(await evaluate(`document.querySelector('[aria-label="IAR No."]').value`), legacyRecord.iarNumber, 'Recovered legacy edit retains its issued number');
  assert.equal(await evaluate(`document.querySelector('[aria-label="IAR No."]').checkValidity()`), true, 'Unchanged legacy number permits metadata corrections in a recovered edit');
  await completeRequiredDocumentFields();
  const legacyEditor = await evaluate(`(() => {
    const form = document.querySelector('form'), button = form.querySelector('button[type="submit"]');
    return { disabled: button.disabled, valid: form.checkValidity(), invalid: [...form.querySelectorAll(':invalid')].map(input => ({ label: input.getAttribute('aria-label'), value: input.value, message: input.validationMessage })) };
  })()`);
  assert.deepEqual(legacyEditor, { disabled: false, valid: true, invalid: [] }, 'Recovered legacy IAR editor is ready to save');
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`sessionStorage.getItem('pams.iar-draft.${id}') === null`);
  assert.equal(legacyRecord.supplierName, 'Corrected supplier');
  assert.equal(legacyRecord.iarNumber, '2026-10-001');
  console.log('PASS IAR numeric validation, manual number, expired-session retry, numeric/old draft recovery, and legacy metadata edit.');
  role = 'user';
  await navigate('/my-issued-items');
  await waitFor(`document.querySelector('main').textContent.includes(${JSON.stringify(transferredDescription)})`);
  const transferredRow = await evaluate(`[...document.querySelectorAll('main tbody tr')].find(row => row.textContent.includes(${JSON.stringify(transferredDescription)}))?.textContent`);
  assert.ok(transferredRow.includes('PAR 2026-10-099'), 'Issued Items shows a received transfer under its current accountability document');
  assert.equal(await evaluate(`[...document.querySelectorAll('main tbody tr')].filter(row => row.textContent.includes(${JSON.stringify(description)})).length`), 1, 'An issued asset appears once when the RIS and accountability endpoints both contain it');
  const restrictedRoutes = ['/ris', '/my-ris', '/my-requests', '/dashboard', '/iar', '/inventory', '/inventory-custodian', '/par', '/transfers', '/returns', '/returned-supply', '/users', '/suppliers', '/reports/monthly', '/reports/annual', '/reports/ppe-list', '/historical-records', '/profile'];
  const restrictedApis = new Set(['/ris', '/ris/request-items', '/iar', '/items', '/ics', '/par', '/ptr', '/prs', '/returned-supply', '/users', '/suppliers', '/monthly-item-reports', '/ppe-lists', '/ppe-station-reports']);
  for (const route of restrictedRoutes) {
    const initialCalls = calls.length;
    await navigate(route, '/my-issued-items');
    assert.ok(!calls.slice(initialCalls).some(call => restrictedApis.has(call.path)), `${route}: blocked user route must not fetch admin records`);
  }
  await navigate('/my-returns');
  await waitFor(`!!document.querySelector('input[aria-label="Return quantity for Office bond paper"]')`);
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('PRS-HISTORY-001') && document.querySelector('main').textContent.includes('Receiving Officer For Completed Return')`), 'Returned Items retains completed asset return history and its receiving officer');
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Return quantity for Office bond paper"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(`document.querySelector('input[aria-label="Return quantity for Office bond paper"]').closest('tr').querySelector('button').click()`);
  await waitFor(`!!document.querySelector('[role="status"]') && document.querySelector('main').textContent.includes('Sent to admin')`);
  const submittedReturn = calls.findLast(call => call.path === '/ris/my-returns' && call.method === 'POST');
  const returnPayload = JSON.parse(submittedReturn.body);
  assert.deepEqual({ ...returnPayload, quantity: Number(returnPayload.quantity) }, { risId: 'ris-1', itemId: 'supply-line-1', quantity: 1 }, 'User returns supplies through the existing Returned Items screen');
  await evaluate(`document.querySelector('input[aria-label=${JSON.stringify(`Return quantity for ${transferredDescription}`)}]').closest('tr').querySelector('button').click()`);
  await waitFor(`[...document.querySelectorAll('main tbody tr')].some(row => row.textContent.includes(${JSON.stringify(transferredDescription)}) && row.textContent.includes('Sent to admin'))`);
  const submittedAssetReturn = calls.findLast(call => call.path === '/custody/returns' && call.method === 'POST');
  assert.ok(submittedAssetReturn, 'Received transfers can be returned from the same Returned Items screen');
  const assetReturnPayload = JSON.parse(submittedAssetReturn.body);
  assert.deepEqual({ ...assetReturnPayload, quantity: Number(assetReturnPayload.quantity) }, { accountability: transferredAsset._id, quantity: 1 }, 'Transferred asset return uses current accountability instead of the original requester RIS');
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('PRS-ASSET-001')`), 'New asset return is listed as awaiting admin receipt');
  console.log('PASS user menu, blocked admin routes, current transferred accountability, completed history, and supply/asset return submissions.');
  role = 'admin';
  await navigate('/returns');
  await evaluate(`document.querySelector('.record-action--edit').click()`);
  await waitFor(`document.querySelector('form button[type="submit"]')?.textContent.trim() === 'Confirm Receipt'`);
  const assertReturnedToEditor = async status => {
    const states = await evaluate(`(() => {
      const state = label => {
        const input = document.querySelector('input[aria-label="' + label + '"]');
        return { present: !!input, disabled: input?.matches(':disabled'), readOnly: input?.readOnly };
      };
      return { returnedTo: ['Date', 'Name', 'Designation'].map(field => state('Returned To ' + field)), locked: ['PRS No.', 'Quantity', 'Description', 'Returned By Date', 'Returned By Name', 'Returned By Designation'].map(state) };
    })()`);
    for (const state of states.returnedTo) assert.deepEqual(state, { present: true, disabled: false, readOnly: false }, `${status}: Returned To date, name, and designation must be editable`);
    for (const state of states.locked) assert.ok(state.present && (state.disabled || state.readOnly), `${status}: recorded item and Returned By fields remain locked`);
  };
  const fillReturnedTo = async signatory => {
    await evaluate(`(() => {
      for (const [field, value] of ${JSON.stringify(Object.entries(signatory))}) {
        const input = document.querySelector('input[aria-label="Returned To ' + field + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
  };
  await assertReturnedToEditor('Pending receipt');
  const receivingSignatory = { Date: '2026-10-09', Name: 'Receiving Property Officer', Designation: 'Supply Office' };
  await fillReturnedTo(receivingSignatory);
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`document.querySelector('form button[type="submit"]')?.textContent.trim() === 'Create PRS'`);
  const confirmedReturn = calls.findLast(call => call.path === '/prs/prs-1/confirm' && call.method === 'POST');
  assert.ok(confirmedReturn, 'Existing PRS form confirms receipt');
  const confirmedSignatory = JSON.parse(confirmedReturn.body).returnedTo;
  assert.equal(confirmedSignatory.date, receivingSignatory.Date, 'Receipt sends the entered Returned To date');
  assert.equal(confirmedSignatory.name, receivingSignatory.Name, 'Receipt sends the entered Returned To name');
  assert.equal(confirmedSignatory.designation, receivingSignatory.Designation, 'Receipt sends the entered Returned To designation');
  await navigate('/returns');
  await evaluate(`document.querySelector('.record-action--edit').click()`);
  await waitFor(`document.querySelector('form button[type="submit"]')?.textContent.trim() === 'Update PRS'`);
  await assertReturnedToEditor('Completed receipt');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Returned To Name"]').value`), receivingSignatory.Name, 'Saved receiving signatory reloads into the return slip');
  const correctedSignatory = { Date: '2026-10-10', Name: 'Corrected Property Officer', Designation: 'Property Management Office' };
  await fillReturnedTo(correctedSignatory);
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`document.querySelector('form button[type="submit"]')?.textContent.trim() === 'Create PRS'`);
  const updatedReturn = calls.findLast(call => call.path === '/prs/prs-1' && call.method === 'PUT');
  assert.ok(updatedReturn, 'Completed PRS saves a Returned To correction through the existing Update PRS action');
  const correction = JSON.parse(updatedReturn.body);
  assert.deepEqual(Object.keys(correction), ['returnedTo'], 'Correction changes only the receiving signatory');
  assert.equal(correction.returnedTo.date, correctedSignatory.Date);
  assert.equal(correction.returnedTo.name, correctedSignatory.Name);
  assert.equal(correction.returnedTo.designation, correctedSignatory.Designation);
  assert.equal(prs.status, 'RETURNED', 'Signatory correction preserves the completed return status');
  await navigate('/returns');
  await evaluate(`document.querySelector('.record-action--edit').click()`);
  await waitFor(`document.querySelector('form button[type="submit"]')?.textContent.trim() === 'Update PRS'`);
  for (const [field, value] of Object.entries(correctedSignatory)) {
    assert.equal(await evaluate(`document.querySelector('[aria-label="Returned To ${field}"]').value`), value, `Corrected Returned To ${field} reloads into the completed slip`);
  }
  console.log('PASS pending and completed PRS Returned To editing with locked item and custodian details.');
  console.log(`PASS ${checks} responsive layout checks; existing forms tested with isolated fixtures.`);
  }
  }
  assert.equal(failures.length, 0, `Browser exceptions: ${failures.join('\n')}`);
} catch (error) {
  console.error(error); throw error;
} finally {
  ws?.close(); browser.kill(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
