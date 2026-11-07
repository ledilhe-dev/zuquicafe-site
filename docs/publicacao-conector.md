# Publicação do conector Raffinato

Cada nova versão do conector deve ser publicada nas duas superfícies abaixo com o mesmo executável e o mesmo SHA-256:

1. `https://checkdiario.com.br/`
2. `https://zuquicafe.com.br/cardapioAdm/`

No site do Zuqui, atualizar `CONNECTOR_VERSION` em `cardapioAdm/app.js`, incluir o executável e o arquivo SHA-256 em `downloads/` e alterar o identificador de cache de `app.js` em `cardapioAdm/index.html`.

Após a publicação, validar o texto da versão e baixar o executável nos dois domínios para comparar os hashes.
