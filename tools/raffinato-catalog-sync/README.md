# Sincronizador do catálogo Raffinato

Serviço Windows separado do CheckDiário. O SQL Server é acessado somente na rede da loja, a credencial local é protegida por DPAPI e o envio ao site usa HTTPS de saída com token próprio. Dados e permissões não são misturados com o CheckDiário.

## Instalação

1. No servidor da padaria, instale Python 3.11+, Microsoft ODBC Driver 17 e rode `pip install -r requirements.txt`.
2. Crie um usuário SQL exclusivo, com `SELECT` apenas em `Produto`, `PrecoProduto`, `UnidadeMedida` e `Agrupamento`.
3. No backend, gere um token aleatório e grave somente seu SHA-256 em `menu_catalog_connectors`, com `store_key = 'zuqui-filial-1'`.
4. Rode `python catalog_sync.py --setup`. A senha SQL e o token ficam em `catalog-sync.dat`, cifrados pelo Windows para esse usuário.
5. Confira sem enviar com `python catalog_sync.py --dry-run`; depois rode `python catalog_sync.py --once`.
6. Em PowerShell como administrador, rode `./install-task.ps1`. A tarefa inicia com o Windows e consulta pedidos manuais a cada 30 segundos.

O arquivo `catalog-sync.log` registra falhas. O painel mostra último contato, execuções e quantidade processada.

## Preservação dos dados do painel

O sincronizador atualiza somente os campos de origem. Ele não envia nem altera `description`, `image_url`, `category_id`, `sort_order`, `featured` ou `visible`. Produtos ausentes numa carga completa ficam indisponíveis, sem exclusão.

## Pedidos

Este serviço trata somente do catálogo. O envio de pedidos permanece desativado. Sem URL/porta, método e autenticação confirmados para `/RecebePedidos`, a opção segura é ampliar o serviço local para consumir uma fila autenticada do site e chamar o Raffinato dentro da rede. Nenhuma gravação SQL direta foi implementada.
