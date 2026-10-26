// Tests fonctionnels complémentaires : carnet (édition, suppression, chronomètre, exports, imports),
// import Game.log, mobile 390x844, clavier, service worker hors ligne.
// Usage : node tests/features.js   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || !extra ? "" : " → " + extra)); };

/* « attendu défaillant » : défaut réel confirmé dans l'application. Le test passe tant que le défaut est présent
   et ÉCHOUE le jour où il est corrigé (il faut alors le transformer en vérification normale). */

function startServer(port) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-feat-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }), stdio: "ignore" });
  return { child, data };
}
async function waitUp(port) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:" + port + "/healthz"); if (r.status) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("le serveur ne répond pas");
}
const J = { "Content-Type": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* analyse CSV minimale (séparateur « ; », guillemets doublés) */
function parseCsv(txt) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ";") { row.push(cur); cur = ""; }
    else if (c === "\r") { /* ignoré, \n suit */ }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

(async () => {
  const port = 19000 + Math.floor(Math.random() * 800);
  const srv = startServer(port);
  const base = "http://127.0.0.1:" + port;
  let browser;
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", e => errors.push(tag + e.message));
    p.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::|evt-|Failed to load resource/.test(m.text() + (m.location().url || ""))) errors.push(tag + m.text()); });
  };
  const api = {
    list: async () => (await fetch(base + "/api/entries")).json(),
    put: (id, d) => fetch(base + "/api/entries/" + id, { method: "PUT", headers: J, body: JSON.stringify(d) }),
    clear: async () => { for (const e of await api.list()) await fetch(base + "/api/entries/" + e.id, { method: "DELETE" }); }
  };
  async function section(name, fn) {
    try { await fn(); } catch (e) { check(name + " : exécution", false, e && e.stack || String(e)); }
  }
  const normSp = s => s.replace(/[  ]/g, " ");

  try {
    await waitUp(port);
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

    async function newLog(opts) {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }, opts || {}));
      await ctx.addInitScript(() => { try { localStorage.setItem("orbital-carnet", "1"); } catch (e) {} }); /* carnet activé (masqué par défaut) */
      const page = await ctx.newPage(); watch(page, "");
      return { ctx, page };
    }
    async function openLog(page) {
      await page.goto(base + "/#carnet");
      await page.waitForSelector("#v-log", { state: "visible" });
      await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.getElementById("lgStore").textContent), null, { timeout: 5000 });
    }
    async function addEntry(page, f) {
      for (const k of Object.keys(f)) await page.fill("#" + k, f[k]);
      await page.click("#fSave");
      await page.waitForFunction(() => /ajoutée/.test(document.getElementById("fMsg").textContent), null, { timeout: 5000 });
    }

    /* ───────── 1. Carnet : modification et suppression ───────── */
    await section("carnet édition", async () => {
      await api.clear();
      const { ctx, page } = await newLog();
      await openLog(page);
      await addEntry(page, { fDur: "30", fAuec: "5000", fTitle: "Avant", fPlace: "Daymar", fNotes: "note initiale" });
      const id0 = (await api.list())[0].id;
      await page.click(".lg-ent .lg-act button:first-child");
      const ed = await page.evaluate(() => ({ t: document.getElementById("lgFormTitle").textContent, b: document.getElementById("fSave").textContent, ann: !document.getElementById("fReset").hidden, title: document.getElementById("fTitle").value, dur: document.getElementById("fDur").value, notes: document.getElementById("fNotes").value }));
      check("carnet : « Modifier » remplit le formulaire (titre « Modifier l’entrée », bouton « Mettre à jour »)", ed.t === "Modifier l’entrée" && ed.b === "Mettre à jour" && ed.ann && ed.title === "Avant" && ed.dur === "30" && ed.notes === "note initiale", JSON.stringify(ed));
      await page.fill("#fTitle", "Après"); await page.fill("#fAuec", "-250"); await page.fill("#fDur", "45");
      await page.click("#fSave");
      await page.waitForFunction(() => /Entrée modifiée\./.test(document.getElementById("fMsg").textContent), null, { timeout: 5000 });
      const l1 = await api.list();
      check("carnet : la modification met à jour l’entrée sur le serveur (même id, pas de doublon)", l1.length === 1 && l1[0].id === id0 && l1[0].title === "Après" && l1[0].auec === -250 && l1[0].dur === 45 && l1[0].place === "Daymar", JSON.stringify(l1));
      const shown = normSp(await page.textContent("#lgList"));
      check("carnet : la liste affiche la version modifiée", /Après/.test(shown) && !/Avant/.test(shown) && /−?-?250 aUEC/.test(shown) && (await page.locator(".lg-ent").count()) === 1, shown);
      check("carnet : après modification, le formulaire revient en mode « Nouvelle entrée »", (await page.textContent("#lgFormTitle")) === "Nouvelle entrée" && (await page.textContent("#fSave")) === "Enregistrer" && (await page.isHidden("#fReset")));
      /* annuler une modification */
      await page.click(".lg-ent .lg-act button:first-child");
      await page.fill("#fTitle", "Ne pas garder");
      await page.click("#fReset");
      check("carnet : « Annuler la modification » n’altère pas l’entrée", (await api.list())[0].title === "Après" && (await page.inputValue("#fTitle")) === "" && (await page.textContent("#fSave")) === "Enregistrer");
      /* suppression avec confirmation */
      await page.click(".lg-ent .lg-act button:nth-child(2)");
      const armed = await page.textContent(".lg-ent .lg-act button:nth-child(2)");
      check("carnet : le 1er clic sur « Supprimer » demande confirmation et ne supprime rien", armed === "Confirmer ?" && (await api.list()).length === 1, armed);
      await page.click(".lg-ent .lg-act button:nth-child(2)");
      await page.waitForFunction(() => document.querySelectorAll(".lg-ent").length === 0, null, { timeout: 5000 }).catch(() => {});
      check("carnet : « Confirmer ? » supprime l’entrée (liste, serveur, message de carnet vide)", (await api.list()).length === 0 && /Le carnet est vide/.test(await page.textContent("#lgList")) && /Carnet vide/.test(await page.textContent("#hmLogN")));
      /* la confirmation expire */
      await addEntry(page, { fTitle: "Expire" });
      await page.click(".lg-ent .lg-act button:nth-child(2)");
      await page.waitForTimeout(3900);
      check("carnet : la confirmation de suppression expire après ~3,5 s", (await page.textContent(".lg-ent .lg-act button:nth-child(2)")) === "Supprimer" && (await api.list()).length === 1);
      await ctx.close();
    });

    /* ───────── 1b. Chronomètre ───────── */
    await section("chronomètre", async () => {
      await api.clear();
      const { ctx, page } = await newLog();
      await page.clock.install({ time: new Date("2026-10-20T10:00:00") });
      await openLog(page);
      await page.click("#lgStart");
      check("chronomètre : « Démarrer » affiche Terminer/Annuler et masque Démarrer", (await page.isHidden("#lgStart")) && (await page.isVisible("#lgStop")) && (await page.isVisible("#lgCancel")));
      await page.clock.fastForward("05:00");
      await page.waitForFunction(() => document.getElementById("lgClock").textContent === "00:05:00", null, { timeout: 3000 }).catch(() => {});
      check("chronomètre : l’horloge affiche 00:05:00 après 5 min simulées", (await page.textContent("#lgClock")) === "00:05:00", await page.textContent("#lgClock"));
      await page.clock.fastForward("01:10:00");
      await page.waitForTimeout(100);
      check("chronomètre : format h:mm:ss au-delà d’une heure (01:15:00)", (await page.textContent("#lgClock")) === "01:15:00", await page.textContent("#lgClock"));
      await page.click("#lgStop");
      const f = await page.evaluate(() => ({ type: document.getElementById("fType").value, dur: document.getElementById("fDur").value, when: document.getElementById("fWhen").value, msg: document.getElementById("fMsg").textContent, running: localStorage.getItem("sclog_timer") }));
      check("chronomètre : « Terminer et noter » préremplit session, durée 75 min et heure de début", f.type === "session" && f.dur === "75" && f.when === "2026-10-20T10:00" && /Session terminée/.test(f.msg) && f.running === null, JSON.stringify(f));
      check("chronomètre : après l’arrêt, l’horloge est remise à zéro et « Démarrer » revient", (await page.textContent("#lgClock")) === "00:00:00" && (await page.isVisible("#lgStart")));
      await page.fill("#fTitle", "Ma session");
      await page.click("#fSave");
      await page.waitForFunction(() => /ajoutée/.test(document.getElementById("fMsg").textContent), null, { timeout: 5000 });
      const l = await api.list();
      check("chronomètre : la session enregistrée a la durée mesurée (75 min) et l’heure de début", l.length === 1 && l[0].type === "session" && l[0].dur === 75 && l[0].title === "Ma session" && l[0].ts === new Date("2026-10-20T10:00:00").getTime(), JSON.stringify(l));
      /* durée minimale : un arrêt immédiat note au moins 1 min */
      await page.click("#lgStart"); await page.click("#lgStop");
      check("chronomètre : un arrêt immédiat propose une durée d’au moins 1 min", (await page.inputValue("#fDur")) === "1");
      /* annuler */
      await page.click("#fReset").catch(() => {});
      await page.click("#lgStart");
      await page.clock.fastForward("00:03:00");
      await page.click("#lgCancel");
      check("chronomètre : « Annuler » arrête sans rien enregistrer (horloge à zéro, stockage vidé)", (await page.textContent("#lgClock")) === "00:00:00" && (await page.isVisible("#lgStart")) && (await page.evaluate(() => localStorage.getItem("sclog_timer"))) === null && (await api.list()).length === 1);
      await ctx.close();

      /* rechargement pendant une session (horloge réelle) */
      const r = await newLog();
      await openLog(r.page);
      await r.page.click("#lgStart");
      await r.page.waitForTimeout(1300);
      await r.page.reload();
      await r.page.waitForSelector("#v-log", { state: "visible" }).catch(() => {});
      await r.page.waitForFunction(() => document.getElementById("lgStop") !== null, null, { timeout: 5000 });
      const st = await r.page.evaluate(() => ({ stop: !document.getElementById("lgStop").hidden, start: document.getElementById("lgStart").hidden, clock: document.getElementById("lgClock").textContent }));
      check("chronomètre : un rechargement pendant la session la conserve (stockée dans le navigateur) et l’horloge continue", st.stop && st.start && st.clock !== "00:00:00", JSON.stringify(st));
      await r.ctx.close();
    });

    /* ───────── 1c. Exports ───────── */
    const E1 = { type: "mining", ts: new Date("2026-10-18T14:30:00Z").getTime(), dur: 90, auec: 123456, title: 'Minage, "quantanium"; zone A', place: "Daymar, Stanton", ship: "Prospector", notes: 'ligne 1\nligne 2 avec "guillemets", virgule ; point-virgule', src: "manual" };
    const E2 = { type: "combat", ts: new Date("2026-10-19T08:00:00Z").getTime(), dur: 10, auec: -5000, title: "Perte", place: "", ship: "Gladius", notes: "", src: "gamelog" };
    const E3 = { type: "cargo", ts: new Date("2026-10-17T09:15:00Z").getTime(), dur: 0, auec: 0, title: "Zone <b>é à ü</b> — émoji ok", place: "Port Olisar", ship: "", notes: "=1+1", src: "manual" };
    let exported = null;
    await section("exports", async () => {
      await api.clear();
      await api.put("exp-1", E1); await api.put("exp-2", E2); await api.put("exp-3", E3);
      const { ctx, page } = await newLog();
      await openLog(page);
      check("carnet : 3 entrées chargées depuis le serveur", (await page.locator(".lg-ent").count()) === 3);
      check("carnet : le titre contenant du HTML est affiché comme texte (pas interprété)", (await page.locator(".lg-ttl", { hasText: "<b>é à ü</b>" }).count()) === 1 && (await page.locator(".lg-ent b").count()) === 0);
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#xCsv")]);
      const csv = fs.readFileSync(await dl.path(), "utf8");
      check("export CSV : fichier « carnet-star-citizen.csv »", dl.suggestedFilename() === "carnet-star-citizen.csv", dl.suggestedFilename());
      check("export CSV : BOM UTF-8 (Excel) et fins de ligne CRLF", csv.charCodeAt(0) === 0xFEFF && /\r\n/.test(csv));
      const rows = parseCsv(csv.slice(1));
      check("export CSV : en-têtes attendus", rows[0].join("|") === "date|activité|durée_min|aUEC|titre|lieu|vaisseau|notes|source", rows[0].join("|"));
      check("export CSV : une ligne par entrée, 9 colonnes chacune, ordre chronologique", rows.length === 4 && rows.every(r => r.length === 9) && rows[1][4] === E3.title && rows[2][4] === E1.title && rows[3][4] === "Perte", JSON.stringify(rows.map(r => r.length)));
      const r1 = rows[2];
      check("export CSV : date ISO, activité en français, durée et aUEC", r1[0] === new Date(E1.ts).toISOString() && r1[1] === "Minage" && r1[2] === "90" && r1[3] === "123456" && rows[3][3] === "-5000", r1.slice(0, 4).join("|"));
      check("export CSV : guillemets, points-virgules et sauts de ligne protégés (titre et notes relus à l’identique)", r1[4] === E1.title && r1[7] === E1.notes && r1[5] === E1.place && r1[8] === "manual" && rows[3][8] === "gamelog", JSON.stringify(r1));
      check("export CSV : le titre à guillemets est entouré et doublé dans le fichier brut", csv.includes('"Minage, ""quantanium""; zone A"'));
      check("export CSV : accents et symboles conservés", rows[1][4].includes("é à ü") && rows[1][4].includes("—"));
      const formulaCell = rows[1][7];
      check("export CSV : une note commençant par « = » devrait être neutralisée (injection de formule Excel/LibreOffice)", formulaCell !== "=1+1");
      const [dj] = await Promise.all([page.waitForEvent("download"), page.click("#xJson")]);
      const jtxt = fs.readFileSync(await dj.path(), "utf8");
      let jarr = null; try { jarr = JSON.parse(jtxt); } catch (e) {}
      check("export JSON : fichier « carnet-star-citizen.json » contenant un tableau JSON valide de 3 entrées", dj.suggestedFilename() === "carnet-star-citizen.json" && Array.isArray(jarr) && jarr.length === 3);
      const byId = {}; (jarr || []).forEach(e => byId[e.id] = e);
      check("export JSON : tous les champs sont conservés à l’identique", ["exp-1", "exp-2", "exp-3"].every((id, i) => { const o = byId[id], s = [E1, E2, E3][i]; return o && Object.keys(s).every(k => o[k] === s[k]); }), jtxt.slice(0, 200));
      exported = jtxt;
      /* carnet vide → message, pas de fichier */
      await ctx.close();
    });
    await section("export carnet vide", async () => {
      await api.clear();
      const { ctx, page } = await newLog();
      await openLog(page);
      let got = false; page.on("download", () => { got = true; });
      await page.click("#xCsv"); await page.waitForTimeout(400);
      check("export : un carnet vide affiche « Le carnet est vide. » et ne télécharge rien", (await page.textContent("#fMsg")) === "Le carnet est vide." && !got);
      await ctx.close();
    });

    /* ───────── 1d. Import JSON ───────── */
    await section("import JSON", async () => {
      await api.clear();
      const { ctx, page } = await newLog();
      await openLog(page);
      const before = await api.list();
      const bad = async (name, buf, expect) => {
        await page.setInputFiles("#jFile", { name, mimeType: "application/json", buffer: Buffer.from(buf) });
        await page.waitForFunction(() => !/^Lecture/.test(document.getElementById("gPrev").textContent), null, { timeout: 5000 }).catch(() => {});
        const msg = await page.textContent("#gPrev");
        return msg === expect ? true : msg;
      };
      const M = "Ce fichier n’est pas un carnet JSON valide.";
      check("import JSON : texte quelconque → message d’erreur en français", (await bad("x.json", "ceci n'est pas du json", M)) === true);
      check("import JSON : JSON tronqué → message d’erreur", (await bad("x.json", '[{"title":"a","dur":3', M)) === true);
      check("import JSON : objet au lieu d’un tableau → message d’erreur", (await bad("x.json", '{"title":"a"}', M)) === true);
      check("import JSON : fichier vide → message d’erreur", (await bad("x.json", "", M)) === true);
      check("import JSON : tableau de valeurs non-objets → « Rien de nouveau à importer. »", (await bad("x.json", "[1,2,null,\"a\"]", "Rien de nouveau à importer.")) === true);
      check("import JSON invalide : aucune entrée créée ni modifiée", JSON.stringify(await api.list()) === JSON.stringify(before) && before.length === 0);
      /* données hostiles : nettoyées, jamais de crash */
      await page.setInputFiles("#jFile", { name: "h.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ id: "../../etc/x", type: "zzz", ts: "n’importe quoi", dur: -5, auec: "abc", title: "T".repeat(500), notes: { a: 1 } }])) });
      await page.waitForFunction(() => /importée/.test(document.getElementById("gPrev").textContent), null, { timeout: 5000 }).catch(() => {});
      const hl = await api.list();
      check("import JSON : entrée aux champs absurdes nettoyée (type « other », durée ≥ 0, titre ≤ 120, id assaini)", hl.length === 1 && hl[0].type === "other" && hl[0].dur === 0 && hl[0].auec === 0 && hl[0].title.length === 120 && /^[A-Za-z0-9_-]+$/.test(hl[0].id) && typeof hl[0].ts === "number" && hl[0].ts > 0, JSON.stringify(hl[0]));
      await api.clear();
      /* aller-retour */
      await api.put("exp-1", E1); await api.put("exp-2", E2); await api.put("exp-3", E3);
      const orig = (await api.list()).sort((a, b) => a.id.localeCompare(b.id));
      await page.reload(); await openLog(page);
      const [dj] = await Promise.all([page.waitForEvent("download"), page.click("#xJson")]);
      const file = fs.readFileSync(await dj.path());
      await api.clear();
      await page.reload(); await openLog(page);
      check("aller-retour : le carnet est bien vide avant l’import", (await page.locator(".lg-ent").count()) === 0);
      await page.setInputFiles("#jFile", { name: "carnet-star-citizen.json", mimeType: "application/json", buffer: file });
      await page.waitForFunction(() => /importée/.test(document.getElementById("gPrev").textContent), null, { timeout: 5000 }).catch(() => {});
      check("aller-retour : message « 3 entrée(s) importée(s). »", (await page.textContent("#gPrev")) === "3 entrée(s) importée(s).", await page.textContent("#gPrev"));
      const back = (await api.list()).sort((a, b) => a.id.localeCompare(b.id));
      check("aller-retour : export puis import donne exactement les mêmes entrées (ids et champs)", JSON.stringify(back) === JSON.stringify(orig), JSON.stringify(back).slice(0, 300));
      await page.waitForTimeout(1000);
      const shownAfter = await page.locator(".lg-ent").count();
      check("aller-retour : la liste affiche tout de suite les 3 entrées importées (sans recharger)", shownAfter === 3);
      await page.reload(); await openLog(page);
      check("aller-retour : après rechargement, les 3 entrées sont affichées", (await page.locator(".lg-ent").count()) === 3);
      await page.setInputFiles("#jFile", { name: "carnet-star-citizen.json", mimeType: "application/json", buffer: file });
      await page.waitForFunction(() => /Rien de nouveau|importée/.test(document.getElementById("gPrev").textContent) && !/^3 entrée/.test(document.getElementById("gPrev").textContent), null, { timeout: 5000 }).catch(() => {});
      check("import JSON : réimporter le même fichier ne crée pas de doublons", (await page.textContent("#gPrev")) === "Rien de nouveau à importer." && (await api.list()).length === 3, await page.textContent("#gPrev"));
      check("export de la 1re section = celui de l’aller-retour (3 entrées)", exported ? JSON.parse(exported).length === 3 : false);
      await ctx.close();
    });

    /* ───────── 2. Import Game.log ───────── */
    const handle = "Pilote_Test";
    const L = (iso, rest) => "<" + iso + "> " + rest;
    const GL = [
      L("2026-10-01T09:59:58.123Z", "[Notice] <Init> Log started"),
      L("2026-10-01T10:00:00.000Z", "[Notice] <Spawn Flow> - name " + handle + " - state STATE_CURRENT"),
      "ligne sans date qui doit être ignorée",
      L("2026-10-01T10:20:00.500Z", "[Notice] <Actor Death> CActor::Kill: 'PNJ_Hostile_01' [201] in zone 'OOC_Stanton_2b_Daymar_1234567890' killed by '" + handle + "' [202] using 'KLWE_LaserRepeater_S3_999' [203] with damage type 'Bullet' from direction x: 0"),
      L("2026-10-01T10:45:00.000Z", "[Notice] <Something> fin de session 1"),
      L("2026-10-01T12:00:00.000Z", "[Notice] <Init> session 2 démarre"),
      L("2026-10-01T12:10:00.000Z", "[Notice] <Actor Death> CActor::Kill: '" + handle + "' [301] in zone 'Stanton_Crusader_55555555' killed by 'Vanduul_Pilote' [302] using 'BEHR_Ballistic_S2' [303] with damage type 'Bullet'"),
      L("2026-10-01T12:20:00.000Z", "[Notice] <Something> fin de session 2"),
      L("2026-10-02T09:00:00.000Z", "[Notice] <Init> session 3 démarre"),
      L("2026-10-02T09:10:00.000Z", "[Notice] <Something> fin de session 3"),
      ""
    ].join("\r\n");
    await section("import Game.log", async () => {
      await api.clear();
      const { ctx, page } = await newLog();
      await openLog(page);
      const feed = async (name, buf) => {
        await page.setInputFiles("#gFile", { name, mimeType: "text/plain", buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf) });
        await page.waitForFunction(() => !/^Lecture de/.test(document.getElementById("gPrev").textContent), null, { timeout: 15000 }).catch(() => {});
        return page.evaluate(() => document.getElementById("gPrev").innerText.replace(/\s+/g, " ").trim());
      };
      const prev1 = await feed("Game.log", GL);
      check("Game.log : 3 sessions détectées (coupures de plus de 30 min)", /3 sessions détectées/.test(prev1), prev1);
      check("Game.log : pseudo détecté automatiquement (STATE_CURRENT) et compté : 1 élimination, 1 mort", (await page.inputValue("#gHandle")) === handle && /1 élimination\(s\) et 1 mort\(s\)/.test(prev1) && /5 nouvelle\(s\) entrée\(s\)/.test(prev1), prev1);
      check("Game.log : rien n’est créé avant la validation", (await api.list()).length === 0);
      await page.click("#gPrev button");
      await page.waitForFunction(() => /ajoutée/.test(document.getElementById("gPrev").textContent), null, { timeout: 8000 }).catch(() => {});
      check("Game.log : message « 5 entrée(s) ajoutée(s). »", (await page.textContent("#gPrev")) === "5 entrée(s) ajoutée(s).", await page.textContent("#gPrev"));
      const l = (await api.list()).sort((a, b) => a.ts - b.ts);
      const ses = l.filter(e => e.type === "session"), cmb = l.filter(e => e.type === "combat");
      check("Game.log : 3 sessions (durées 45, 20 et 10 min) et 2 événements de combat, source « gamelog »", l.length === 5 && ses.length === 3 && ses.map(s => s.dur).join() === "45,20,10" && cmb.length === 2 && l.every(e => e.src === "gamelog"), JSON.stringify(l.map(e => [e.type, e.dur, e.title])));
      check("Game.log : heures de début exactes (UTC) des sessions", ses[0].ts === Date.parse("2026-10-01T09:59:58.123Z") && ses[1].ts === Date.parse("2026-10-01T12:00:00.000Z") && ses[2].ts === Date.parse("2026-10-02T09:00:00.000Z"));
      const kill = cmb.find(e => /^Élimination/.test(e.title)), death = cmb.find(e => /^Mort/.test(e.title));
      check("Game.log : élimination et mort avec adversaire, lieu nettoyé et arme", kill && death && kill.title === "Élimination : PNJ_Hostile_01" && kill.place === "OOC Stanton 2b Daymar" && /KLWE_LaserRepeater_S3_999/.test(kill.notes) && death.title === "Mort : tué par Vanduul_Pilote" && death.place === "Stanton Crusader" && /BEHR_Ballistic_S2/.test(death.notes), JSON.stringify([kill, death]));
      await page.waitForTimeout(1000);
      check("Game.log : la liste affiche tout de suite les 5 entrées ajoutées (sans recharger)", (await page.locator(".lg-ent").count()) === 5);
      await page.reload(); await openLog(page);
      check("Game.log : après rechargement, 5 entrées avec la mention « Game.log »", (await page.locator(".lg-ent").count()) === 5 && (await page.locator(".lg-meta", { hasText: "Game.log" }).count()) === 5);
      const prev2 = await feed("Game.log", GL);
      check("Game.log : un second import du même fichier n’ajoute rien (« 0 nouvelle(s) », 5 déjà présente(s), pas de bouton)", /0 nouvelle\(s\) entrée\(s\)/.test(prev2) && /5 déjà présente\(s\)/.test(prev2) && (await page.locator("#gPrev button").count()) === 0 && (await api.list()).length === 5, prev2);
      /* fichiers invalides */
      const NOLOG = "Aucune ligne datée trouvée : ce fichier ne ressemble pas à un Game.log.";
      const pe = await feed("vide.log", "");
      check("Game.log : fichier vide → message clair", pe === NOLOG, pe);
      const pt = await feed("notes.txt", "Bonjour,\nceci est une lettre.\nCordialement\n");
      check("Game.log : fichier texte quelconque → message clair", pt === NOLOG, pt);
      const pb = await feed("image.log", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255, 254, 0, 13, 10, 26, 10, 0, 0]));
      check("Game.log : fichier binaire → message clair, pas d’erreur", pb === NOLOG, pb);
      check("Game.log : les fichiers invalides n’ont rien créé", (await api.list()).length === 5);
      /* gros fichiers */
      const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n";
      const big1 = Buffer.from(filler.repeat(Math.ceil(5 * 1024 * 1024 / filler.length)));
      await page.evaluate(() => { window.__lt = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => { window.__lt = Math.max(window.__lt, e.duration); })).observe({ entryTypes: ["longtask"] }); } catch (e) {} });
      let t0 = Date.now();
      const pbig1 = await feed("gros.log", big1);
      const d1 = Date.now() - t0;
      check("Game.log : fichier de ~5 Mo de texte quelconque traité en moins de 5 s (" + d1 + " ms), message clair", d1 < 5000 && pbig1 === NOLOG, pbig1 + " / " + d1 + " ms");
      /* 5 Mo de lignes datées (cas pire pour l’analyseur) */
      const parts = []; let size = 0, t = Date.parse("2026-09-01T00:00:00Z"), n = 0;
      while (size < 5 * 1024 * 1024) { const s = "<" + new Date(t + n * 700).toISOString() + "> [Notice] <Network> ligne de journal numéro " + n + " avec du remplissage pour allonger\n"; parts.push(s); size += s.length; n++; }
      const big2 = Buffer.from(parts.join(""));
      t0 = Date.now();
      const pbig2 = await feed("gros-date.log", big2);
      const d2 = Date.now() - t0;
      const lt = await page.evaluate(() => window.__lt);
      const alive = await Promise.race([page.evaluate(() => 1), sleep(3000).then(() => 0)]);
      check("Game.log : ~5 Mo de lignes datées (" + n + " lignes) traités en moins de 5 s (" + d2 + " ms) et résumé affiché", d2 < 5000 && /sessions? |Session du/.test(pbig2) && /\d+ nouvelle\(s\) entrée\(s\)/.test(pbig2), pbig2.slice(0, 150) + " / " + d2 + " ms");
      check("Game.log : l’interface reste réactive (plus longue tâche bloquante " + Math.round(lt) + " ms < 3 s)", alive === 1 && lt < 3000, "longtask=" + Math.round(lt));
      await ctx.close();
    });

    /* ───────── 3. Mobile 390x844 ───────── */
    await section("mobile", async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await ctx.addInitScript(() => { try { localStorage.setItem("orbital-carnet", "1"); } catch (e) {} }); /* carnet activé (masqué par défaut) */
      const page = await ctx.newPage(); watch(page, "mobile : ");
      await page.goto(base + "/");
      await page.waitForSelector(".hm-banner");
      const open = async () => { if ((await page.getAttribute("#loreBtn", "aria-expanded")) !== "true") await page.tap("#loreBtn"); };
      const views = [["home", "#v-home"], ["log", "#v-log"], ["time", "#v-time"], ["map", "#v-map"], ["cl", "#v-cl"], ["ver", "#v-ver"]];
      for (const [v, sel] of views) {
        if (["time", "map", "cl"].includes(v)) { await open(); await page.waitForSelector('#loreMenu .tab[data-v="' + v + '"]', { state: "visible" }); }
        await page.tap('.tab[data-v="' + v + '"]');
        await page.waitForSelector(sel, { state: "visible" });
        await page.waitForTimeout(v === "cl" ? 800 : 350);
        const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
        check("mobile : l’onglet « " + v + " » s’affiche sans défilement horizontal (scrollWidth " + w.sw + " ≤ 390)", w.sw <= 390, JSON.stringify(w));
      }
      await page.tap('.tab[data-v="home"]');
      await page.waitForSelector("#v-home", { state: "visible" });
      const hs = await page.evaluate(() => [...document.querySelectorAll(".tabs > .tab, .tabs .lore-toggle")].filter(b => b.offsetParent !== null).map(b => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height * 10) / 10, w: Math.round(b.getBoundingClientRect().width), bot: Math.round(b.getBoundingClientRect().bottom) })));
      check("mobile : la barre du bas compte 4 boutons (Accueil, Carnet, Lore, Versions)", hs.length === 4, JSON.stringify(hs));
      check("mobile : chaque bouton de la barre du bas fait au moins 44 px de haut", hs.length > 0 && hs.every(b => b.h >= 44), JSON.stringify(hs));
      check("mobile : chaque bouton de la barre du bas fait au moins 44 px de large", hs.every(b => b.w >= 44), JSON.stringify(hs));
      /* menu Lore */
      if ((await page.getAttribute("#loreBtn", "aria-expanded")) === "true") await page.tap("#loreBtn");
      check("mobile : le menu Lore est fermé au départ", !(await page.isVisible("#loreMenu")));
      await page.tap("#loreBtn");
      const subs = await page.evaluate(() => [...document.querySelectorAll("#loreMenu .tab")].map(b => ({ t: b.textContent.trim(), h: b.getBoundingClientRect().height, vis: b.offsetParent !== null })));
      check("mobile : le menu Lore s’ouvre avec ses 3 sous-pages visibles", (await page.getAttribute("#loreBtn", "aria-expanded")) === "true" && subs.length === 3 && subs.every(s => s.vis), JSON.stringify(subs));
      check("mobile : les 3 sous-pages du menu Lore devraient faire au moins 44 px de haut (mesuré : " + subs.map(s => s.h).join("/") + " px)", subs.every(s => s.h >= 44));
      for (const [v, sel] of [["time", "#v-time"], ["map", "#v-map"], ["cl", "#v-cl"]]) {
        await open(); await page.waitForSelector('#loreMenu .tab[data-v="' + v + '"]', { state: "visible" });
        await page.tap('#loreMenu .tab[data-v="' + v + '"]');
        await page.waitForSelector(sel, { state: "visible", timeout: 5000 }).catch(() => {});
        check("mobile : le menu Lore mène à « " + v + " »", (await page.isVisible(sel)) && (await page.getAttribute('.tab[data-v="' + v + '"]', "aria-current")) === "page");
      }
      /* carnet : le formulaire reste utilisable */
      await page.tap('.tab[data-v="log"]'); await page.waitForSelector("#v-log", { state: "visible" });
      const lgw = await page.evaluate(() => [...document.querySelectorAll("#v-log button, #v-log input, #v-log select")].filter(e => e.offsetParent !== null && e.getBoundingClientRect().right > 391).map(e => e.id || e.textContent.trim()));
      check("mobile : aucun champ ni bouton du carnet ne dépasse de l’écran", lgw.length === 0, lgw.join(", "));
      await ctx.close();
    });

    /* ───────── 4. Clavier ───────── */
    await section("clavier", async () => {
      const { ctx, page } = await newLog();
      await page.goto(base + "/");
      await page.waitForSelector(".hm-banner");
      const ae = () => page.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, id: a.id, cls: a.className, v: a.dataset && a.dataset.v, inNav: !!a.closest("nav.tabs"), inDlg: !!a.closest("#srchOv") }; });
      await page.keyboard.press("Tab");
      const first = await ae();
      check("clavier : la 1re tabulation atteint le lien d’évitement", first.id === "skip", JSON.stringify(first));
      let reached = null;
      for (let i = 0; i < 6 && !reached; i++) { await page.keyboard.press("Tab"); const a = await ae(); if (a.inNav) reached = a; }
      check("clavier : la tabulation suivante atteint la navigation principale (en 6 Tab au plus)", reached && reached.v === "home", JSON.stringify(reached));
      await page.keyboard.press("Tab");
      const second = await ae();
      check("clavier : Tab passe à l’onglet suivant (Carnet de bord)", second.v === "log", JSON.stringify(second));
      await page.keyboard.press("Enter");
      await page.waitForSelector("#v-log", { state: "visible" });
      check("clavier : Entrée sur l’onglet « Carnet de bord » change de vue et le marque actif", (await page.isVisible("#v-log")) && (await page.getAttribute('.tab[data-v="log"]', "aria-current")) === "page" && (await page.textContent("#topTitle")).length > 0);
      await page.focus('.tab[data-v="ver"]'); await page.keyboard.press("Space");
      await page.waitForSelector("#v-ver", { state: "visible" }).catch(() => {});
      check("clavier : Espace sur l’onglet « Versions » change aussi de vue", await page.isVisible("#v-ver"));
      /* recherche globale */
      await page.focus('.tab[data-v="home"]'); await page.keyboard.press("Enter");
      await page.focus('.tab[data-v="ver"]');
      await page.keyboard.press("/");
      await page.waitForSelector("#srchOv", { state: "visible", timeout: 3000 }).catch(() => {});
      const o = await ae();
      check("clavier : la touche / ouvre la recherche globale et place le focus dans le champ", (await page.isVisible("#srchOv")) && o.id === "srchQ" && (await page.getAttribute("#srchDlg", "aria-modal")) === "true", JSON.stringify(o));
      check("clavier : le « / » n’est pas écrit dans le champ", (await page.inputValue("#srchQ")) === "");
      await page.keyboard.press("Escape");
      const c = await ae();
      check("clavier : Échap ferme la recherche et rend le focus à l’élément d’origine (onglet Versions)", !(await page.isVisible("#srchOv")) && c.v === "ver", JSON.stringify(c));
      /* « / » ignoré dans un champ de saisie */
      await page.click('.tab[data-v="log"]'); await page.focus("#fTitle"); await page.keyboard.type("a/b");
      check("clavier : « / » tapé dans un champ de saisie écrit le caractère et n’ouvre pas la recherche", (await page.inputValue("#fTitle")) === "a/b" && !(await page.isVisible("#srchOv")));
      /* bouton loupe + Maj+Tab */
      await page.click('.tab[data-v="home"]');
      await page.focus("#srchOpen"); await page.keyboard.press("Enter");
      await page.waitForSelector("#srchOv", { state: "visible", timeout: 3000 }).catch(() => {});
      await page.keyboard.press("Shift+Tab");
      const inside = await ae();
      check("clavier : dans la palette ouverte, Maj+Tab reste dans la palette (cycle) sans fuite vers la page", (await page.isVisible("#srchOv")) && inside.inDlg, JSON.stringify(inside));
      await page.keyboard.press("Escape");
      const back = await ae();
      check("clavier : Échap depuis la loupe rend le focus à la loupe", back.id === "srchOpen" && !(await page.isVisible("#srchOv")), JSON.stringify(back));
      await page.keyboard.press("Shift+Tab");
      const prevEl = await ae();
      check("clavier : Maj+Tab depuis la palette fermée ressort normalement (pas de piège de focus dans la boîte cachée)", !prevEl.inDlg && prevEl.id !== "srchOpen" && prevEl.tag !== "BODY", JSON.stringify(prevEl));
      await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
      const nextEl = await ae();
      check("clavier : Tab depuis la palette fermée ne rentre pas dans la boîte cachée", !nextEl.inDlg && nextEl.tag !== "BODY", JSON.stringify(nextEl));
      /* ouverture par « / » depuis le corps de la page, puis Échap */
      await page.evaluate(() => document.activeElement.blur());
      await page.keyboard.press("/");
      await page.waitForSelector("#srchOv", { state: "visible", timeout: 3000 }).catch(() => {});
      const op2 = await page.isVisible("#srchOv");
      await page.keyboard.press("Escape");
      check("clavier : « / » depuis le corps de la page ouvre la recherche, Échap la ferme", op2 && !(await page.isVisible("#srchOv")));
      await ctx.close();
    });

    /* ───────── 5. Service worker ───────── */
    await section("service worker", async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => { try { localStorage.setItem("orbital-carnet", "1"); } catch (e) {} }); /* carnet activé (masqué par défaut) */
      const page = await ctx.newPage();
      await page.goto(base + "/");
      await page.waitForSelector(".hm-banner");
      const active = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
      await page.waitForTimeout(800);
      await page.reload(); await page.waitForSelector(".hm-banner"); await page.waitForTimeout(500);
      await page.goto(base + "/#versions");
      await page.waitForSelector("#v-ver", { state: "visible" });
      await page.waitForTimeout(500);
      const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller);
      check("service worker : actif et contrôle la page après la première visite", active && ctl, JSON.stringify({ active, ctl }));
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector("#v-ver", { state: "visible", timeout: 10000 }).catch(() => {});
      const off = await page.evaluate(() => ({ ver: !!document.getElementById("v-ver") && document.getElementById("v-ver").offsetParent !== null, n: document.querySelectorAll("#verList .ver-item").length, cur: (document.getElementById("verCur") || {}).textContent, hash: location.hash }));
      const pkg = require(path.join(ROOT, "package.json"));
      check("hors ligne : la page « #versions » est servie et affiche l’historique (" + off.n + " versions, " + off.cur + ")", off.ver && off.n > 5 && off.cur === "v" + pkg.version && off.hash === "#versions", JSON.stringify(off));
      await page.goto(base + "/#carnet").catch(() => {});
      await page.reload();
      await page.waitForSelector("#v-log", { state: "visible", timeout: 10000 }).catch(() => {});
      check("hors ligne : le carnet s’ouvre aussi (stockage local en secours)", await page.isVisible("#v-log"));
      await ctx.setOffline(false);
      await ctx.close();
    });

    check("aucune erreur dans la console", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("exécution du test", false, e && e.stack || String(e));
  } finally {
    if (browser) await browser.close();
    srv.child.kill();
    try { fs.rmSync(srv.data, { recursive: true, force: true }); } catch (e) {}
  }
  const bad = results.filter(r => !r.ok).length;
  console.log("\n" + (results.length - bad) + "/" + results.length + " vérifications réussies");
  process.exit(bad ? 1 : 0);
})();
