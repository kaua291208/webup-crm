# Estado do WebUp CRM — versão 0.2.0

## Implementado
Login, cadastro inicial restrito, recuperação de senha, empresas, dashboard, importação XLS/XLSX/CSV, pesquisa OSM, modelos, campanhas, webhook Meta, histórico, consentimentos, auditoria e exportação JSON.

## Verificações
21 testes automatizados passaram, incluindo:
- sessão expirada e renovação com cookies HttpOnly/Secure;
- autenticação sem autorização administrativa;
- criação e normalização de empresas com serviços simulados;
- duplicados, CSRF, assinatura de webhook;
- consentimento revogado bloqueando envio;
- prevenção de reenvio de mensagem já reservada.
Os testes de integração usam respostas simuladas; não enviam mensagens reais.
Schema e hardening foram aplicados no Supabase. Usuário não autorizado não lê empresas nem mensagens.
O build de produção executa os testes antes de empacotar.

## Atualizações desta versão
- Importação em lotes de 25, com progresso e manutenção do número original da linha.
- Paginação de consentimentos e ordenação estável de empresas e exportações.
- Controle de origem aceita apenas os domínios exatos configurados e solicitações de mesma origem.
- Erros de acesso não são ocultados.
- Prévia de campanha inclui o rodapé do modelo da Meta.
- Runtime fixado no Node.js 22.
- Endpoint /api/health sem dados internos.

## Pendências de ativação
1. Configurar Site URL e Redirect URLs no Supabase para https://webup-crm-web-up3.vercel.app.
2. Criar o primeiro acesso com o e-mail administrativo autorizado e confirmar o e-mail. Não há senha padrão.
3. Configurar SMTP caso o envio padrão do Supabase não entregue o e-mail.
4. Configurar META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_WABA_ID, META_API_VERSION, META_APP_SECRET, META_VERIFY_TOKEN e SUPABASE_SECRET_KEY exclusivamente no ambiente da Vercel.
5. Registrar o webhook /api/whatsapp/webhook na Meta e aprovar modelos.

## Limites que permanecem
- Login por e-mail, recuperação, CRUD autenticado real, planilhas no navegador e envio Meta ainda precisam de validação completa com as contas configuradas.
- Pesquisa cobre o Brasil, até 100 resultados, conforme dados disponíveis no OpenStreetMap.
- Modelos Meta: texto simples, até três parâmetros; sem mídias ou botões.
- Processamento de campanhas requer a tela aberta; não há agendador em segundo plano.
- Backup JSON manual; não substitui recuperação nativa do banco.
- Limite local de login complementa o Supabase Auth, mas não é compartilhado entre instâncias da Vercel.
- A verificação visual local não foi possível: o navegador não alcançou o servidor de desenvolvimento.

O projeto não deve ser considerado integralmente validado até concluir as pendências acima.
