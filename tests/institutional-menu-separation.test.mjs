import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../menu/index.html", import.meta.url), "utf8");
const showcaseApp = readFileSync(new URL("../menu/app.js", import.meta.url), "utf8");
const digital = readFileSync(new URL("../cardapio/index.html", import.meta.url), "utf8");

test("site institucional usa uma página de cardápio separada", () => {
  assert.match(home, /href="\/menu\/">Ver cardápio/);
  assert.match(showcase, /Somente para consulta/);
  assert.doesNotMatch(showcase, /Mesa não identificada|Ver meu pedido|Carrinho/);
  assert.doesNotMatch(showcaseApp, /create_order|data-add|reference/);
});

test("cardápio digital da mesa permanece com o fluxo de pedido", () => {
  assert.match(digital, /id="tableStatus"/);
  assert.match(digital, /id="cartButton"/);
  assert.match(digital, /Ver meu pedido/);
});
