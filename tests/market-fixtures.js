// Données de marché FABRIQUÉES pour tests/market.js : aucune donnée réelle d'UEX (conditions d'usage : pas de redistribution).
// Les champs reprennent la forme observée de l'API (docs/uex-api.md), les valeurs sont inventées.
// Sémantique couverte (voir docs/uex-api.md, « Prix : achat et vente ») :
//   price_buy > 0  → le JOUEUR ACHÈTE à ce terminal (« Où acheter »), stock = scu_buy ;
//   price_sell > 0 → le JOUEUR VEND à ce terminal (« Où vendre »), demande = scu_sell ;
//   les deux → le terminal apparaît dans les deux tableaux ; aucun des deux → ligne ignorée.
"use strict";

const T0 = Date.parse("2026-10-26T12:00:00Z"); // « maintenant » figé dans le navigateur (page.clock.setFixedTime)
const sec = ms => Math.floor(ms / 1000);
const ago = s => sec(T0) - s; // date_modified : il y a s secondes

const systems = [
  { id: 1, name: "Système X", code: "SX", faction_name: null, is_available_live: 1 },
  { id: 2, name: "Système Y", code: "SY", faction_name: null, is_available_live: 1 },
  { id: 3, name: "Système Z", code: "SZ", faction_name: null, is_available_live: 0 }
];

const T = (id, name, sys, place) => ({ id, name, fullname: "Boutique - " + name, displayname: name, type: "commodity", star_system_name: sys, planet_name: place || null, space_station_name: null, city_name: null, is_refinery: 0, max_container_size: 32, screenshot: "https://exemple.invalid/x.jpg" });
const terminals = [
  T(1, "Terminal A", "Système X", "Planète Alpha"), T(2, "Terminal B", "Système X"), T(3, "Terminal C", "Système Y", "Planète Test"), T(4, "Terminal D", "Système Y"),
  T(5, "=Terminal Formule", "Système X"), T(6, "Terminal É", "Système Y"), T(7, "Terminal L2", "Système X"), T(8, "Terminal L10", "Système X")
];
for (let i = 1; i <= 230; i++) terminals.push(T(100 + i, "Banc " + String(i).padStart(3, "0"), i % 2 ? "Système X" : "Système Y"));

const C = (id, name, code, slug) => ({ id, name, code, slug, kind: "Métal", weight_scu: 1, price_buy: 0, price_sell: 0, is_illegal: 0, is_buyable: 1, is_sellable: 1 });
const commodities = [
  C(1, "Alphium", "ALPH", "alphium"),
  C(2, "Éther Bêta", "ETHB", "ether-beta"),
  C(3, "Alphium (Minerai)", "ALPH", "alphium-minerai"), // même code qu'Alphium, aucune ligne de prix
  C(4, "Gamma", "GAMM", "gamma"),
  C(5, "Delta", "DELT", "delta"),
  C(6, "Epsilon", "EPSI", "epsilon"),                   // lignes de prix, toutes à 0 : « aucun prix »
  C(7, "Zêta", "ZETA", "zeta")
];

const P = (c, t, o) => Object.assign({ id: 0, id_commodity: c, id_terminal: t, price_buy: 0, price_buy_avg: 0, price_sell: 0, price_sell_avg: 0, scu_buy: 0, scu_buy_avg: 0, scu_sell_stock: 0, scu_sell_stock_avg: 0,
  scu_sell: 0, scu_sell_avg: 0, status_buy: 0, status_sell: 0, container_sizes: "1,2,4,8,16", quality: 0, date_added: 1700000000, date_modified: ago(600), commodity_name: "", terminal_name: "" }, o);
const prices = [
  // Alphium : un terminal qui vend (T1 : le joueur y achète), un qui achète (T2 : le joueur y vend), un des deux sens à la fois (T3), aucun (T4)
  P(1, 1, { price_buy: 1180, price_buy_avg: 1150, scu_buy: 640, status_buy: 5, date_modified: ago(600) }),                                  // 10 min : Frais
  P(1, 2, { price_sell: 1340, price_sell_avg: 1310, scu_sell: 900, status_sell: 3, date_modified: ago(5 * 3600) }),                         // 5 h : À vérifier
  P(1, 3, { price_buy: 1260, price_buy_avg: 1240, scu_buy: 58000000, price_sell: 1480, price_sell_avg: 1450, scu_sell: 302000, date_modified: ago(3 * 86400) }), // 3 j : Périmé
  P(1, 4, { date_modified: ago(60) }),                                                                                                       // aucun prix : ignoré
  P(1, 5, { price_buy: 1190, price_buy_avg: 0, scu_buy: 0, date_modified: 0 }),                                                            // moyenne, stock et date absents → « — »
  P(1, 6, { price_sell: 1500, price_sell_avg: 1490, scu_sell: 120, date_modified: ago(1800) }),                                              // 30 min, système Y
  P(1, 7, { price_buy: 1200, price_buy_avg: 1195, scu_buy: 75, date_modified: ago(3600) }),                                                  // exactement 1 h : Frais
  P(1, 8, { price_buy: 1210, price_buy_avg: 1205, scu_buy: 80, date_modified: ago(3601) }),                                                  // 1 h + 1 s : À vérifier
  // Éther Bêta : seulement des terminaux où acheter
  P(2, 2, { price_buy: 90, price_buy_avg: 92, scu_buy: 40, date_modified: ago(900) }),
  P(2, 4, { price_buy: 95, price_buy_avg: 94, scu_buy: 55, date_modified: ago(7200) }),
  // Gamma : limites de 24 h
  P(4, 1, { price_buy: 300, price_buy_avg: 300, scu_buy: 10, date_modified: ago(86400) }),                                                   // exactement 24 h : À vérifier
  P(4, 3, { price_sell: 350, price_sell_avg: 340, scu_sell: 10, date_modified: ago(86401) }),                                                // 24 h + 1 s : Périmé
  // Epsilon : lignes présentes mais sans aucun prix
  P(6, 1, { date_modified: ago(60) }), P(6, 2, { date_modified: ago(60) })
];
for (let i = 1; i <= 230; i++) prices.push(P(5, 100 + i, { price_buy: 1000 + i, price_buy_avg: 1000 + i, scu_buy: i, date_modified: ago(i * 60) }));
const names = {}; commodities.forEach(c => { names[c.id] = c.name; }); const tn = {}; terminals.forEach(t => { tn[t.id] = t.name; });
prices.forEach((p, i) => { p.id = i + 1; p.commodity_name = names[p.id_commodity]; p.terminal_name = tn[p.id_terminal]; });

const DATA = { commodities_prices_all: prices, commodities, terminals, star_systems: systems, game_versions: { live: "9.9.9", ptu: "9.9.10" } };

/* ───────── Routes (tests/routes.js) : jeu de données FABRIQUÉ distinct, prévu pour les cas limites du calcul ─────────
   Terminaux : A, B (Système X), C, D (Système Y), E (Système Z), « =Terminal Formule » (Système X, nom qui ressemble à une formule de tableur).
   Chaque marchandise illustre un cas (voir le commentaire de la ligne). Âges relatifs à T0. */
const RSYS = [{ id: 1, name: "Système X", code: "SX", is_available_live: 1 }, { id: 2, name: "Système Y", code: "SY", is_available_live: 1 }, { id: 3, name: "Système Z", code: "SZ", is_available_live: 1 }];
const RTERM = [[1, "Terminal A", "Système X"], [2, "Terminal B", "Système X"], [3, "Terminal C", "Système Y"], [4, "Terminal D", "Système Y"], [5, "Terminal E", "Système Z"], [6, "=Terminal Formule", "Système X"]]
  .map(([id, name, sys]) => T(id, name, sys));
const RC = (id, name, slug, illegal) => Object.assign(C(id, name, name.slice(0, 4).toUpperCase(), slug), { is_illegal: illegal ? 1 : 0 });
const RCOM = [RC(1, "Alphium", "alphium"), RC(2, "Bêta", "beta"), RC(3, "Gamma", "gamma"), RC(4, "Delta", "delta", true), RC(5, "Epsilon", "epsilon"), RC(6, "Zêta", "zeta"), RC(7, "Êta", "eta"),
  RC(8, "Thêta", "theta"), RC(9, "Iota", "iota"), RC(10, "Kappa", "kappa"), RC(11, "Lambda", "lambda")];
const B = (c, t, price, qty, status, age) => P(c, t, { price_buy: price, price_buy_avg: price, scu_buy: qty, status_buy: status, date_modified: age === 0 ? 0 : ago(age) });
const S = (c, t, price, qty, status, age) => P(c, t, { price_sell: price, price_sell_avg: price, scu_sell: qty, status_sell: status, date_modified: age === 0 ? 0 : ago(age) });
const both = (c, t, pb, qb, pr, qr, age) => P(c, t, { price_buy: pb, scu_buy: qb, status_buy: 5, price_sell: pr, scu_sell: qr, status_sell: 3, date_modified: ago(age) });
const RPRICES = [
  // Alphium : stock et demande connus, stock épuisé (état 1), demande inconnue (0, état 3), aucune demande (0, état 7)
  B(1, 1, 1000, 500, 5, 600), B(1, 2, 1100, 0, 1, 1800), S(1, 3, 1300, 200, 3, 1200), S(1, 4, 1250, 0, 3, 7200), S(1, 5, 1200, 0, 7, 300),
  // Bêta : stock inconnu (0, état absent), un prix périmé (3 j) ; demande limitée à 15 SCU
  B(2, 1, 200, 0, 0, 300), B(2, 3, 210, 30, 4, 3 * 86400), S(2, 2, 260, 1000, 4, 2400), S(2, 4, 230, 15, 4, 5400),
  // Gamma : terminaux à double sens (achat ET vente), dont un où la vente au même terminal serait « rentable » (exclue : même terminal)
  both(3, 2, 5000, 40, 5100, 40, 600), both(3, 4, 5300, 100, 5700, 60, 900),
  // Delta : marchandise illégale
  B(4, 5, 800, 100, 5, 900), S(4, 1, 1000, 100, 4, 900),
  // Epsilon : aucune ligne où le joueur achète (marchandise sans « vendeur » côté terminal) : aucune route
  S(5, 1, 900, 50, 4, 600), S(5, 2, 910, 60, 4, 600),
  // Zêta : prix d'achat = prix de vente (exclu) ; Êta : vente < achat (exclu)
  B(6, 1, 777, 50, 5, 600), S(6, 3, 777, 50, 4, 600), B(7, 3, 600, 50, 5, 600), S(7, 1, 550, 50, 4, 600),
  // Thêta : achat vieux de 30 h ; Iota : date d'achat inconnue
  B(8, 4, 100, 500, 5, 108000), S(8, 2, 130, 500, 4, 7200), B(9, 1, 50, 1000, 5, 0), S(9, 2, 85, 1000, 4, 600),
  // Kappa : grands nombres (valeurs abrégées) ; Lambda : terminal dont le nom ressemble à une formule
  B(10, 1, 20000, 100000, 5, 600), S(10, 3, 25000, 100000, 4, 600), B(11, 6, 400, 80, 5, 600), S(11, 3, 450, 80, 4, 600)
];
(() => { const n = {}; RCOM.forEach(c => { n[c.id] = c.name; }); const tn = {}; RTERM.forEach(t => { tn[t.id] = t.name; }); RPRICES.forEach((p, i) => { p.id = i + 1; p.commodity_name = n[p.id_commodity]; p.terminal_name = tn[p.id_terminal]; }); })();
const ROUTES_DATA = { commodities_prices_all: RPRICES, commodities: RCOM, terminals: RTERM, star_systems: RSYS, game_versions: { live: "9.9.9", ptu: "9.9.10" } };

/* Gros jeu fabriqué (≈ 2 600 lignes de prix, comme les vraies données) : 40 marchandises × 65 terminaux, tirage pseudo-aléatoire reproductible.
   Sert au « Voir plus » (plus de 100 routes) et à la mesure de performance. */
function bigRoutesData() {
  let seed = 20261026; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const sysN = ["Système X", "Système Y", "Système Z"], terms = [], coms = [], rows = [];
  for (let t = 1; t <= 65; t++) terms.push(T(t, "Poste " + String(t).padStart(2, "0"), sysN[t % 3]));
  for (let c = 1; c <= 40; c++) coms.push(RC(c, "Marchandise " + String(c).padStart(2, "0"), "marchandise-" + String(c).padStart(2, "0"), c % 13 === 0));
  coms.forEach(c => {
    const base = 100 + Math.floor(rnd() * 3000);
    terms.forEach(t => {
      const q = Math.floor(rnd() * 800), age = 60 + Math.floor(rnd() * 80000);
      if (rnd() < 0.5) rows.push(B(c.id, t.id, Math.round(base * (0.85 + rnd() * 0.15)), q % 5 === 0 ? 0 : q, q % 5 === 0 ? 3 : 5, age));
      else rows.push(S(c.id, t.id, Math.round(base * (1 + rnd() * 0.25)), q % 7 === 0 ? 0 : q, q % 7 === 0 ? 3 : 4, age));
    });
  });
  const cn = {}, tn = {}; coms.forEach(c => { cn[c.id] = c.name; }); terms.forEach(t => { tn[t.id] = t.name; });
  rows.forEach((p, i) => { p.id = i + 1; p.commodity_name = cn[p.id_commodity]; p.terminal_name = tn[p.id_terminal]; });
  return { commodities_prices_all: rows, commodities: coms, terminals: terms, star_systems: RSYS, game_versions: { live: "9.9.9", ptu: "9.9.10" } };
}
module.exports = { T0, DATA, systems, terminals, commodities, prices, ROUTES_DATA, bigRoutesData };
