# WebUp CRM

Plataforma interna de prospecção e gestão comercial. Backend Node.js 22 com APIs nativas, frontend modular sem framework e Supabase PostgreSQL/Auth. Hospedagem preparada para Vercel. Nenhum segredo é incluído no código.

## Executar
1. Copie .env.example para .env.local e preencha as variáveis.
2. npm run build (baixa a distribuição oficial SheetJS 0.20.3).
3. npm test
4. npm run dev

Não há dependências npm de execução. A importação utiliza SheetJS em um Web Worker local; o bundle é obtido do CDN oficial durante o build.

## Funcionalidades
- Login, cadastro inicial restrito ao e-mail configurado, confirmação de e-mail, recuperação de senha, edição de perfil e logout.
- Sessões em cookies HttpOnly, SameSite=Strict, Secure em HTTPS; renovação com refresh token.
- Empresas com busca e filtros, edição, telefone/CNPJ normalizados e índices únicos.
- Dashboard baseado em dados reais e funil comercial.
- Histórico de observações e consentimentos, retirada de autorização e auditoria.
- Planilhas XLS/XLSX/CSV: 2 MB, 500 registros, mapeamento e prévia. Duplicados podem ser ignorados, separados para revisão ou atualizados. Atualização não substitui campos por valores vazios nem altera o status.
- Pesquisa brasileira via OpenStreetMap/Overpass por cidade, UF, bairro e segmento. Limite de 10 consultas por hora por administrador. Dados de cobertura variável; ausência de site não comprova inexistência.
- Modelos internos com variáveis; campanhas de até 100 contatos usando modelos de texto aprovados pela Meta (até três parâmetros numéricos).
- Revisão e confirmação de campanhas, rechecagem de consentimento e aprovação, reserva atômica por mensagem e nenhum reenvio automático em caso de resultado incerto.
- Webhook Meta assinado, mensagens recebidas, status e descadastramento por palavras-chave.
- Exportação de backup JSON e auditoria de alterações.

## Infraestrutura e segurança
A API valida sessão no Supabase em toda operação e vincula o administrador ao ID após confirmar seu e-mail. RLS também protege as tabelas contra acesso direto. A lista administrativa está no schema privado; não é baseada em user_metadata.

O endpoint de login inclui limite local por e-mail, complementando os limites do Supabase Auth. O limite local não é global entre instâncias serverless: ative as regras de rate limit da Vercel para /api/auth/* e CAPTCHA do Supabase antes de disponibilização ampla. A API verifica Origin em escritas. O frontend usa escape de HTML e CSP sem scripts inline.

Tokens da Meta e chave secreta do Supabase ficam somente no ambiente do servidor. A chave secreta é usada apenas no webhook assinado. Nenhum endpoint permite gravar credenciais pelo browser.

## Supabase
db/schema.sql registra a estrutura inicial aplicada ao projeto. Não reaplique sobre banco existente sem migração incremental.
Configure Authentication > URL Configuration:
- Site URL: URL de produção.
- Redirect URLs: URL de produção e http://localhost:3000.

A lista de administradores em private.allowed_admins precisa conter o e-mail do administrador (minúsculas). O ADMIN_EMAIL do servidor deve coincidir no primeiro cadastro. O primeiro acesso permite ao próprio administrador definir sua senha; não existe senha temporária compartilhada. O e-mail deve ser confirmado. Após a vinculação, a autorização acompanha o ID do usuário, inclusive ao alterar o e-mail.

No plano gratuito, o SMTP padrão pode enviar apenas para endereços autorizados da equipe Supabase; configure SMTP próprio caso necessário. Alteração de e-mail exige confirmação. Recuperação de senha depende de entrega do e-mail e Redirect URLs.

## Vercel
Importe o repositório, escolha Other, comando npm run build, saída dist e Node.js 22. Rotas de API em api/index.js. Configure:
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY
- APP_ORIGIN (origem exata, sem barra final)
- ADMIN_EMAIL

## WhatsApp oficial
Configure no servidor:
- META_ACCESS_TOKEN: token com acesso ao WABA e ao número comercial.
- META_PHONE_NUMBER_ID e META_WABA_ID.
- META_API_VERSION: versão ativa da Graph API escolhida no aplicativo Meta (ex.: v23.0, conferir validade).
- META_APP_SECRET: segredo do aplicativo para verificação HMAC.
- META_VERIFY_TOKEN: valor aleatório escolhido para o handshake.
- SUPABASE_SECRET_KEY: chave secreta do projeto, somente servidor.

No Meta for Developers, registre APP_ORIGIN/api/whatsapp/webhook, use o mesmo META_VERIFY_TOKEN e assine o campo messages. Cadastre modelos no WhatsApp Manager e aguarde aprovação. Parâmetros do corpo: {{1}} empresa, {{2}} cidade, {{3}} categoria. Mídia, cabeçalho e botões não são enviados por esta versão. A integração consulta até 100 modelos por chamada. A Meta pode cobrar pelos envios; nenhum disparo é realizado durante instalação ou testes.

O operador deve manter a tela aberta durante o processamento do lote; fechar a tela interrompe mensagens ainda pendentes. Envios já reservados não são reenviados automaticamente. Mensagens com estado sending/unknown devem ser reconciliadas com a Meta antes de qualquer reenvio manual.

## Dados e operação
Consentimentos não são inferidos a partir de telefone público. A importação nunca concede consentimento. Registre evidência e data; mantenha uma rotina de revisão de pedidos de retirada não reconhecidos automaticamente.
Faça exportações periódicas e guarde cópias criptografadas fora do sistema. Exportação JSON não substitui PITR ou backup nativo do PostgreSQL.
Exclusão de empresa com mensagens pode ser impedida pelas referências para preservar histórico.

## Validação e limites
npm test valida normalização, CSV, templates, assinatura de webhook, CSRF e bloqueio de acesso anônimo. Testes reais de e-mail e de Meta exigem as respectivas contas. Cobertura OSM não é um catálogo completo. A interface de pesquisa cobre o Brasil nesta versão. Campos de telefone, endereço e bairro podem faltar na fonte.

Consulte STATUS.md para o estado observado da implantação e verificações.
