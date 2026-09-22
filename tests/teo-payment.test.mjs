import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
const vite = await createServer({configFile: false, server: {middlewareMode: true, hmr: false}});
after(() => vite.close());
const {isCardPayment, isImportableTeoPayment} = await vite.ssrLoadModule('/lib/teo-payment.ts');
test('Compte and Carte use the same payment classification', () => {
  for (const value of ['Compte','Carte','Téo / compte','Téo / carte',' compte ']) assert.equal(isCardPayment(value),true);
  for (const value of ['Comptant','Espèces','Compte bancaire','Coupon','Machine crédit']) assert.equal(isCardPayment(value),false);
});
test('account and card rows from the screenshot are eligible', () => {
  for (const text of ['14.70 $ 1440 Rue Dufresne\nCompte 22/09 @ 10:00 a.m.', '59.65 $ 5415 Boulevard\nCompte 09/21','23.82 $ 1212 Rue Sanguinet\nCarte 09/21']) assert.equal(isImportableTeoPayment(text),true);
});
test('no shows, cash and cancellations stay excluded', () => {
  for (const text of ['0.00 $ No show 09/20','Carte No show 09/20','Compte Annulée 09/20','Comptant 09/20','Carte Espèces 09/20']) assert.equal(isImportableTeoPayment(text),false);
});
