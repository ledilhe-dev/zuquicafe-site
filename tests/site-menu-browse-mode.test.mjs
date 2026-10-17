import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const menu = readFileSync(new URL("../cardapio/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../cardapio/enhancements.css", import.meta.url), "utf8");
const admin = readFileSync(new URL("../cardapioAdm/app.js", import.meta.url), "utf8");

test("site abre o cardápio em modo de consulta", () => {
  assert.match(home, /href="\/cardapio\/\?modo=consulta">Ver cardápio</);
  assert.match(menu, /siteBrowseMode = !params\.get\("reference"\)/);
  assert.match(menu, /Somente consulta/);
  assert.match(styles, /site-browse-mode \.cart-button/);
  assert.match(styles, /site-browse-mode \.topbar-actions/);
  assert.match(styles, /site-browse-mode \.welcome-actions/);
});

test("QR da mesa continua usando referência e fluxo de pedido", () => {
  assert.match(admin, /\/cardapio\/\?reference=/);
  assert.match(menu, /<button data-add=/);
  assert.match(menu, /create_order/);
});
