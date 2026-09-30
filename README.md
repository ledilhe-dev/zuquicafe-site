# Site institucional — Zuqui Café

Site estático em HTML, CSS e JavaScript, pronto para GitHub Pages e para o domínio `zuquicafe.com.br`.

## Visualizar localmente

Abra `index.html` no navegador ou, nesta pasta, rode um servidor local, por exemplo: `python -m http.server 8000`.

## Publicar no GitHub Pages

1. Crie um repositório vazio no GitHub e envie **somente o conteúdo desta pasta** para a raiz dele.
2. No repositório, acesse **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`.
4. Salve e aguarde a publicação.
5. Em **Custom domain**, informe `zuquicafe.com.br`. O arquivo `CNAME` já está incluído.
6. No provedor do domínio, configure os registros DNS indicados pelo GitHub e, após a propagação, marque **Enforce HTTPS**.

## Atualizar links e fotos

- WhatsApp, Instagram e iFood ficam centralizados no objeto `CONFIG`, no início de `script.js`.
- O WhatsApp está configurado como `(47) 98857-3125`.
- Instagram e iFood usam os links oficiais fornecidos.
- Para fotos reais, crie arquivos otimizados (WebP recomendado) dentro de `assets/` e substitua os blocos `.placeholder` da galeria e `.photo-slot` do destaque por elementos `<img>`.
- A galeria renderiza somente arquivos oficiais cadastrados em `galleryPhotos`, no final de `script.js`; quando vazia, nenhum bloco de foto é exibido.
- `assets/logo-transparente.png` contém a marca oficial com fundo removido; os favicons também são derivados dessa marca.

## Estrutura

- `index.html`: página principal e SEO
- `styles.css`: identidade visual e responsividade
- `script.js`: menu, links e animações
- `politica-de-privacidade.html` e `termos-de-uso.html`: páginas legais
- `robots.txt` e `sitemap.xml`: indexação
- `CNAME` e `.nojekyll`: GitHub Pages
- `assets/`: marca e imagens sociais

## Cardápio digital (não publicado)

As rotas em preparação são `/cardapio/` e `/cardapioAdm/`. Consulte `docs/cardapio-digital.md` para arquitetura, instalação segura e pendências da integração Raffinato. Pedidos públicos permanecem desabilitados até a validação explícita do primeiro teste.

Todos os caminhos são relativos e funcionam tanto em teste local quanto no domínio raiz.
