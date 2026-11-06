# Estado de implementação

## Implementado
Aplicação, APIs, banco de dados, RLS, autenticação, empresas, dashboard, importação XLS/XLSX/CSV, pesquisa OpenStreetMap, modelos, campanhas revisadas, webhook Meta, histórico, consentimentos, auditoria e exportação JSON.

## Verificado
- 10 testes automatizados locais passaram.
- Sintaxe dos módulos verificada.
- Build estático local passou sem baixar SheetJS (rede local indisponível); o build na Vercel deve baixar o bundle oficial.
- Schema e hardening aplicados no Supabase.
- Um usuário autenticado não autorizado recebe check_admin=false e não lê empresas nem mensagens.

## Dependências externas
- Primeiro cadastro do administrador e confirmação do e-mail.
- Site URL e Redirect URLs no Supabase devem corresponder à publicação.
- SMTP próprio se o padrão Supabase não entregar ao administrador.
- Credenciais Meta, webhook, número comercial e aprovação dos modelos.
- Testes reais de WhatsApp e recuperação de senha não executados sem essas configurações.
- A pesquisa usa a cobertura variável do OpenStreetMap, com limite de 100 resultados.
- Modelos Meta desta versão suportam corpo em texto simples com até três parâmetros; não incluem mídias ou botões.
- Lotes são processados pela tela aberta, sem agendador em segundo plano.
- Backup JSON é manual; recuperação pontual depende da infraestrutura contratada.

Não confundir código de integração implementado com serviço externo autenticado e validado.
