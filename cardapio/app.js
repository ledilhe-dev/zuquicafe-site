const cfg = window.ZUQUI_CARDAPIO_CONFIG || {},
  money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }),
  params = new URLSearchParams(location.search),
  $ = (id) => document.getElementById(id),
  escape = (s) =>
    String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let data = {
    categories: [],
    products: [],
    banners: [],
    references: [],
    ordering_enabled: false,
  },
  cart = new Map(JSON.parse(localStorage.getItem("zuqui_cart") || "[]")),
  active = "",
  cardClaim = sessionStorage.getItem("zuqui_card_claim") || "",
  cardLabel = sessionStorage.getItem("zuqui_card_label") || "",
  referenceId = params.get("reference") || "",
  scannerControls = null,
  afterScan = null,
  sending = false,
  qrReaderClass = null,
  failedOrders = new Map();
let editingNoteId = "";
async function api(action, body = {}) {
  if (!cfg.apiUrl) throw new Error("Cardápio ainda não conectado ao servidor.");
  const r = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    }),
    j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha ao acessar o cardápio.");
  if (action === "public_menu") {
    j.categories = (j.categories || []).map((x) => ({
      ...x,
      name: x.display_name || x.name,
    }));
    j.products = (j.products || []).map((x) => ({
      ...x,
      name: x.display_name || x.name,
    }));
  }
  return j;
}
const apiBase = api;
api = async function (action, body = {}) {
  if (action === "create_order")
    body = {
      ...body,
      items: [...cart.values()].map((x) => ({
        product_id: x.id,
        quantity: x.qty,
        observation: String(x.observation || "").slice(0, 200),
      })),
    };
  return apiBase(action, body);
};
function reference() {
  return data.references.find((x) => x.id === referenceId && x.available);
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("show"), 2200);
}
function updateIdentity() {
  const ready = !!cardClaim;
  $("callWaiterButton").disabled = !ready;
  $("accountButton").disabled = !ready;
  $("welcome").classList.toggle("identified", ready);
  $("welcomeTitle").textContent = ready
    ? `Comanda ${cardLabel} identificada`
    : "Monte seu pedido";
  $("welcomeCopy").textContent = ready
    ? "Agora você pode lançar pedidos, acompanhar sua conta digital e pedir atendimento."
    : "Escolha seus produtos com calma. Você poderá conferir tudo antes de ler a comanda.";
  $("identifyCardButton").textContent = ready
    ? "Trocar comanda"
    : "Ver meu pedido";
  $("cardClaimBox").classList.toggle("validated", ready);
  $("cardClaimBox").querySelector("strong").textContent = ready
    ? `COMANDA ${cardLabel}`
    : "IDENTIFIQUE SUA COMANDA";
  $("cardClaimBox").querySelector("p").textContent = ready
    ? "Pronta para receber este lançamento."
    : "Leia o QR para lançar o pedido com segurança.";
  $("scanFromCart").hidden = ready;
}
function render() {
  const cats = data.categories.filter((x) => x.available !== false).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'pt-BR')),
    ref = reference(),
    current = cats.find((x) => x.id === active);
  $("categories").innerHTML =
    `<button class="${!active ? "active" : ""}" data-cat=""><span>Todos</span><small>${data.products.filter((x) => x.available).length}</small></button>` +
    cats
      .map(
        (x) =>
          `<button class="${active === x.id ? "active" : ""}" data-cat="${x.id}"><span>${escape(x.name)}</span><small>${data.products.filter((p) => p.available && p.category_id === x.id).length}</small></button>`,
      )
      .join("");
  const categoryOrder=new Map(cats.map((x,index)=>[x.id,index])),products = data.products.filter(
    (x) => x.available && (!active || x.category_id === active),
  ).sort((a,b)=>(categoryOrder.get(a.category_id)??9999)-(categoryOrder.get(b.category_id)??9999)||Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'pt-BR'));
  renderBanners();
  $("categoryTitle").textContent = current?.name || "Todos os produtos";
  $("products").innerHTML = products.length
    ? products
        .map(
          (p) =>
            `<article class="product"><div class="product-media">${p.image_url ? `<img src="${escape(p.image_url)}" alt="${escape(p.name)}" loading="lazy" decoding="async">` : '<div class="product-placeholder" aria-hidden="true"></div>'}</div><div class="product-body"><h3>${escape(p.name)}</h3><p>${escape(p.description)}</p><div class="product-foot"><strong>${money.format(p.source_price ?? p.price)}</strong><button data-add="${p.id}" aria-label="Adicionar ${escape(p.name)}">Adicionar</button></div></div></article>`,
        )
        .join("")
    : '<div class="empty">Nenhum produto disponível nesta categoria.</div>';
  $("tableStatus").innerHTML = ref
    ? `<span>Entrega em</span><strong>${escape(ref.name)}</strong>`
    : "<span>Mesa</span><strong>não identificada</strong>";
  $("fixedReference").textContent = ref ? ref.name : "Mesa não identificada";
  $("notice").textContent = data.ordering_enabled
    ? ""
    : "Cardápio em preparação. Os pedidos públicos ainda não estão habilitados.";
  renderCart();
  updateIdentity();
}
let bannerIndex=0,bannerTimer;
function renderBanners(){const banners=(data.banners||[]).filter(x=>x.available!==false),host=$('bannerCarousel');clearInterval(bannerTimer);if(!banners.length){host.hidden=true;host.innerHTML='';return}bannerIndex=Math.min(bannerIndex,banners.length-1);host.hidden=false;host.innerHTML=`<div class="banner-track">${banners.map((x,index)=>`<figure class="banner-slide ${index===bannerIndex?'active':''}"><img src="${escape(x.image_url)}" alt="${escape(x.alt_text||x.title||'Destaque do cardápio')}">${x.title?`<figcaption>${escape(x.title)}</figcaption>`:''}</figure>`).join('')}</div>${banners.length>1?`<div class="banner-dots">${banners.map((_,index)=>`<button data-banner-index="${index}" class="${index===bannerIndex?'active':''}" aria-label="Ver destaque ${index+1}"></button>`).join('')}</div>`:''}`;host.querySelectorAll('[data-banner-index]').forEach(button=>button.onclick=()=>{bannerIndex=Number(button.dataset.bannerIndex);renderBanners()});if(banners.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches)bannerTimer=setInterval(()=>{bannerIndex=(bannerIndex+1)%banners.length;renderBanners()},5500)}
function inlineOptions(x, key) {
  const options = Array.isArray(x.observation_options)
    ? x.observation_options
    : [];
  if (!options.length) return "";
  const choices = [...(!x.observation_required ? [null] : []), ...options];
  return `<fieldset class="inline-options ${x.observation_required ? "required" : ""}"><legend>${x.observation_required ? "Escolha uma opção obrigatória" : "Escolha uma opção (opcional)"}</legend><div class="inline-options-list">${choices.map((option) => `<button type="button" class="inline-option ${option === null ? "optional-clear " : ""}${String(x.observation || "") === String(option || "") ? "selected" : ""}" data-item-option="${escape(key)}" data-option-value="${escape(option || "")}">${escape(option || "Sem preferência")}</button>`).join("")}</div></fieldset>`;
}
function renderCart() {
  let count = 0,
    total = 0;
  $("cartItems").innerHTML =
    [...cart.entries()]
      .map(([key, x]) => {
        count += x.qty;
        total += x.qty * x.price;
        const note = String(x.observation || ""),
          required = !!x.observation_required,
          options = Array.isArray(x.observation_options)
            ? x.observation_options
            : [],
          maximum = Number(x.max_quantity || 99),
          thumb = x.image_url
            ? `<img src="${escape(x.image_url)}" alt="" loading="lazy">`
            : '<span aria-hidden="true">☕</span>';
        const productTotal = [...cart.values()]
          .filter((item) => item.id === x.id)
          .reduce((sum, item) => sum + item.qty, 0);
        return `<div class="cart-item"><div class="cart-item-thumb">${thumb}</div><div class="cart-item-copy"><strong>${escape(x.name)}</strong><small>${money.format(x.price)} cada</small><button class="item-note ${note ? "has-note" : ""}" data-item-note="${escape(key)}" aria-label="${note ? "Editar" : "Adicionar"} observação em ${escape(x.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.48 9.1 9.1 0 0 1-3.63-.9L4 20l1.36-3.64A7.23 7.23 0 0 1 4 12C4 7.86 7.58 4.5 12 4.5s8 3.13 8 7Z"/><path d="M8.5 11.8h.01M12 11.8h.01M15.5 11.8h.01"/></svg><span>${note ? "Editar observação" : required ? "Preencher observação *" : "Adicionar observação"}</span></button>${note ? `<em title="${escape(note)}">${escape(note)}</em>` : ""}</div><div class="cart-item-actions"><div class="qty"><button data-line-dec="${escape(key)}" aria-label="Diminuir quantidade" ${x.qty<=1?'disabled':''}>−</button><b>${x.qty}</b><button data-line-add="${escape(key)}" aria-label="Adicionar outro" ${productTotal >= maximum ? "disabled" : ""}>+</button></div><button class="remove-item" data-line-remove="${escape(key)}" aria-label="Excluir ${escape(x.name)} do pedido"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div>${inlineOptions(x, key)}</div>`;
      })
      .join("") || '<p class="empty">Seu carrinho está vazio.</p>';
  $("cartCount").textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  $("cartHeaderTotal").textContent = money.format(total);
  $("cartTotal").textContent = money.format(total);
  $("cartButton").classList.toggle("has-items", count > 0);
  localStorage.setItem("zuqui_cart", JSON.stringify([...cart]));
}
function splitConfigurableQuantities() {
  const normalized = new Map();
  for (const [key, item] of cart) {
    const product = data.products.find((candidate) => candidate.id === item.id),
      current = product ? { ...item, ...product } : item,
      configurable =
        (Array.isArray(current.observation_options) &&
          current.observation_options.length > 0) ||
        current.observation_required,
      quantity = Math.max(1, Number(current.qty) || 1);
    if (!configurable || quantity === 1) {
      normalized.set(key, current);
      continue;
    }
    for (let index = 0; index < quantity; index++)
      normalized.set(`${current.id}:${crypto.randomUUID()}`, {
        ...current,
        qty: 1,
        observation: index === 0 ? String(current.observation || "") : "",
      });
  }
  cart = normalized;
}
const renderCartBase = renderCart;
renderCart = function () {
  renderCartBase();
  if (!sending) $("reviewButton").textContent = "Ler comanda e enviar";
};
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]"),
    lineAdd = e.target.closest("[data-line-add]"),
    lineDec = e.target.closest("[data-line-dec]"),
    lineRemove = e.target.closest("[data-line-remove]"),
    cat = e.target.closest("[data-cat]");
  if (add) {
    const p = data.products.find((x) => x.id === add.dataset.add);
    if (!p) return;
    const configurable =
        (Array.isArray(p.observation_options) &&
          p.observation_options.length > 0) ||
        p.observation_required,
      total = [...cart.values()]
        .filter((item) => item.id === p.id)
        .reduce((sum, item) => sum + item.qty, 0),
      maximum = Number(p.max_quantity || 99);
    if (total >= maximum)
      return toast(`Máximo de ${maximum} unidade(s) para ${p.name}`);
    if (configurable) {
      const amount = total === 0 ? Number(p.min_quantity || 1) : 1;
      for (let index = 0; index < amount && total + index < maximum; index++)
        cart.set(`${p.id}:${crypto.randomUUID()}`, {
          ...p,
          price: Number(p.source_price ?? p.price),
          qty: 1,
          observation: "",
        });
      renderCart();
      toast(`${total + amount} × ${p.name} no pedido`);
      return;
    }
    const existing = configurable
        ? null
        : [...cart.entries()].find(([, item]) => item.id === p.id),
      key = existing?.[0] || `${p.id}:${crypto.randomUUID()}`,
      item = existing
        ? {
            ...existing[1],
            ...p,
            price: Number(p.source_price ?? p.price),
            qty: existing[1].qty + 1,
          }
        : {
            ...p,
            price: Number(p.source_price ?? p.price),
            qty: configurable ? 1 : Number(p.min_quantity || 1),
            observation: configurable
              ? ""
              : String(p.default_observation || ""),
          };
    cart.set(key, item);
    renderCart();
    toast(`${total + 1} × ${p.name} no pedido`);
  }
  if (lineAdd) {
    const key = lineAdd.dataset.lineAdd,
      item = cart.get(key);
    if (item) {
      const configurable =
          (Array.isArray(item.observation_options) &&
            item.observation_options.length > 0) ||
          item.observation_required,
        total = [...cart.values()]
          .filter((candidate) => candidate.id === item.id)
          .reduce((sum, candidate) => sum + candidate.qty, 0),
        maximum = Number(item.max_quantity || 99);
      if (total >= maximum)
        return toast(`Máximo de ${maximum} unidade(s) para ${item.name}`);
      if (configurable)
        cart.set(`${item.id}:${crypto.randomUUID()}`, {
          ...item,
          qty: 1,
          observation: "",
        });
      else item.qty++;
      renderCart();
    }
  }
  if (lineDec) {
    const key = lineDec.dataset.lineDec,
      item = cart.get(key);
    if (item && (item.qty <= 1 || --item.qty < 1)) cart.delete(key);
    renderCart();
  }
  if (lineRemove) {
    const item = cart.get(lineRemove.dataset.lineRemove);
    cart.delete(lineRemove.dataset.lineRemove);
    renderCart();
    if (item) toast(`${item.name} removido do pedido`);
  }
  if (cat) {
    active = cat.dataset.cat;
    render();
    if (innerWidth < 760)
      $("categoryTitle").scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }
});
document.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-item-option]");
  if (!choice) return;
  const key = choice.dataset.itemOption,
    item = cart.get(key);
  if (!item) return;
  item.observation = choice.dataset.optionValue || "";
  cart.set(key, item);
  $("cartMessage").textContent = "";
  renderCart();
});
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-item-note]");
  if (!button) return;
  const item = cart.get(button.dataset.itemNote);
  if (!item) return;
  editingNoteId = button.dataset.itemNote;
  const options = Array.isArray(item.observation_options)
    ? item.observation_options
    : [];
  $("itemNoteTitle").textContent = item.name;
  $("itemNoteChoices").innerHTML = options
    .map(
      (option) =>
        `<label class="item-note-choice"><input type="radio" name="itemNoteChoice" value="${escape(option)}" ${item.observation === option ? "checked" : ""}><span>${escape(option)}</span></label>`,
    )
    .join("");
  $("itemNoteChoices").hidden = !options.length;
  // Respeita a configuração editorial do produto: quando existem opções
  // cadastradas, o cliente escolhe uma delas; caso contrário, digita livremente.
  $("itemNoteCustomLabel").hidden = !!options.length;
  $("clearItemNote").hidden = !!options.length;
  $("itemNoteText").value = item.observation || "";
  $("itemNoteCount").textContent = $("itemNoteText").value.length;
  $("itemNoteMessage").textContent = "";
  $("itemNoteDialog").showModal();
  if (!options.length) requestAnimationFrame(() => $("itemNoteText").focus());
});
$("itemNoteChoices").onchange = (e) => {
  if (e.target.matches('input[name="itemNoteChoice"]')) {
    $("itemNoteText").value = e.target.value;
    $("itemNoteCount").textContent = e.target.value.length;
    $("itemNoteMessage").textContent = "";
  }
};
$("itemNoteText").oninput = () => {
  $("itemNoteCount").textContent = $("itemNoteText").value.length;
};
$("closeItemNote").onclick = () => $("itemNoteDialog").close();
$("clearItemNote").onclick = () => {
  $("itemNoteText").value = "";
  $("itemNoteCount").textContent = "0";
  $("itemNoteText").focus();
};
$("saveItemNote").onclick = () => {
  const item = cart.get(editingNoteId),
    value = $("itemNoteText").value.trim();
  if (item?.observation_required && !value) {
    $("itemNoteMessage").textContent = "Escolha uma opção para continuar.";
    return;
  }
  if (item) {
    item.observation = value;
    cart.set(editingNoteId, item);
    renderCart();
  }
  $("itemNoteDialog").close();
};
function toggle(open) {
  $("cart").classList.toggle("open", open);
  $("overlay").classList.toggle("open", open);
  $("cart").setAttribute("aria-hidden", String(!open));
}
$("cartButton").onclick = () => toggle(true);
$("closeCart").onclick = $("overlay").onclick = () => toggle(false);
function tokenFrom(raw) {
  let token = "";
  try {
    const u = new URL(raw, location.origin);
    token = u.searchParams.get("claim") || "";
  } catch {}
  if (!token && /^[a-f0-9]{64}$/i.test(raw.trim())) token = raw.trim();
  if (!token) throw new Error("Este QR não é uma comanda válida do Zuqui.");
  return token;
}
async function acceptClaim(raw) {
  const token = tokenFrom(raw);
  if (sending) return;
  $("scannerMessage").textContent = "Validando comanda…";
  const result = await api("validate_card_claim", { card_claim: token });
  cardClaim = token;
  cardLabel = result.card_label;
  sessionStorage.setItem("zuqui_card_claim", token);
  sessionStorage.setItem("zuqui_card_label", cardLabel);
  stopScanner();
  updateIdentity();
  const continuation = afterScan;
  afterScan = null;
  if (continuation === "submit") return submitOrder();
  toast(`Comanda ${cardLabel} identificada`);
  if (continuation === "cart") toggle(true);
  if (continuation === "account") showAccount();
  if (continuation === "waiter") showWaiter();
}
async function qrReader() {
  if (!qrReaderClass) {
    const module = await import("https://esm.sh/@zxing/browser@0.1.5");
    qrReaderClass = module.BrowserQRCodeReader;
  }
  return new qrReaderClass();
}
async function startScanner(continuation = null) {
  afterScan = continuation;
  $("scannerDialog").showModal();
  $("scannerMessage").textContent = "Abrindo câmera…";
  try {
    const reader = await qrReader();
    scannerControls = await reader.decodeFromVideoDevice(
      undefined,
      $("scannerVideo"),
      (result) => {
        if (result)
          acceptClaim(result.getText()).catch(
            (e) => ($("scannerMessage").textContent = e.message),
          );
      },
    );
    $("scannerMessage").textContent =
      "Câmera ativa. Aponte para o QR da comanda.";
  } catch {
    $("scannerMessage").textContent =
      "Não foi possível abrir a câmera. Permita o acesso ou escolha uma foto do QR.";
  }
}
function stopScanner() {
  scannerControls?.stop();
  scannerControls = null;
  $("scannerVideo")
    .srcObject?.getTracks()
    .forEach((t) => t.stop());
  if ($("scannerDialog").open) $("scannerDialog").close();
}
$("closeScanner").onclick = stopScanner;
$("scannerDialog").addEventListener("close", () => {
  scannerControls?.stop();
  scannerControls = null;
});
$("qrImage").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const reader = await qrReader(),
      result = await reader.decodeFromImageUrl(url);
    await acceptClaim(result.getText());
  } catch (err) {
    $("scannerMessage").textContent =
      err.message || "Não foi possível reconhecer o QR nesta imagem.";
  } finally {
    URL.revokeObjectURL(url);
    e.target.value = "";
  }
};
$("identifyCardButton").onclick = () => cardClaim ? startScanner() : toggle(true);
$("scanFromCart").onclick = () => startScanner("cart");
function orderFingerprint() {
  return JSON.stringify(
    [...cart.values()]
      .map((x) => [x.id, x.qty, String(x.observation || "")])
      .sort(),
  );
}
function showOrderResult(success, message = "", secondFailure = false) {
  const dialog = $("orderResultDialog");
  dialog.classList.toggle("success", success);
  dialog.classList.toggle("error", !success);
  $("orderResultIcon").textContent = success ? "✓" : "!";
  $("orderResultTitle").textContent = success
    ? "PEDIDO ENVIADO"
    : "PEDIDO NÃO ENVIADO";
  $("orderResultMessage").textContent = success
    ? ""
    : secondFailure
      ? "Avise o atendente."
      : message;
  $("reviewFailedOrder").hidden = success || secondFailure;
  $("closeOrderResult").hidden = success || secondFailure;
  if (!dialog.open) dialog.showModal();
  if (success || secondFailure)
    setTimeout(
      () => {
        if (dialog.open) dialog.close();
      },
      success ? 4000 : 6000,
    );
}
async function submitOrder() {
  if (sending) return;
  if (!cardClaim) return startScanner("submit");
  const fingerprint = orderFingerprint();
  sending = true;
  $("reviewButton").disabled = true;
  $("reviewButton").textContent = "Enviando…";
  $("cartMessage").textContent = "";
  try {
    const result = await api("create_order", {
      card_claim: cardClaim,
      reference_id: referenceId,
      note: $("orderNote").value,
      items: [...cart.values()].map((x) => ({
        product_id: x.id,
        quantity: x.qty,
      })),
    });
    let state = result;
    for (
      let attempt = 0;
      attempt < 30 &&
      !["success", "failed", "uncertain"].includes(state.status);
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      state = await api("order_status", {
        guid: result.guid,
        receipt: result.receipt,
      });
    }
    if (state.status === "success") {
      failedOrders.delete(fingerprint);
      toggle(false);
      showOrderResult(true);
      cart.clear();
      $("orderNote").value = "";
      renderCart();
    } else {
      const attempts = (failedOrders.get(fingerprint) || 0) + 1;
      failedOrders.set(fingerprint, attempts);
      toggle(false);
      showOrderResult(
        false,
        state.error_message || "Revise o pedido e tente novamente.",
        attempts >= 2,
      );
    }
  } catch (e) {
    const attempts = (failedOrders.get(fingerprint) || 0) + 1;
    failedOrders.set(fingerprint, attempts);
    toggle(false);
    showOrderResult(
      false,
      e.message || "Revise o pedido e tente novamente.",
      attempts >= 2,
    );
  } finally {
    sending = false;
    $("reviewButton").disabled = false;
    $("reviewButton").textContent = "Lançar na comanda";
  }
}
$("reviewButton").onclick = () => {
  const ref = reference();
  if (!ref) {
    $("cartMessage").textContent =
      "Abra o cardápio pelo QR da mesa para definir o local da entrega.";
    return;
  }
  if (!cart.size) {
    $("cartMessage").textContent = "Adicione pelo menos um produto ao pedido.";
    return;
  }
  const missingEntry = [...cart.entries()].find(
      ([, x]) => x.observation_required && !String(x.observation || "").trim(),
    ),
    missing = missingEntry?.[1];
  if (missingEntry) {
    const hasOptions =
      Array.isArray(missing.observation_options) &&
      missing.observation_options.length;
    $("cartMessage").textContent = hasOptions
      ? `Escolha uma opção para ${missing.name}.`
      : `Preencha a observação obrigatória de ${missing.name}.`;
    document
      .querySelector(
        hasOptions
          ? `[data-item-option="${missingEntry[0]}"]`
          : `[data-item-note="${missingEntry[0]}"]`,
      )
      ?.focus();
    return;
  }
  if (!data.ordering_enabled) {
    $("cartMessage").textContent = "Pedidos ainda não estão disponíveis.";
    return;
  }
  $("cartMessage").textContent = "";
  startScanner("submit");
};
$("closeOrderResult").onclick = () => $("orderResultDialog").close();
$("reviewFailedOrder").onclick = () => {
  $("orderResultDialog").close();
  $("reviewButton").textContent = "Ler comanda e enviar";
  toggle(true);
};
const updateIdentityBase = updateIdentity;
updateIdentity = function () {
  updateIdentityBase();
  $("callWaiterButton").disabled = !(cardClaim || reference());
};
async function showAccount() {
  if (!cardClaim) return startScanner("account");
  $("accountDialog").showModal();
  $("accountTitle").textContent = `Comanda ${cardLabel}`;
  $("accountContent").innerHTML =
    '<p class="loading">Atualizando lançamentos…</p>';
  try {
    const a = await api("account_summary", { card_claim: cardClaim });
    $("accountContent").innerHTML =
      `<div class="account-total"><span>Total confirmado pelo cardápio digital</span><strong>${money.format(a.total)}</strong></div><div class="account-orders">${a.orders.map((o) => `<article><div><b>Pedido ${escape(o.order_number || "digital")}</b><small>${new Date(o.created_at).toLocaleString("pt-BR")}</small></div><strong>${money.format(o.total)}</strong></article>`).join("") || "<p>Nenhum lançamento digital confirmado nesta comanda.</p>"}</div><p class="account-disclaimer">Este valor inclui os pedidos confirmados por este cardápio. Consumos lançados diretamente no caixa ou pelo atendente podem não aparecer aqui; confirme o total final com a equipe.</p>`;
  } catch (e) {
    $("accountContent").innerHTML =
      `<p class="status-message error">${escape(e.message)}</p>`;
  }
}
$("accountButton").onclick = showAccount;
$("closeAccount").onclick = () => $("accountDialog").close();
function showWaiter() {
  if (!cardClaim) return startScanner("waiter");
  $("waiterMessage").textContent = "";
  $("waiterDialog").showModal();
}
$("callWaiterButton").onclick = showWaiter;
$("closeWaiter").onclick = () => $("waiterDialog").close();
document.querySelectorAll("[data-service]").forEach(
  (button) =>
    (button.onclick = async () => {
      document
        .querySelectorAll("[data-service]")
        .forEach((x) => (x.disabled = true));
      $("waiterMessage").className = "message status-message";
      $("waiterMessage").textContent = "Enviando solicitação…";
      try {
        const r = await api("create_service_request", {
          card_claim: cardClaim,
          reference_id: referenceId,
          request_type: button.dataset.service,
        });
        $("waiterMessage").className = "message status-message success";
        $("waiterMessage").textContent = r.already_open
          ? "Já existe uma solicitação aberta. A equipe foi avisada."
          : "Solicitação enviada para a equipe.";
      } catch (e) {
        $("waiterMessage").className = "message status-message error";
        $("waiterMessage").textContent = e.message;
      } finally {
        document
          .querySelectorAll("[data-service]")
          .forEach((x) => (x.disabled = false));
      }
    }),
);
(async () => {
  try {
    const urlClaim = params.get("claim");
    if (urlClaim) {
      history.replaceState(
        {},
        "",
        `${location.pathname}${referenceId ? `?reference=${encodeURIComponent(referenceId)}` : ""}`,
      );
      await acceptClaim(urlClaim);
    } else if (cardClaim) {
      try {
        const valid = await api("validate_card_claim", {
          card_claim: cardClaim,
        });
        cardLabel = valid.card_label;
      } catch {
        cardClaim = "";
        cardLabel = "";
        sessionStorage.removeItem("zuqui_card_claim");
        sessionStorage.removeItem("zuqui_card_label");
      }
    }
    data = await api("public_menu");
    splitConfigurableQuantities();
    render();
  } catch (e) {
    $("notice").textContent = e.message;
    $("products").innerHTML =
      '<div class="empty">Não foi possível carregar o cardápio agora.</div>';
    updateIdentity();
  }
})();
