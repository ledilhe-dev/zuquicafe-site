# Cardápio digital — preparação segura

O site institucional é estático e publicado pelo GitHub Pages. O navegador não pode acessar a API privada do Raffinato nem guardar credenciais. As páginas novas chamam uma Supabase Edge Function, que mantém autenticação, dados, auditoria e segredos no servidor.

- `/cardapio/`: catálogo público e montagem do pedido.
- `/cardapioAdm/`: login e administração.
- `supabase/functions/cardapio-api`: API segura e intermediário futuro.
- `supabase/migrations/202609300001_cardapio_digital.sql`: banco e RLS.

Nada foi publicado. `cardapio-config.js` mantém `apiUrl` vazio e pedidos públicos começam desabilitados.

## Instalação futura

1. Criar ou selecionar um projeto Supabase autorizado.
2. Aplicar a migration.
3. Configurar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `CARDAPIO_ADMIN_EMAIL` como segredos.
4. Executar localmente `node tools/setup-cardapio-admin.mjs`. A senha inicial é solicitada e não é gravada no repositório; o primeiro login exige troca.
5. Implantar `cardapio-api` e preencher apenas sua URL pública em `cardapio-config.js`.

## Dados ainda ausentes para o Raffinato

- URL completa e porta de `/RecebePedidos`;
- método HTTP;
- tipo, cabeçalho e formato de autenticação;
- localização da API e caminho seguro até a rede da padaria;
- formato integral da resposta, além de `gravado: true`.

Credenciais devem existir somente como segredos `RAFFINATO_AUTH_HEADER` e `RAFFINATO_AUTH_VALUE`. Se a rota estiver apenas na LAN, será necessário agente local com conexão de saída ou VPN. Não deve existir fetch do navegador para IP privado nem INSERT direto no SQL Server.

## Primeiro teste

O teste administrativo usa comanda virtual `4`, referência textual `MESA 04`, garçom `20`, produto `451`, quantidade `1` e valor `6,70`, sempre com GUID e horário novos. Timeout vira `uncertain`, sem retentativa automática. O teste só é aprovado quando a resposta real contém `gravado: true`; apenas depois o controle de pedidos públicos é liberado.
