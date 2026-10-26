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
module.exports = { T0, DATA, systems, terminals, commodities, prices };
