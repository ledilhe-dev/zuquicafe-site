// @ts-nocheck -- Supabase's generated relation type is an array at check time and an object at runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "https://zuquicafe.com.br",
  "Access-Control-Allow-Headers": "authorization,content-type,x-catalog-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
class OrderValidationError extends Error {
  code: string;
  productId: string;

  constructor(message: string, code: string, productId: string) {
    super(message);
    this.name = "OrderValidationError";
    this.code = code;
    this.productId = productId;
  }
}
const sha256 = async (v: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
const sendAdminInvite = async (db: any, email: string, nome: string) => {
  const { data, error } = await db.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: "https://zuquicafe.com.br/cardapioAdm/", data: { nome } },
  });
  if (error || !data?.properties?.action_link)
    throw error || new Error("Não foi possível gerar o link de validação.");
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromEmail = Deno.env.get("AUTH_FROM_EMAIL") || "";
  if (!resendKey || !fromEmail) throw new Error("Envio de e-mail não configurado.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${Deno.env.get("AUTH_FROM_NAME") || "Zuqui Café"} <${fromEmail}>`,
      to: [email],
      subject: "Valide seu acesso ao Cardápio Digital Zuqui",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#183328"><h2>Olá, ${escapeHtml(nome)}!</h2><p>Seu acesso administrativo ao Cardápio Digital Zuqui foi criado.</p><p><a href="${escapeHtml(data.properties.action_link)}" style="display:inline-block;padding:13px 20px;background:#20543f;color:#fff;text-decoration:none;border-radius:9px;font-weight:bold">Validar e-mail e definir senha</a></p><p style="font-size:13px;color:#66756e">Se você não solicitou este acesso, ignore esta mensagem.</p></div>`,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id)
    throw new Error(`O provedor de e-mail recusou o envio (HTTP ${response.status}).`);
  return result.id as string;
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "Método não permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!,
    anon = Deno.env.get("SUPABASE_ANON_KEY")!,
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    db = createClient(url, service, { auth: { persistSession: false } }),
    body = await req.json().catch(() => ({})),
    action = String(body.action || "");
  try {
    if (action === "connector_dispatch_bootstrap") {
      const instanceId = String(body.connector_instance_id || "").trim(),
        credential = String(body.credential || "").trim(),
        expectedCompany = Deno.env.get("CHECKDIARIO_EMPRESA_ID") || "";
      if (!/^[0-9a-f-]{36}$/i.test(instanceId) || credential.length < 40)
        return out({ error: "Identidade do conector inválida." }, 401);
      const checkdiario = createClient(
          Deno.env.get("CHECKDIARIO_URL")!,
          Deno.env.get("CHECKDIARIO_SERVICE_ROLE_KEY")!,
          { auth: { persistSession: false } },
        ),
        { data: trusted } = await checkdiario
          .from("raffinato_connector_instances")
          .select("id,empresa_id,status")
          .eq("id", instanceId)
          .eq("empresa_id", expectedCompany)
          .eq("credencial_hash", await sha256(credential))
          .neq("status", "revogado")
          .maybeSingle();
      if (!trusted)
        return out({ error: "Conector não autorizado para esta loja." }, 403);
      const { data: connector } = await db
        .from("menu_catalog_connectors")
        .select("id,store_key,raffinato_branch_id")
        .eq("active", true)
        .limit(1)
        .single();
      if (!connector)
        return out({ error: "Vínculo do cardápio não encontrado." }, 409);
      const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(48)))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const { error: updateError } = await db
        .from("menu_catalog_connectors")
        .update({
          installation_id: instanceId,
          installation_name: "Servidor da loja",
          token_hash: await sha256(rawToken),
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", connector.id);
      if (updateError) throw updateError;
      return out({
        backend_url: `${url}/functions/v1/cardapio-api`,
        sync_token: rawToken,
        id_filial: Number(connector.raffinato_branch_id),
        store_key: connector.store_key,
      });
    }
    if (action === "admin_service_requests") {
      const bearer = req.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "");
      if (!bearer) return out({ error: "Sessão obrigatória" }, 401);
      const {
        data: { user },
      } = await db.auth.getUser(bearer);
      if (!user) return out({ error: "Sessão inválida" }, 401);
      const { data: profile } = await db
        .from("menu_admin_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return out({ error: "Acesso negado" }, 403);
      if (body.resolve_id) {
        const { error } = await db
          .from("menu_service_requests")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", body.resolve_id);
        if (error) throw error;
      }
      const { data, error } = await db
        .from("menu_service_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return out({ requests: data || [] });
    }
    if (action === "validate_card_claim") {
      const claim = String(body.card_claim || ""),
        { data: c } = await db
          .from("menu_card_claims")
          .select("card_id,menu_cards!inner(label,available)")
          .eq("token_hash", await sha256(claim))
          .eq("active", true)
          .single();
      if (!c || !c.menu_cards?.available)
        return out({ error: "QR da comanda inválido ou substituído." }, 400);
      return out({ valid: true, card_label: c.menu_cards.label });
    }
    if (action === "account_summary") {
      const claim = String(body.card_claim || ""),
        { data: c } = await db
          .from("menu_card_claims")
          .select("card_id,menu_cards!inner(label,available)")
          .eq("token_hash", await sha256(claim))
          .eq("active", true)
          .single();
      if (!c || !c.menu_cards?.available)
        return out({ error: "QR da comanda inválido ou substituído." }, 400);
      const { data: orders, error } = await db
        .from("menu_orders")
        .select(
          "id,numeropedido,created_at,menu_order_items(quantity,unit_price)",
        )
        .eq("card_id", c.card_id)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const normalized = (orders || []).map((o: any) => ({
        order_number: o.numeropedido,
        created_at: o.created_at,
        total: (o.menu_order_items || []).reduce(
          (sum: number, item: any) =>
            sum + Number(item.quantity) * Number(item.unit_price),
          0,
        ),
      }));
      return out({
        card_label: c.menu_cards.label,
        total: normalized.reduce((sum: number, o: any) => sum + o.total, 0),
        orders: normalized,
        scope: "digital_confirmed",
      });
    }
    if (action === "create_service_request") {
      const allowed = ["Atendimento", "Fechar conta", "Dúvida no pedido"],
        requestType = String(body.request_type || "");
      if (!allowed.includes(requestType))
        return out({ error: "Tipo de atendimento inválido." }, 400);
      const claim = String(body.card_claim || ""),
        { data: c } = await db
          .from("menu_card_claims")
          .select("card_id,menu_cards!inner(label,available)")
          .eq("token_hash", await sha256(claim))
          .eq("active", true)
          .single();
      if (!c || !c.menu_cards?.available)
        return out({ error: "QR da comanda inválido ou substituído." }, 400);
      let reference: any = null;
      if (body.reference_id) {
        const result = await db
          .from("menu_references")
          .select("id,name")
          .eq("id", body.reference_id)
          .eq("available", true)
          .maybeSingle();
        reference = result.data;
      }
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        { data: existing } = await db
          .from("menu_service_requests")
          .select("id")
          .eq("card_id", c.card_id)
          .eq("status", "pending")
          .gte("created_at", cutoff)
          .limit(1)
          .maybeSingle();
      if (existing) return out({ ok: true, already_open: true });
      const { error } = await db.from("menu_service_requests").insert({
        card_id: c.card_id,
        card_label: c.menu_cards.label,
        reference_id: reference?.id || null,
        reference_name: reference?.name || null,
        request_type: requestType,
      });
      if (error) throw error;
      return out({ ok: true, already_open: false, delivery: "admin_queue" });
    }
    if (action === "forgot_password") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return out({ error: "Informe um e-mail válido." }, 400);
      const { data: usersResult, error: usersError } = await db.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (usersError) throw usersError;
      const user = usersResult.users.find((item) =>
        String(item.email || "").trim().toLowerCase() === email
      );
      if (user) {
        const { data: adminProfile } = await db
          .from("menu_admin_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (adminProfile) {
          const auth = createClient(url, anon, { auth: { persistSession: false } });
          const { error } = await auth.auth.resetPasswordForEmail(email, {
            redirectTo: "https://zuquicafe.com.br/cardapioAdm/",
          });
          if (error) throw error;
        }
      }
      return out({ ok: true });
    }
    if (action === "login_v2") {
      const auth = createClient(url, anon, { auth: { persistSession: false } }),
        requestedEmail = String(body.email || "").trim().toLowerCase();
      if (!requestedEmail)
        return out({ error: "Credenciais invalidas" }, 401);
      const { data, error } = await auth.auth.signInWithPassword({
        email: requestedEmail,
        password: String(body.password || ""),
      });
      if (error || !data.session)
        return out({ error: "Credenciais invalidas" }, 401);
      if (!data.user.email_confirmed_at) {
        await auth.auth.signOut();
        return out({ error: "Confirme o e-mail antes de entrar." }, 403);
      }
      const { data: adminProfile } = await db
        .from("menu_admin_profiles")
        .select("must_change_password,nome")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (!adminProfile) {
        await auth.auth.signOut();
        return out({ error: "Acesso administrativo não autorizado." }, 403);
      }
      return out({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        must_change_password: !!adminProfile?.must_change_password,
      });
    }
    if (action === "refresh_session") {
      const auth = createClient(url, anon, { auth: { persistSession: false } }),
        { data, error } = await auth.auth.refreshSession({
          refresh_token: String(body.refresh_token || ""),
        });
      if (error || !data.session) return out({ error: "Sessao expirada" }, 401);
      return out({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      });
    }
    if (
      action.startsWith("catalog_sync_") &&
      action !== "catalog_sync_request"
    ) {
      const token = req.headers.get("x-catalog-token") || "";
      if (!token) return out({ error: "Token do conector obrigatório." }, 401);
      const { data: connector } = await db
        .from("menu_catalog_connectors")
        .select("*,menu_stores!inner(id,store_key,name,active)")
        .eq("token_hash", await sha256(token))
        .eq("active", true)
        .single();
      if (!connector || !connector.store_id || !connector.menu_stores?.active)
        return out({ error: "Conector não vinculado a uma loja ativa." }, 403);
      if (Number(body.id_filial) !== Number(connector.raffinato_branch_id))
        return out(
          { error: "Filial não pertence ao vínculo deste conector." },
          403,
        );
      const storeKey = connector.menu_stores.store_key,
        branchId = Number(connector.raffinato_branch_id);
      await db
        .from("menu_catalog_connectors")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", connector.id);
      const reportedVersion = String(body.connector_version || "").trim();
      if (reportedVersion) {
        await db.from("menu_dispatcher_leases").upsert({
          store_key: storeKey,
          source_branch_id: branchId,
          connector_version: reportedVersion,
          last_seen_at: new Date().toISOString(),
        });
      }
      if (action === "catalog_sync_connection_test") {
        await db
          .from("menu_catalog_connectors")
          .update({
            connection_tested_at: new Date().toISOString(),
            connection_test_error: null,
          })
          .eq("id", connector.id);
        return out({
          ok: true,
          store: connector.menu_stores.name,
          branch_id: branchId,
          installation_id: connector.installation_id,
        });
      }
      if (action === "catalog_sync_pending") {
        const { data: q } = await db
          .from("menu_catalog_sync_requests")
          .select("id")
          .eq("store_key", storeKey)
          .eq("status", "pending")
          .order("requested_at")
          .limit(1)
          .maybeSingle();
        return out({
          request_id: q?.id || null,
          work_requested:
            !!q ||
            (!!connector.demand_until &&
              new Date(connector.demand_until).getTime() > Date.now()),
        });
      }
      if (action === "catalog_sync_request_fail") {
        const requestId = String(body.request_id || "").trim(),
          message = String(body.error || "Falha local antes do início da sincronização.").slice(0, 1000);
        const { error } = await db.from("menu_catalog_sync_requests").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
        }).eq("id", requestId).eq("store_key", storeKey).eq("status", "pending");
        if (error) throw error;
        return out({ ok: true });
      }
      if (action === "catalog_sync_order_pending") {
        const dispatcherVersion = String(body.connector_version || "");
        const preferredDispatcher = [
          "2.0.9",
          "2.0.10",
          "2.0.11",
          "2.0.12",
          "2.0.13",
          "2.0.14", "2.0.15", "2.0.16",
        ].includes(dispatcherVersion);
        if (preferredDispatcher) {
          await db.from("menu_dispatcher_leases").upsert({
            store_key: storeKey,
            source_branch_id: branchId,
            connector_version: dispatcherVersion,
            last_seen_at: new Date().toISOString(),
          });
        } else {
          const cutoff = new Date(Date.now() - 15_000).toISOString();
          const { data: activeDispatcher } = await db
            .from("menu_dispatcher_leases")
            .select("connector_version")
            .eq("store_key", storeKey)
            .eq("source_branch_id", branchId)
            .gte("last_seen_at", cutoff)
            .maybeSingle();
          if (
            ["2.0.9", "2.0.10", "2.0.11", "2.0.12", "2.0.13", "2.0.14", "2.0.15", "2.0.16"].includes(
              activeDispatcher?.connector_version,
            )
          )
            return out({
              order: null,
              delegated_to: activeDispatcher.connector_version,
            });
        }
        // Pedidos pendentes são preservados durante pausa ou indisponibilidade.
        // Ao reativar, o conector retoma a fila na ordem de criação.
        const { data: q } = await db
          .from("menu_orders")
          .select(
            "id,guid,card_label,reference_name,note,request_payload,created_at",
          )
          .eq("store_key", storeKey)
          .eq("source_branch_id", branchId)
          .eq("status", "pending_integration")
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (!q) return out({ order: null });
        const { data: claimed } = await db
          .from("menu_orders")
          .update({
            status: "dispatching",
            dispatch_started_at: new Date().toISOString(),
          })
          .eq("id", q.id)
          .eq("status", "pending_integration")
          .select("id")
          .maybeSingle();
        return out({ order: claimed ? q : null });
      }
      if (action === "catalog_sync_order_result") {
        const orderId = String(body.order_id || ""),
          rawResult = body.result || {},
          result = Array.isArray(rawResult?.result)
            ? rawResult.result[0] || {}
            : rawResult,
          timedOut = !!body.timed_out,
          success = result.gravado === true,
          status = timedOut ? "uncertain" : success ? "success" : "failed";
        const { data: order } = await db
          .from("menu_orders")
          .select("id")
          .eq("id", orderId)
          .eq("store_key", storeKey)
          .eq("source_branch_id", branchId)
          .eq("status", "dispatching")
          .single();
        if (!order)
          return out(
            { error: "Pedido não pertence a esta fila ou já foi concluído." },
            409,
          );
        const errorMessage = timedOut
          ? "Timeout: resultado incerto; confira o Raffinato antes de qualquer nova tentativa."
          : success
            ? null
            : String(body.error || "A API não confirmou gravado: true").slice(
                0,
                1000,
              );
        const { error } = await db
          .from("menu_orders")
          .update({
            status,
            response_payload: rawResult,
            http_status:
              body.http_status == null ? null : Number(body.http_status),
            idvenda: success ? String(result.idvenda || "") || null : null,
            numeropedido: success
              ? String(result.numeropedido || "") || null
              : null,
            error_message: errorMessage,
            sent_at: new Date().toISOString(),
          })
          .eq("id", orderId);
        if (error) throw error;
        return out({ ok: true, status });
      }
      if (action === "catalog_sync_order_recent") {
        const { data: orders } = await db
          .from("menu_orders")
          .select(
            "id,guid,status,http_status,response_payload,error_message,request_payload,created_at,sent_at",
          )
          .eq("store_key", storeKey)
          .eq("source_branch_id", branchId)
          .order("created_at", { ascending: false })
          .limit(10);
        return out({ orders: orders || [] });
      }
      if (action === "catalog_sync_start") {
        if (!connector.connection_tested_at)
          return out(
            {
              error:
                "Execute o teste de conexão antes da primeira sincronização.",
            },
            409,
          );
        // O catalogo completo era reenviado periodicamente mesmo sem qualquer
        // alteracao no Raffinato. Alem das Edge invocations, isso produziu
        // milhoes de UPDATEs nas mesmas poucas milhares de linhas. Uma carga
        // completa agora so nasce de uma solicitacao explicita do painel.
        if (!body.request_id)
          return out(
            {
              error:
                "Sincronizacao automatica desativada. Use Sincronizar no painel quando precisar atualizar o cardapio.",
              code: "MANUAL_CATALOG_SYNC_REQUIRED",
            },
            409,
          );
        const { data: run, error } = await db
          .from("menu_catalog_sync_runs")
          .insert({
            store_key: storeKey,
            mode: body.mode === "full" ? "full" : "incremental",
          })
          .select("id")
          .single();
        if (error) throw error;
        if (body.request_id)
          await db
            .from("menu_catalog_sync_requests")
            .update({ status: "running", started_at: new Date().toISOString() })
            .eq("id", body.request_id)
            .eq("store_key", storeKey);
        return out({ run_id: run.id });
      }
      if (action === "catalog_sync_batch") {
        const products = Array.isArray(body.products) ? body.products : [];
        if (products.length > 200)
          return out({ error: "Lote excede 200 produtos." }, 400);
        const now = new Date().toISOString(),
          catRows = [
            ...new Map(
              products
                .filter((p: any) => p.idcategoria)
                .map((p: any) => [
                  Number(p.idcategoria),
                  {
                    store_key: storeKey,
                    source_branch_id: branchId,
                    raffinato_category_id: Number(p.idcategoria),
                    name: String(p.categoria || `Categoria ${p.idcategoria}`),
                    source_name: String(p.categoria || ""),
                    source_tree: p.arvore || null,
                    source_updated_at: now,
                  },
                ]),
            ).values(),
          ];
        if (catRows.length) {
          const { error: ce } = await db
            .from("menu_categories")
            .upsert(catRows, {
              onConflict: "store_key,source_branch_id,raffinato_category_id",
            });
          if (ce) throw ce;
        }
        const { data: cats } = await db
            .from("menu_categories")
            .select("id,raffinato_category_id")
            .eq("store_key", storeKey)
            .eq("source_branch_id", branchId),
          catMap = new Map(
            (cats || []).map((x: any) => [
              Number(x.raffinato_category_id),
              x.id,
            ]),
          ),
          rows = products.map((p: any) => ({
            store_key: storeKey,
            source_branch_id: branchId,
            raffinato_product_id: Number(p.idproduto),
            category_id: catMap.get(Number(p.idcategoria)) || null,
            name: String(p.nomereduzido || p.nome),
            price: Number(p.preco || 0),
            source_name: String(p.nomereduzido || p.nome),
            source_price: p.preco == null ? null : Number(p.preco),
            source_barcode: p.codigobarra || null,
            source_unit: p.unidade || null,
            source_category_id: p.idcategoria || null,
            source_category_name: p.categoria || null,
            source_category_tree: p.arvore || null,
            source_allows_fractional: !!p.permite_fracao,
            source_available: !!p.ativo,
            available: !!p.ativo,
            source_updated_at: now,
            source_sync_run_id: body.run_id,
          }));
        const { error } = await db.from("menu_products").upsert(rows, {
          onConflict: "store_key,source_branch_id,raffinato_product_id",
        });
        if (error) throw error;
        await db.rpc("increment_catalog_sync_processed", {
          run_uuid: body.run_id,
          amount: rows.length,
        });
        return out({ processed: rows.length });
      }
      if (action === "catalog_sync_finish") {
        const { data: run } = await db
          .from("menu_catalog_sync_runs")
          .select("*")
          .eq("id", body.run_id)
          .eq("store_key", storeKey)
          .single();
        if (!run) return out({ error: "Execução inválida." }, 404);
        if (run.mode === "full")
          await db
            .from("menu_products")
            .update({
              source_available: false,
              available: false,
              source_updated_at: new Date().toISOString(),
            })
            .eq("store_key", storeKey)
            .eq("source_branch_id", branchId)
            .or(
              `source_sync_run_id.is.null,source_sync_run_id.neq.${body.run_id}`,
            );
        await db
          .from("menu_catalog_sync_runs")
          .update({ status: "success", finished_at: new Date().toISOString() })
          .eq("id", body.run_id);
        await db
          .from("menu_catalog_sync_requests")
          .update({ status: "success", finished_at: new Date().toISOString() })
          .eq("store_key", storeKey)
          .eq("status", "running");
        return out({ ok: true, processed: run.processed });
      }
      if (action === "catalog_sync_fail") {
        await db
          .from("menu_catalog_sync_runs")
          .update({
            status: "failed",
            error_message: String(body.error || "Erro desconhecido").slice(
              0,
              1000,
            ),
            finished_at: new Date().toISOString(),
          })
          .eq("id", body.run_id);
        await db
          .from("menu_catalog_sync_requests")
          .update({
            status: "failed",
            error_message: String(body.error || "Erro desconhecido").slice(
              0,
              1000,
            ),
            finished_at: new Date().toISOString(),
          })
          .eq("store_key", storeKey)
          .eq("status", "running");
        return out({ ok: true });
      }
    }
    if (action === "public_menu") {
      const { data: connector } = await db
        .from("menu_catalog_connectors")
        .select("store_key,raffinato_branch_id,connection_tested_at")
        .eq("active", true)
        .not("store_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (!connector?.connection_tested_at)
        return out({
          categories: [],
          products: [],
          cards: [],
          references: [],
          ordering_enabled: false,
          notice: "Loja ainda não vinculada ao conector.",
        });
      await db
        .from("menu_catalog_connectors")
        .update({ demand_until: new Date(Date.now() + 15 * 60_000).toISOString() })
        .eq("store_key", connector.store_key)
        .eq("raffinato_branch_id", connector.raffinato_branch_id);
      const { data: categories } = await db
        .from("menu_categories")
        .select("*")
        .eq("store_key", connector.store_key)
        .eq("source_branch_id", connector.raffinato_branch_id)
        .eq("available", true)
        .eq("digital_enabled", true)
        .order("sort_order");
      const { data: banners } = await db
        .from("menu_banners")
        .select("id,title,alt_text,image_url,sort_order")
        .eq("available", true)
        .order("sort_order")
        .order("created_at");
      const categoryIds = (categories || []).map((x: any) => x.id);
      let rawProducts: any[] = [];
      if (categoryIds.length) {
        const { data } = await db
          .from("menu_products")
          .select("*")
          .eq("store_key", connector.store_key)
          .eq("source_branch_id", connector.raffinato_branch_id)
          .eq("source_available", true)
          .eq("available", true)
          .in("category_id", categoryIds)
          .order("sort_order")
          .limit(5000);
        rawProducts = data || [];
      }
      const [{ data: cards }, { data: references }, { data: settings }] =
          await Promise.all([
            db
              .from("menu_cards")
              .select("id,label,available,sort_order")
              .eq("available", true)
              .order("sort_order"),
            db
              .from("menu_references")
              .select("*")
              .eq("available", true)
              .order("sort_order"),
            db.from("menu_settings").select("*").single(),
          ]),
        products = rawProducts.filter(
          (p: any) => p.cardapio_override !== false,
        );
      const orderedCategories = (categories || [])
          .filter((category: any) => !(Number(category.sort_order) > 0))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
          ),
        positionedCategories = (categories || [])
          .filter((category: any) => Number(category.sort_order) > 0)
          .sort(
            (a: any, b: any) =>
              Number(a.sort_order) - Number(b.sort_order) ||
              String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
          );
      for (const category of positionedCategories) {
        const index = Math.min(
          Math.max(Number(category.sort_order) - 1, 0),
          orderedCategories.length,
        );
        orderedCategories.splice(index, 0, category);
      }
      return out({
        categories: orderedCategories,
        products,
        banners: banners || [],
        cards,
        references,
        ordering_enabled: !!settings?.ordering_enabled,
      });
    }
    if (action === "login") {
      const auth = createClient(url, anon, { auth: { persistSession: false } }),
        requestedEmail = String(body.email || "").trim().toLowerCase();
      if (!requestedEmail)
        return out({ error: "Credenciais inválidas" }, 401);
      const { data, error } = await auth.auth.signInWithPassword({
        email: requestedEmail,
        password: String(body.password || ""),
      });
      if (error || !data.session)
        return out({ error: "Credenciais inválidas" }, 401);
      if (!data.user.email_confirmed_at) {
        await auth.auth.signOut();
        return out({ error: "Confirme o e-mail antes de entrar." }, 403);
      }
      const { data: profile } = await db
        .from("menu_admin_profiles")
        .select("must_change_password,nome")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (!profile) {
        await auth.auth.signOut();
        return out({ error: "Acesso administrativo não autorizado." }, 403);
      }
      return out({
        access_token: data.session.access_token,
        must_change_password: !!profile?.must_change_password,
      });
    }
    let profile: any = null;
    if (!["create_order", "order_status"].includes(action)) {
      const bearer = req.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "");
      if (!bearer) return out({ error: "Sessão obrigatória" }, 401);
      const {
        data: { user },
      } = await db.auth.getUser(bearer);
      if (!user) return out({ error: "Sessão inválida" }, 401);
      const result = await db
        .from("menu_admin_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      profile = result.data;
      if (!profile) return out({ error: "Acesso negado" }, 403);
    }
    if (action === "change_password") {
      if (String(body.password || "").length < 12)
        return out({ error: "Use pelo menos 12 caracteres." }, 400);
      const bearer =
          req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "",
        {
          data: { user },
        } = await db.auth.getUser(bearer);
      if (!user) return out({ error: "Sessão inválida" }, 401);
      const { error } = await db.auth.admin.updateUserById(user.id, {
        password: String(body.password),
      });
      if (error) throw error;
      await db
        .from("menu_admin_profiles")
        .update({ must_change_password: false })
        .eq("user_id", user.id);
      return out({ ok: true });
    }
    if (profile?.must_change_password)
      return out({ error: "Troque a senha inicial antes de continuar." }, 403);
    if (action === "list_admin_users") {
      const [{ data: profiles, error: profilesError }, { data: usersResult, error: usersError }] =
        await Promise.all([
          db.from("menu_admin_profiles").select("user_id,nome,created_at").order("nome"),
          db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);
      if (profilesError) throw profilesError;
      if (usersError) throw usersError;
      const usersById = new Map(usersResult.users.map((item) => [item.id, item]));
      return out({
        users: (profiles || []).map((item) => {
          const user = usersById.get(item.user_id);
          return {
            id: item.user_id,
            nome: item.nome,
            email: user?.email || "",
            email_verificado: !!user?.email_confirmed_at,
          };
        }),
      });
    }
    if (action === "create_admin_user") {
      const nome = String(body.nome || "").trim().replace(/\s+/g, " "),
        email = String(body.email || "").trim().toLowerCase();
      if (nome.length < 2) return out({ error: "Informe o nome." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return out({ error: "Informe um e-mail válido." }, 400);
      const { data: existingUsers, error: listError } = await db.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listError) throw listError;
      if (existingUsers.users.some((item) => String(item.email || "").toLowerCase() === email))
        return out({ error: "Este e-mail já possui cadastro." }, 409);
      const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://zuquicafe.com.br/cardapioAdm/",
        data: { nome },
      });
      if (inviteError || !invited.user) throw inviteError || new Error("Convite não criado.");
      const { error: profileError } = await db.from("menu_admin_profiles").insert({
        user_id: invited.user.id,
        username: email,
        nome,
        must_change_password: true,
      });
      if (profileError) {
        await db.auth.admin.deleteUser(invited.user.id);
        throw profileError;
      }
      return out({ ok: true });
    }
    if (action === "resend_admin_invite") {
      const userId = String(body.user_id || "").trim();
      const { data: targetProfile } = await db.from("menu_admin_profiles")
        .select("user_id,nome").eq("user_id", userId).maybeSingle();
      if (!targetProfile) return out({ error: "Usuário não encontrado." }, 404);
      const { data: targetResult, error: targetError } = await db.auth.admin.getUserById(userId);
      const target = targetResult?.user;
      if (targetError || !target?.email) return out({ error: "E-mail do usuário não encontrado." }, 404);
      if (target.email_confirmed_at) return out({ error: "Este e-mail já foi validado." }, 409);
      const emailId = await sendAdminInvite(db, target.email, targetProfile.nome || target.email);
      return out({ ok: true, delivery_registered: true, email_id: emailId });
    }
    if (action === "send_admin_password_reset") {
      const userId = String(body.user_id || "").trim();
      const { data: targetProfile } = await db
        .from("menu_admin_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!targetProfile) return out({ error: "Usuário não encontrado." }, 404);
      const { data: targetResult, error: targetError } = await db.auth.admin.getUserById(userId);
      if (targetError || !targetResult.user?.email)
        return out({ error: "E-mail do usuário não encontrado." }, 404);
      const auth = createClient(url, anon, { auth: { persistSession: false } });
      const { error } = await auth.auth.resetPasswordForEmail(targetResult.user.email, {
        redirectTo: "https://zuquicafe.com.br/cardapioAdm/",
      });
      if (error) throw error;
      return out({ ok: true });
    }
    if (action === "admin_snapshot") {
      const names = [
          "categories",
          "products",
          "banners",
          "cards",
          "references",
          "orders",
        ] as const,
        res: any = {};
      for (const n of names) {
        const table =
          n === "categories"
            ? "menu_categories"
            : n === "products"
              ? "menu_products"
              : n === "banners"
                ? "menu_banners"
                : n === "cards"
                  ? "menu_cards"
                  : n === "references"
                    ? "menu_references"
                    : "menu_orders";
        const { data } = await db
          .from(table)
          .select("*")
          .order(n === "orders" ? "created_at" : "sort_order", {
            ascending: n !== "orders",
          })
          .limit(n === "orders" ? 100 : 5000);
        res[n] = data || [];
      }
      const { data: i } = await db
          .from("menu_integration")
          .select("endpoint_url,http_method,auth_type,notes")
          .single(),
        { data: s } = await db.from("menu_settings").select("*").single(),
        { data: runs } = await db
          .from("menu_catalog_sync_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(20),
        { data: connector } = await db
          .from("menu_catalog_connectors")
          .select("store_key,last_seen_at,active")
          .limit(1)
          .maybeSingle();
      return out({
        ...res,
        integration: {
          ...i,
          ready: !!(i?.endpoint_url && i?.http_method && i?.auth_type),
          test_validated: !!s?.test_validated,
          waiter_id: Number(s?.waiter_id || 20),
          test_idvenda: s?.test_idvenda || null,
          test_numeropedido: s?.test_numeropedido || null,
          test_validated_at: s?.test_validated_at || null,
        },
        ordering_enabled: !!s?.ordering_enabled,
        catalog_sync: { runs: runs || [], connector },
      });
    }
    if (action === "catalog_status") {
      const [
        { data: stores },
        { data: connectors },
        { data: runs },
        { data: requests },
        { data: dispatchers },
      ] =
        await Promise.all([
          db
            .from("menu_stores")
            .select("id,store_key,name,active")
            .order("name"),
          db
            .from("menu_catalog_connectors")
            .select(
              "id,installation_id,installation_name,store_id,store_key,raffinato_branch_id,active,last_seen_at,connection_tested_at,connection_test_error",
            )
            .order("created_at"),
          db
            .from("menu_catalog_sync_runs")
            .select("*")
            .order("started_at", { ascending: false })
            .limit(20),
          db
            .from("menu_catalog_sync_requests")
            .select("id,store_key,status,requested_at,started_at,finished_at,error_message")
            .order("requested_at", { ascending: false })
            .limit(20),
          db
            .from("menu_dispatcher_leases")
            .select("store_key,source_branch_id,connector_version,last_seen_at")
            .order("last_seen_at", { ascending: false })
            .limit(20),
        ]);
      return out({
        stores: stores || [],
        connectors: connectors || [],
        runs: runs || [],
        requests: requests || [],
        dispatchers: dispatchers || [],
      });
    }
    if (action === "catalog_products_page") {
      const page = Math.max(0, Number(body.page || 0)),
        { data, error } = await db
          .from("menu_products")
          .select("*")
          .order("raffinato_product_id")
          .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      return out({ products: data || [], page });
    }
    if (action === "link_connector") {
      const { data: store } = await db
          .from("menu_stores")
          .select("*")
          .eq("id", body.store_id)
          .eq("active", true)
          .single(),
        { data: connector } = await db
          .from("menu_catalog_connectors")
          .select("*")
          .eq("installation_id", body.installation_id)
          .single();
      if (!store || !connector)
        return out({ error: "Loja ou instalação inexistente." }, 404);
      if (connector.store_id && connector.store_id !== store.id)
        return out({ error: "Esta instalação já pertence a outra loja." }, 409);
      const { error } = await db
        .from("menu_catalog_connectors")
        .update({
          store_id: store.id,
          store_key: store.store_key,
          raffinato_branch_id: Number(body.branch_id),
          connection_tested_at: null,
          connection_test_error: null,
        })
        .eq("id", connector.id);
      if (error) throw error;
      return out({ ok: true });
    }
    if (action === "set_category_enabled") {
      const { data: cat } = await db
        .from("menu_categories")
        .select("id,store_key,source_branch_id")
        .eq("id", body.id)
        .single();
      if (!cat) return out({ error: "Grupo inválido." }, 404);
      await db
        .from("menu_categories")
        .update({ digital_enabled: !!body.enabled })
        .eq("id", cat.id);
      return out({ ok: true });
    }
    if (action === "set_product_override") {
      const value = body.enabled === null ? null : !!body.enabled,
        { data: product } = await db
          .from("menu_products")
          .select("id,category_id")
          .eq("id", body.id)
          .single();
      if (!product) return out({ error: "Produto invalido." }, 404);
      if (value === true && product.category_id) {
        const { data: category } = await db
          .from("menu_categories")
          .select("digital_enabled")
          .eq("id", product.category_id)
          .single();
        if (!category?.digital_enabled) {
          await db
            .from("menu_products")
            .update({ cardapio_override: false, visible: false })
            .eq("category_id", product.category_id)
            .is("cardapio_override", null);
          await db
            .from("menu_categories")
            .update({ digital_enabled: true })
            .eq("id", product.category_id);
        }
      }
      const { error } = await db
        .from("menu_products")
        .update({ cardapio_override: value, visible: value === true })
        .eq("id", product.id);
      if (error) throw error;
      return out({
        ok: true,
        category_auto_enabled: value === true && !!product.category_id,
      });
    }
    if (action === "set_products_override") {
      const ids = Array.isArray(body.ids)
        ? [...new Set(body.ids.map(String))]
        : [];
      if (!ids.length || ids.length > 500)
        return out(
          { error: "Selecione entre 1 e 500 produtos por lote." },
          400,
        );
      const value = !!body.enabled,
        { data: selected, error: selectedError } = await db
          .from("menu_products")
          .select("id,category_id")
          .in("id", ids);
      if (selectedError) throw selectedError;
      if (!selected || selected.length !== ids.length)
        return out(
          { error: "Um ou mais produtos nao foram encontrados." },
          404,
        );
      if (value) {
        const categoryIds = [
          ...new Set(selected.map((x: any) => x.category_id).filter(Boolean)),
        ];
        for (const categoryId of categoryIds) {
          const { data: category } = await db
            .from("menu_categories")
            .select("digital_enabled")
            .eq("id", categoryId)
            .single();
          if (!category?.digital_enabled) {
            await db
              .from("menu_products")
              .update({ cardapio_override: false, visible: false })
              .eq("category_id", categoryId)
              .is("cardapio_override", null);
            await db
              .from("menu_categories")
              .update({ digital_enabled: true })
              .eq("id", categoryId);
          }
        }
      }
      const { error } = await db
        .from("menu_products")
        .update({ cardapio_override: value, visible: value })
        .in("id", ids);
      if (error) throw error;
      return out({ ok: true, updated: ids.length });
    }
    if (action === "upload_product_image") {
      const productId = String(body.product_id || ""),
        base64 = String(body.data_base64 || "").replace(
          /^data:[^;]+;base64,/,
          "",
        );
      if (!productId || !base64)
        return out({ error: "Produto e imagem são obrigatórios." }, 400);
      if (base64.length > 4_300_000)
        return out({ error: "A imagem otimizada excede 3 MB." }, 413);
      const { data: product } = await db
        .from("menu_products")
        .select("id")
        .eq("id", productId)
        .maybeSingle();
      if (!product) return out({ error: "Produto não encontrado." }, 404);
      let bytes: Uint8Array;
      try {
        const binary = atob(base64);
        bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      } catch {
        return out({ error: "Arquivo de imagem inválido." }, 400);
      }
      if (bytes.byteLength > 3 * 1024 * 1024)
        return out({ error: "A imagem otimizada excede 3 MB." }, 413);
      const path = `${productId}/${crypto.randomUUID()}.webp`,
        { error } = await db.storage
          .from("menu-product-images")
          .upload(path, bytes, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: false,
          });
      if (error) throw error;
      const { data: publicData } = db.storage
        .from("menu-product-images")
        .getPublicUrl(path);
      return out({ ok: true, image_url: publicData.publicUrl });
    }
    if (action === "upload_banner_image") {
      const base64 = String(body.data_base64 || "").replace(
        /^data:[^;]+;base64,/,
        "",
      );
      if (!base64) return out({ error: "A imagem é obrigatória." }, 400);
      if (base64.length > 4_300_000)
        return out({ error: "A imagem excede 3 MB." }, 413);
      let bytes: Uint8Array;
      try {
        const binary = atob(base64);
        bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      } catch {
        return out({ error: "Arquivo de imagem inválido." }, 400);
      }
      const path = `banners/${crypto.randomUUID()}.webp`,
        { error } = await db.storage
          .from("menu-product-images")
          .upload(path, bytes, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: false,
          });
      if (error) throw error;
      const { data: publicData } = db.storage
        .from("menu-product-images")
        .getPublicUrl(path);
      return out({ ok: true, image_url: publicData.publicUrl });
    }
    if (action === "upsert_banner") {
      const row = {
        title: String(body.title || "").slice(0, 140),
        alt_text: String(body.alt_text || body.title || "").slice(0, 200),
        image_url: String(body.image_url || ""),
        available: body.available !== false,
        sort_order: Number(body.sort_order || 0),
      };
      if (!row.image_url) return out({ error: "A imagem é obrigatória." }, 400);
      const query = body.id
        ? db.from("menu_banners").update(row).eq("id", body.id)
        : db.from("menu_banners").insert(row);
      const { error } = await query;
      if (error) throw error;
      return out({ ok: true });
    }
    if (action === "delete_banner") {
      const { error } = await db
        .from("menu_banners")
        .delete()
        .eq("id", body.id);
      if (error) throw error;
      return out({ ok: true });
    }
    if (action === "update_product_editorial") {
      const displayName = String(body.display_name || "").trim() || null,
        minQuantity = Math.max(1, Math.floor(Number(body.min_quantity || 1))),
        maxQuantity = Math.min(
          999,
          Math.floor(Number(body.max_quantity || 99)),
        );
      if (maxQuantity < minQuantity)
        return out(
          {
            error: "A quantidade máxima deve ser igual ou maior que a mínima.",
          },
          400,
        );
      const options = Array.isArray(body.observation_options)
          ? [
              ...new Set(
                body.observation_options
                  .map((x: any) =>
                    String(x || "")
                      .trim()
                      .slice(0, 200),
                  )
                  .filter(Boolean),
              ),
            ].slice(0, 20)
          : [],
        defaultObservation =
          String(body.default_observation || "")
            .trim()
            .slice(0, 200) || null,
        { error } = await db
          .from("menu_products")
          .update({
            display_name: displayName,
            description: String(body.description || ""),
            image_url: body.image_url || null,
            additional_image_url: body.additional_image_url || null,
            animate_images:
              !!body.animate_images &&
              !!body.image_url &&
              !!body.additional_image_url,
            sort_order: Number(body.sort_order || 0),
            featured: !!body.featured,
            default_observation: defaultObservation,
            observation_options: options,
            observation_required: !!body.observation_required,
            min_quantity: minQuantity,
            max_quantity: maxQuantity,
          })
          .eq("id", body.id);
      if (error) throw error;
      return out({ ok: true });
    }
    if (action === "update_category_editorial") {
      const displayName = String(body.display_name || "").trim() || null,
        sortOrder = Math.max(0, Math.trunc(Number(body.sort_order || 0)));
      if (sortOrder > 0) {
        const { data: currentCategory } = await db
          .from("menu_categories")
          .select("store_key,source_branch_id")
          .eq("id", body.id)
          .single();
        if (!currentCategory)
          return out({ error: "Agrupamento não encontrado." }, 404);
        let conflictQuery = db
          .from("menu_categories")
          .select("id,display_name,source_name,name")
          .eq("sort_order", sortOrder)
          .neq("id", body.id);
        conflictQuery =
          currentCategory.store_key === null
            ? conflictQuery.is("store_key", null)
            : conflictQuery.eq("store_key", currentCategory.store_key);
        conflictQuery =
          currentCategory.source_branch_id === null
            ? conflictQuery.is("source_branch_id", null)
            : conflictQuery.eq(
                "source_branch_id",
                currentCategory.source_branch_id,
              );
        const { data: conflict } = await conflictQuery.limit(1).maybeSingle();
        if (conflict)
          return out(
            {
              error: `A ordem ${sortOrder} já está sendo usada por ${conflict.display_name || conflict.source_name || conflict.name}. Escolha outra posição.`,
            },
            409,
          );
      }
      const { error } = await db
        .from("menu_categories")
        .update({
          display_name: displayName,
          description: String(body.description || ""),
          sort_order: sortOrder,
        })
        .eq("id", body.id);
      if (error?.code === "23505")
        return out(
          {
            error: `A ordem ${sortOrder} já está sendo usada por outro agrupamento. Escolha outra posição.`,
          },
          409,
        );
      if (error) throw error;
      return out({ ok: true });
    }
    if (action === "link_connector_v2") {
      const { data: store } = await db
          .from("menu_stores")
          .select("*")
          .eq("id", body.store_id)
          .eq("active", true)
          .single(),
        { data: connector } = await db
          .from("menu_catalog_connectors")
          .select("*")
          .eq("installation_id", body.installation_id)
          .single();
      if (!store || !connector)
        return out({ error: "Loja ou instalacao inexistente." }, 404);
      if (connector.store_id && connector.store_id !== store.id)
        return out({ error: "Esta instalacao ja pertence a outra loja." }, 409);
      const changed =
          connector.store_id !== store.id ||
          connector.store_key !== store.store_key ||
          Number(connector.raffinato_branch_id) !== Number(body.branch_id),
        patch: any = {
          store_id: store.id,
          store_key: store.store_key,
          raffinato_branch_id: Number(body.branch_id),
        };
      if (changed) {
        patch.connection_tested_at = null;
        patch.connection_test_error = null;
      }
      const { error } = await db
        .from("menu_catalog_connectors")
        .update(patch)
        .eq("id", connector.id);
      if (error) throw error;
      return out({ ok: true, connection_test_preserved: !changed });
    }
    if (action === "catalog_sync_request") {
      const { data: connector } = await db
        .from("menu_catalog_connectors")
        .select("store_key,connection_tested_at")
        .eq("id", body.connector_id)
        .eq("active", true)
        .not("store_id", "is", null)
        .single();
      if (!connector)
        return out({ error: "Conector vinculado não encontrado." }, 404);
      if (!connector.connection_tested_at)
        return out({ error: "Teste a conexão antes de sincronizar." }, 409);
      const store = connector.store_key,
        { data: pending } = await db
          .from("menu_catalog_sync_requests")
          .select("id")
          .eq("store_key", store)
          .in("status", ["pending", "running"])
          .limit(1)
          .maybeSingle();
      if (pending)
        return out({ request_id: pending.id, already_pending: true });
      const { data: q, error } = await db
        .from("menu_catalog_sync_requests")
        .insert({ store_key: store })
        .select("id")
        .single();
      if (error) throw error;
      return out({ request_id: q.id });
    }
    if (action === "generate_card_claim") {
      const { data: card } = await db
        .from("menu_cards")
        .select("id,label")
        .eq("id", body.card_id)
        .single();
      if (!card) return out({ error: "Comanda inválida." }, 404);
      const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      await db
        .from("menu_card_claims")
        .update({ active: false })
        .eq("card_id", card.id);
      const { error } = await db
        .from("menu_card_claims")
        .insert({ card_id: card.id, token_hash: await sha256(raw) });
      if (error) throw error;
      return out({ token: raw, label: card.label });
    }
    if (action === "upsert_entity") {
      const map: any = {
          category: "menu_categories",
          product: "menu_products",
          card: "menu_cards",
          reference: "menu_references",
        },
        table = map[body.kind];
      if (!table) return out({ error: "Entidade inválida" }, 400);
      const row = { ...body };
      delete row.action;
      delete row.kind;
      const id = row.id;
      delete row.id;
      if (body.kind === "card") {
        row.label = row.label || row.name;
        row.virtual_code = row.virtual_code || row.label;
        delete row.name;
      } else if (body.kind !== "product") {
        row.name = row.name || row.label;
        delete row.label;
      }
      if (
        body.kind === "reference" &&
        row.print_sector_id != null &&
        (!Number.isInteger(Number(row.print_sector_id)) ||
          Number(row.print_sector_id) <= 0)
      )
        return out(
          { error: "Informe um ID de setor de impressão válido." },
          400,
        );
      if (body.kind === "reference" && row.print_sector_id != null)
        row.print_sector_id = Number(row.print_sector_id);
      if (body.kind !== "product")
        for (const k of [
          "description",
          "price",
          "image_url",
          "category_id",
          "featured",
          "visible",
        ])
          delete row[k];
      if (body.kind === "product")
        for (const k of [
          "name",
          "price",
          "available",
          "store_key",
          "raffinato_product_id",
          "source_name",
          "source_price",
          "source_available",
          "source_updated_at",
          "source_sync_run_id",
        ])
          delete row[k];
      const q = id
          ? db.from(table).update(row).eq("id", id)
          : db.from(table).insert(row),
        { error } = await q;
      if (error) throw error;
      return out({ ok: true });
    }
    if (action === "save_integration") {
      await db
        .from("menu_integration")
        .update({
          endpoint_url: body.endpoint_url || null,
          http_method: body.http_method || null,
          auth_type: body.auth_type || null,
          notes: body.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      return out({ ok: true });
    }
    if (action === "set_ordering") {
      const { data: s } = await db
        .from("menu_settings")
        .select("test_validated")
        .single();
      if (body.enabled && !s?.test_validated)
        return out(
          { error: "O teste da comanda 4 ainda não foi validado." },
          409,
        );
      await db
        .from("menu_settings")
        .update({ ordering_enabled: !!body.enabled })
        .eq("id", true);
      return out({ ok: true });
    }
    if (action === "save_order_settings") {
      const waiterId = Number(body.waiter_id);
      if (!Number.isInteger(waiterId) || waiterId <= 0)
        return out({ error: "Informe um ID de garçom válido." }, 400);
      await db
        .from("menu_settings")
        .update({ waiter_id: waiterId })
        .eq("id", true);
      return out({ ok: true, waiter_id: waiterId });
    }
    if (action === "confirm_local_test") {
      const idvenda = String(body.idvenda || "").trim(),
        numeropedido = String(body.numeropedido || "").trim();
      if (!/^\d+$/.test(idvenda) || !/^\d+$/.test(numeropedido))
        return out(
          {
            error:
              "Informe o idvenda e o número do pedido retornados pelo Raffinato.",
          },
          400,
        );
      await db
        .from("menu_settings")
        .update({
          test_validated: true,
          test_idvenda: idvenda,
          test_numeropedido: numeropedido,
          test_validated_at: new Date().toISOString(),
        })
        .eq("id", true);
      return out({ ok: true });
    }
    if (action === "create_order") {
      const { data: s } = await db
        .from("menu_settings")
        .select("ordering_enabled,test_validated,waiter_id")
        .single();
      if (!s?.ordering_enabled || !s?.test_validated)
        return out(
          {
            error: "Pedidos reais ainda não foram ativados pelo administrador.",
          },
          503,
        );
      const { data: connector } = await db
        .from("menu_catalog_connectors")
        .select("store_key,raffinato_branch_id,connection_tested_at")
        .eq("active", true)
        .not("store_id", "is", null)
        .limit(1)
        .single();
      if (!connector?.connection_tested_at)
        return out({ error: "Conector da loja indisponível." }, 503);
      await db
        .from("menu_catalog_connectors")
        .update({ demand_until: new Date(Date.now() + 15 * 60_000).toISOString() })
        .eq("store_key", connector.store_key)
        .eq("raffinato_branch_id", connector.raffinato_branch_id);
      const dispatcherCutoff = new Date(Date.now() - 15_000).toISOString(),
        { data: dispatcher } = await db
          .from("menu_dispatcher_leases")
          .select("connector_version,last_seen_at")
          .eq("store_key", connector.store_key)
          .eq("source_branch_id", connector.raffinato_branch_id)
          .gte("last_seen_at", dispatcherCutoff)
          .maybeSingle();
      if (!dispatcher)
        return out(
          {
            error:
              "Envio ao Raffinato temporariamente indisponível. O pedido não foi criado; avise um atendente.",
          },
          503,
        );
      const claim = String(body.card_claim || ""),
        { data: c } = await db
          .from("menu_card_claims")
          .select("id,card_id,menu_cards!inner(label,virtual_code,available)")
          .eq("token_hash", await sha256(claim))
          .eq("active", true)
          .single();
      if (!c || !c.menu_cards?.available)
        return out({ error: "QR da comanda inválido ou substituído." }, 400);
      const { data: ref } = await db
        .from("menu_references")
        .select("id,name,print_sector_id")
        .eq("id", body.reference_id)
        .eq("available", true)
        .single();
      if (!ref) return out({ error: "Ponto de referência inválido." }, 400);
      const printSectorId = Number(ref.print_sector_id || 0);
      if (!Number.isInteger(printSectorId) || printSectorId <= 0)
        return out(
          {
            error: `Defina no painel o ID do setor de impressão de ${ref.name}.`,
          },
          409,
        );
      const requested = Array.isArray(body.items) ? body.items : [];
      if (!requested.length) return out({ error: "Pedido vazio." }, 400);
      const { data: enabledCategories } = await db
          .from("menu_categories")
          .select("id")
          .eq("store_key", connector.store_key)
          .eq("source_branch_id", connector.raffinato_branch_id)
          .eq("available", true)
          .eq("digital_enabled", true),
        enabledCategoryIds = (enabledCategories || []).map((x: any) => x.id),
        ids = requested.map((x: any) => x.product_id),
        { data: products } = await db
          .from("menu_products")
          .select("*")
          .in("id", ids)
          .in("category_id", enabledCategoryIds)
          .eq("store_key", connector.store_key)
          .eq("source_branch_id", connector.raffinato_branch_id)
          .eq("available", true)
          .eq("source_available", true)
          .or("cardapio_override.is.null,cardapio_override.eq.true");
      if (!products || products.length !== new Set(ids).size)
        return out(
          { error: "Um produto ficou indisponível. Atualize o cardápio." },
          409,
        );
      const requestedTotals = requested.reduce(
          (totals: Map<string, number>, item: any) => {
            const productId = String(item.product_id || ""),
              quantity = Math.floor(Number(item.quantity));
            totals.set(productId, (totals.get(productId) || 0) + quantity);
            return totals;
          },
          new Map<string, number>(),
        ),
        guid = crypto.randomUUID(),
        receipt = crypto.randomUUID() + crypto.randomUUID(),
        items = requested.map((x: any) => {
          const p = products.find((v: any) => v.id === x.product_id),
            q = Math.floor(Number(x.quantity)),
            observation = String(x.observation || "")
              .trim()
              .slice(0, 200),
            minimum = Number(p?.min_quantity || 1),
            maximum = Number(p?.max_quantity || 99),
            configuredOptions = Array.isArray(p?.observation_options)
              ? p.observation_options
              : [];
          const productTotal = requestedTotals.get(String(x.product_id)) || 0;
          if (
            !p ||
            !Number.isFinite(q) ||
            q <= 0 ||
            productTotal < minimum ||
            productTotal > maximum
          )
            throw new OrderValidationError(
              `Quantidade de ${p?.display_name || p?.source_name || p?.name || "produto"} deve ficar entre ${minimum} e ${maximum}.`,
              "invalid_quantity",
              String(p?.id || x.product_id || ""),
            );
          if (p.observation_required && !observation)
            throw new OrderValidationError(
              `${p.display_name || p.source_name || p.name} precisa de uma escolha obrigatória.`,
              "missing_required_observation",
              String(p.id),
            );
          if (
            observation &&
            configuredOptions.length &&
            !configuredOptions.includes(observation)
          )
            throw new OrderValidationError(
              `A opção escolhida para ${p.display_name || p.source_name || p.name} não é válida.`,
              "invalid_observation_option",
              String(p.id),
            );
          return {
            product_id: p.id,
            raffinato_product_id: p.raffinato_product_id,
            name: p.source_name || p.name,
            quantity: q,
            unit_price: p.source_price ?? p.price,
            observation: observation || null,
            barcode: p.source_barcode || null,
            unit: p.source_unit || "UN",
            category_tree: p.source_category_tree || null,
            allows_fractional: !!p.source_allows_fractional,
          };
        }),
        payload = {
          guid,
          waiter_id: Number(s.waiter_id || 20),
          card_code: c.menu_cards.virtual_code,
          reference: ref.name,
          print_sector_id: printSectorId,
          note: "",
          items,
        };
      const { data: o, error } = await db
        .from("menu_orders")
        .insert({
          guid,
          store_key: connector.store_key,
          source_branch_id: connector.raffinato_branch_id,
          receipt_token_hash: await sha256(receipt),
          card_id: c.card_id,
          card_label: c.menu_cards.label,
          reference_id: ref.id,
          reference_name: ref.name,
          note: null,
          status: "pending_integration",
          request_payload: payload,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: itemError } = await db.from("menu_order_items").insert(
        items.map((x: any) => ({
          order_id: o.id,
          product_id: x.product_id,
          raffinato_product_id: x.raffinato_product_id,
          name: x.name,
          quantity: x.quantity,
          unit_price: x.unit_price,
          observation: x.observation,
        })),
      );
      if (itemError) throw itemError;
      await db
        .from("menu_card_claims")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", c.id);
      return out({
        guid,
        receipt,
        status: "pending_integration",
        card_label: c.menu_cards.label,
      });
    }
    if (action === "order_status") {
      const receipt = String(body.receipt || "");
      if (!receipt) return out({ error: "Comprovante inválido." }, 400);
      const { data: o } = await db
        .from("menu_orders")
        .select(
          "guid,status,card_label,idvenda,numeropedido,error_message,created_at",
        )
        .eq("guid", body.guid)
        .eq("receipt_token_hash", await sha256(receipt))
        .single();
      if (!o) return out({ error: "Pedido não encontrado." }, 404);
      if (
        o.status === "pending_integration" &&
        Date.now() - new Date(o.created_at).getTime() > 55_000
      ) {
        const errorMessage =
          "Conector local indisponível. O pedido não foi enviado.";
        await db
          .from("menu_orders")
          .update({
            status: "failed",
            error_message: errorMessage,
            sent_at: new Date().toISOString(),
          })
          .eq("guid", body.guid)
          .eq("status", "pending_integration");
        return out({ ...o, status: "failed", error_message: errorMessage });
      }
      return out(o);
    }
    if (action === "test_order") {
      const { data: i } = await db
        .from("menu_integration")
        .select("*")
        .single();
      if (!i?.endpoint_url || !i?.http_method || !i?.auth_type)
        return out(
          { error: "Complete URL, método e autenticação antes do teste." },
          409,
        );
      const now = new Date().toISOString(),
        guid = crypto.randomUUID(),
        payload = {
          isOldOrder: false,
          identificador: guid,
          idgarcom: 20,
          setorimpressao: "Nenhum",
          pedido: {
            nomereferencia: "MESA 04",
            itens: [
              {
                idproduto: 451,
                nomereduzido: "ACHOCOLATADO CHOCO LEITE 208ML",
                valor: 6.7,
                valorvariacao: null,
                arvore: "2.1",
                unidademedida: "UN",
                codigobarra: "7896060506483",
                observacao: "",
                permitevendafracionada: false,
                quantidade: 1,
                idgarcom: 20,
                valorunitario: 6.7,
                datahora: now,
                valortotal: 6.7,
              },
            ],
            ocupantes: 1,
            datahora: now,
          },
          cartaoconsumo: { nomecliente: "4", codigovirtual: "4" },
        };
      const { data: o, error } = await db
        .from("menu_orders")
        .insert({
          guid,
          card_label: "4",
          reference_name: "MESA 04",
          status: "sending",
          request_payload: payload,
        })
        .select()
        .single();
      if (error) throw error;
      const secret = Deno.env.get("RAFFINATO_AUTH_VALUE"),
        header = Deno.env.get("RAFFINATO_AUTH_HEADER");
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 15000);
      try {
        const headers: any = { "content-type": "application/json" };
        if (header && secret) headers[header] = secret;
        const r = await fetch(i.endpoint_url, {
          method: i.http_method,
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const response = await r.json().catch(() => ({ raw_response: true })),
          success = r.ok && response.gravado === true,
          status = success ? "success" : "failed";
        await db
          .from("menu_orders")
          .update({
            status,
            response_payload: response,
            http_status: r.status,
            idvenda: response.idvenda || null,
            numeropedido: response.numeropedido || null,
            error_message: success
              ? null
              : "Resposta não confirmou gravado: true",
            sent_at: new Date().toISOString(),
          })
          .eq("id", o.id);
        if (success)
          await db
            .from("menu_settings")
            .update({ test_validated: true })
            .eq("id", true);
        return out({
          status,
          message: success
            ? "Pedido gravado com sucesso."
            : "API não confirmou a gravação.",
          guid,
        });
      } catch (e) {
        clearTimeout(timer);
        const uncertain = e?.name === "AbortError";
        await db
          .from("menu_orders")
          .update({
            status: uncertain ? "uncertain" : "failed",
            error_message: uncertain
              ? "Timeout: resultado incerto; confira o log antes de reenviar."
              : String(e),
            sent_at: new Date().toISOString(),
          })
          .eq("id", o.id);
        return out(
          {
            status: uncertain ? "uncertain" : "failed",
            message: uncertain
              ? "Não reenvie automaticamente. Confira o Raffinato e o log."
              : String(e),
            guid,
          },
          uncertain ? 504 : 502,
        );
      }
    }
    return out({ error: "Ação desconhecida" }, 404);
  } catch (e) {
    if (e instanceof OrderValidationError)
      return out(
        { error: e.message, code: e.code, product_id: e.productId },
        422,
      );
    console.error(e);
    return out({ error: "Falha interna segura." }, 500);
  }
});
