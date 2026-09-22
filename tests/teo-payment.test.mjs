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
test('no shows without a confirmed amount, cash and cancellations stay excluded', () => {
  for (const text of ['0.00 $ No show 09/20','Carte No show 09/20','Compte Annulée 09/20','Comptant 09/20','Carte Espèces 09/20']) assert.equal(isImportableTeoPayment(text),false);
});
test('paid no-shows are Téo rides without a card label', () => {
  for (const label of ['No show', 'NO SHOW', 'No-show', 'No\nshow']) {
    assert.equal(isImportableTeoPayment(`10.00 $ Hmr-Pav-M - Hôpital Maison\n${label}\n22/09 @ 12:55 p.m.`, 10), true);
  }
  assert.equal(isImportableTeoPayment('Carte No show 09/21', 10), true);
});
test('zero, negative, missing and invalid no-show amounts are excluded', () => {
  for (const total of [0, -10, undefined, NaN, Infinity]) {
    assert.equal(isImportableTeoPayment('0.00 $ No show 1365 Rue 22/09 @ 10:27 a.m.', total), false);
  }
  for (const text of ['27.75 $ En espèces 22/09', '10.00 $ No show Annulée 22/09']) assert.equal(isImportableTeoPayment(text, 10), false);
});
