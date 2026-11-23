# Vila Caramelo — Gestão Pet Shop | TODO

Escopo: aplicativo Android Expo/React Native com backend e MySQL gerenciado. Banco inicial sem dados reais nem preços presumidos. O projeto não inclui integração a uma planilha ou calendário específico enquanto nenhuma fonte/credencial real tiver sido fornecida.

## 1. Acesso seguro e painel inicial
- [x] Proteger os dados operacionais por autenticação real já suportada pelo starter; não usar usuário fictício, bypass de desenvolvimento ou segredo incluído no APK.
- [x] Entregar tela inicial em português, com atalhos para **Agendar serviço**, **Conferir agenda**, **Incluir clientes** e **Extrato financeiro**; disponibilizar também atalho visível para **Gerenciar serviços**.
- [x] Exibir compromissos do dia e indicadores operacionais sem dados de demonstração apresentados como dados reais.
- [x] Usar interface móvel em retrato, com navegação inferior, cartões e formulários compactos, legibilidade e uso confortável com uma mão.

## 2. Tutores e pets
- [x] Cadastrar, pesquisar por nome/telefone/e-mail, visualizar, editar e arquivar tutores com **nome, telefone, endereço e e-mail**.
- [x] Permitir vários pets vinculados ao mesmo tutor; cadastrar e editar **nome, espécie (cães, gatos ou coelhos), raça, porte e observações**.
- [x] Exibir os pets no contexto do tutor e preservar o vínculo em agendamentos e pacotes.

## 3. Catálogo de serviços
- [x] Criar, listar, pesquisar, editar e ativar/inativar serviços, mantendo a modalidade/categoria, os portes aplicáveis e o preço configurável em BRL.
- [x] Contemplar modalidades para **banhos, tosas, tratamento com ozonioterapia O3 e taxas de transporte**; não cadastrar nem presumir preços reais não fornecidos. O catálogo é configurado pela loja, sem preços pré-carregados.
- [x] Permitir informar a duração do serviço para organização e avisos visuais de sobreposição na agenda; sobreposição não bloqueia o salvamento.

## 4. Agenda e atendimento
- [x] Criar e manter agendamentos vinculados a pet, tutor e serviço, registrando **data, hora, valor, forma de pagamento (Pix, dinheiro, cartão ou pacote), status e observações**.
- [x] Disponibilizar agenda em calendário com visões de **dia, semana e mês**, horários e navegação entre datas; mês exibe grade mensal e marca dias com agendamentos.
- [x] Permitir reagendar e cancelar, além de marcar atendimento em andamento e concluído; não contabilizar cancelados como atendimento ou receita.
- [x] Avisar sobre sobreposição de horários considerando a duração do serviço e permitir salvar/reagendar/restaurar mesmo assim; horários adjacentes não geram aviso e o servidor não rejeita conflito. Preservar serialização por dia e outras validações.
- [x] Registrar eventos no calendário Android/Google quando a pessoa autorizar acesso e selecionar um calendário disponível, guardando referência para atualizar ou cancelar o evento vinculado. O evento é criado no provedor de calendário do dispositivo; isso não configura sincronização cloud automática do app com Google.

## 5. Pacotes e controle de saldo
- [x] Criar e editar pacotes **mensais ou quinzenais** associados ao cliente e ao pet, com nome, vigência, preço, serviços/franquias e quantidade contratada.
- [x] Exibir saldo, histórico de uso e status **ativo/encerrado**; distinguir franquias utilizadas, reservadas em agendamentos pendentes e disponíveis, e destacar pacote expirado ou sem saldo.
- [x] Abater saldo automaticamente somente quando um agendamento elegível vinculado ao pacote for concluído; operação deve ser idempotente, impedindo baixa duplicada no mesmo atendimento. O servidor serializa reservas concorrentes por pacote e modalidade.
- [x] Reverter a baixa com histórico se um atendimento concluído for reaberto por fluxo administrativo permitido; preservar rastreabilidade dos consumos.
- [x] Registrar separadamente a venda/recebimento do pacote para que o financeiro diferencie venda de pacote e atendimento avulso.

## 6. Financeiro mensal
- [x] Registrar pagamentos relacionados a atendimentos avulsos e à venda de pacotes, com data, valor, forma de pagamento e referência à origem.
- [x] Exibir receitas de serviços avulsos separadas das vendas de pacotes, pagamentos recentes, faturamento por período, ticket médio, detalhamento por serviço e forma de pagamento e filtros de período.
- [x] Expressar valores em **BRL**; permitir consultar o mês e períodos anteriores; não somar pacotes consumidos como nova receita a cada banho.
- [x] Calcular receita somente a partir de pagamentos registrados/concluídos, sem incluir agendamento cancelado, valor pendente ou uso de pacote como nova venda. Datas de receita respeitam o fuso de São Paulo.

## 7. Google Drive/Sheets, calendário e exportação
- [x] Oferecer exportação de dados da loja para formato de planilha compartilhável/importável em Google Drive/Sheets, com cabeçalhos, datas e valores em formato consistente e sem vazar tokens/segredos.
- [ ] Manter o app preparado para sincronização automática/real-time com Google Drive/Sheets e Google Agenda descrita no resumo AppSheet; essa sincronização só poderá ser concluída depois que a fonte Google, conta, planilha e autorização/credenciais necessárias forem indicadas e conectadas.
- [x] Não declarar sincronização real-time concluída quando houver apenas exportação de arquivo ou evento local do Android; documentar explicitamente qualquer sincronização externa ainda não configurada. Eventos locais oferecem compensações/avisos em falhas externas e, para atendimentos cancelados ou não comparecidos ainda vinculados, ações de tentar limpar o evento ou desvincular a referência com orientação de remoção manual.

## 8. Marca e empacotamento Android
- [x] Preservar o lockup oficial unido **VILA CARAMELO + BANHO & TOSA**, sem redesenhar ou separar seus componentes; reutilizar assets oficiais existentes.
- [x] Aplicar laranja **#E67E22**, verde escuro **#1E3D2B**, marrom **#4B2E1A** e bege claro **#F5F1E8**, harmonizados com o tema escuro/cartões da referência.
- [x] Configurar os assets quadrados de launcher, adaptive icon e splash nativos mantendo nome, scheme e identificadores Android gerados pelo Expo.
- [x] Deixar o fonte e a configuração prontos para o build Android APK/AAB pelo fluxo oficial do Dashboard; não declarar APK emitido até o resultado real do build.
- [ ] Gerar e disponibilizar o arquivo **APK** somente após um build Android real bem-sucedido pelo Dashboard; bundle JS/Preview/QR do Expo Go não são APK.

## 9. Correções solicitadas em 22/10/2026
- [x] Ao tocar em **Data** no formulário da agenda Android, abrir um pop-up de calendário real para selecionar dia, mês e ano; eliminar digitação manual da data.
- [x] Ao tocar em **Horário**, abrir o relógio nativo Android em 24 horas; selecionar somente **hora e minuto** (`HH:mm`), sem exibir nem pedir segundos.
- [x] Validar que a data existe no calendário e que hora/minuto estão dentro da faixa válida; o servidor aceita o horário de minuto informado mesmo que o registro interno acrescente `:00` para armazenamento. A falha de validação permanece explicada no formulário e não fecha a tela.
- [x] Depois de salvar o atendimento, fechar o formulário somente quando a gravação principal tiver sido confirmada; se a sincronização opcional com o calendário do aparelho falhar, manter o agendamento salvo e mostrar aviso claro, evitando duplicidade por tentativa repetida.
- [x] Corrigir o estilo base dos campos com largura em duas colunas, restaurando cor/contraste e área de toque coerentes com o tema escuro.
- [x] Reestilizar **Voltar**, **Editar** e **Ativar/Inativar** na aba Serviços como botões com alvos de toque adequados, quebra responsiva e sem extravasamento no lado direito.
- [x] Incluir fallback de calendário e hora/minuto na prévia Web sem alterar o seletor nativo Android.
- [x] Cobrir as regras de calendário e horário com testes e validar TypeScript, lint, testes, exportação Expo Web e bundle JavaScript Android.

## 10. Calendário, cancelamento e etapas do atendimento — 22/10/2026
- [x] Ao cancelar um agendamento, remover seu cartão da lista ativa e do resumo/calendário visual; manter a linha com status Cancelado no banco para histórico, auditoria e proteção financeira, sem deixar de tentar remover seu evento Google. Se a exclusão no calendário falhar, mostrar tarefa compacta de limpeza e permitir tentar novamente.
- [x] Novos agendamentos devem selecionar a opção de sincronizar com Google Agenda por padrão e criar evento na agenda de uma conta Google editável/sincronizada no Android. Solicitar permissão fora do modal do formulário; priorizar agenda principal da conta Google, mostrar a conta selecionada, permitir trocar entre agendas Google e não escolher silenciosamente um calendário apenas local. Se não houver conta/agenda Google, explicar o requisito e não fingir sincronização.
- [x] Cada evento sincronizado deve permanecer ligado ao agendamento no app e abrir no calendário do aparelho quando a pessoa solicitar; cancelamento deve apagar o evento externo e limpar o vínculo do mesmo ID esperado, sem remover um vínculo concorrente mais recente, com retry se houver falha.
- [x] A sequência de atendimento deve ser obrigatória: **Agendado → Confirmar agendamento → Iniciar serviço → Concluir serviço → Confirmar pagamento** (para avulso). Confirmar não inicia serviço; iniciar não conclui; concluir não marca pagamento como recebido; a tela de pagamento só aparece depois de concluir. Atendimento por pacote consome a franquia ao concluir, sem confirmação de pagamento avulso.
- [x] A API rejeita saltos de etapa e confirmações de pagamento antes da conclusão, ainda que a chamada não venha da interface móvel.

## 11. Vigência automática de pacotes — 22/10/2026
- [x] Em plano **mensal**, considerar o primeiro uso na data de início e intervalos semanais de 7 dias; com franquia padrão de 4 banhos, a última utilização prevista e a data final serão o início + 21 dias.
- [x] Em plano **quinzenal**, considerar o primeiro uso na data de início e o seguinte 14 dias depois; com franquia padrão de 2 banhos, a data final será o início + 14 dias.
- [x] Calcular a data final automaticamente ao mudar a data inicial, a periodicidade ou a franquia dos serviços; exibir o campo de término somente para leitura, sem pedir digitação.
- [x] O cálculo usa os valores efetivamente selecionados; novos serviços recebem franquia padrão 4 (mensal) ou 2 (quinzenal), e alterar a periodicidade ajusta uma franquia que ainda está no padrão anterior sem apagar quantidades personalizadas.
- [x] O servidor calcula e persiste a própria data final ao criar/editar pacote, independentemente da tela; validar a data inicial e preservar os bloqueios existentes para não deixar atendimentos reservados fora da vigência.

### Exemplos verificados
Início em 22/10/2026 (quinta-feira): mensal com 4 usos termina em 12/11/2026; quinzenal com 2 usos termina em 05/11/2026. O servidor persiste a própria data calculada e não houve migração nem alteração de registros operacionais.

## 12. Agendamentos recorrentes reais do pacote — 22/10/2026
- [x] Ao criar um pacote, criar também um atendimento real na agenda interna para cada utilização recorrente do serviço selecionado, todos com a mesma hora escolhida, pet/tutor/pacote vinculados e status inicial **Agendado**.
- [x] A primeira ocorrência usa a data de início. Plano mensal repete cada 7 dias; plano quinzenal, cada 14 dias. A quantidade de eventos acompanha a franquia do serviço escolhido (mensal de 4 banhos = quatro domingos: início, +7, +14, +21; quinzenal de 2 = início e +14).
- [x] O formulário de pacote inclui início em calendário pop-up nativo e hora em seletor nativo de hora/minuto; se houver um único serviço incluído, selecioná-lo automaticamente para a série. Se houver mais de um, permitir escolher explicitamente qual benefício será agendado em cada repetição.
- [x] O servidor cria pacote e atendimentos de forma atômica; exige data/horário/serviço recorrente, valida tutor/pet e porte compatível de todos os serviços, franquia, disponibilidade, duração até meia-noite e data inicial, preservando os bloqueios atuais. Sobreposições são aceitas e não abortam a série.
- [x] Gerar um evento Google Agenda vinculado a cada atendimento, usando exatamente sua data/hora e serviço. Solicitar permissão/seleção de calendário antes de concluir o fluxo; se o evento Google falhar, manter atendimentos internos salvos, informar quantos não sincronizaram e permitir reparar cada vínculo sem duplicar os atendimentos. A fila local de retry persiste no aparelho entre reinícios, exibe pet/serviço/ocorrência/data/hora de cada pendência e, antes de criar evento em retry, consulta o vínculo já salvo no servidor.
- [x] Quando houver evento Google criado mas ainda sem vínculo, exibir pet, serviço, ocorrência e horário; permitir abrir o evento, vincular o mesmo evento existente ou marcar a revisão manual, sem recriá-lo automaticamente. O servidor rejeita substituir vínculo existente. Persistir os dados locais após reiniciar; se a fila for ilegível/inválida, bloquear nova série até revisão manual e confirmação; não iniciar outra série enquanto houver pendência de sincronização/revisão.
- [x] A sequência **Agendado → Confirmado → Em atendimento → Concluído** continua obrigatória; ocorrências por pacote consomem franquia somente ao concluir e não criam receita avulsa nem pagamento duplicado.


## 13. Sobreposição permitida e identificação de eventos Google — 22/10/2026
- [x] Permitir criar, reagendar e restaurar atendimentos com sobreposição de horário, inclusive vários pets no mesmo horário. O servidor não rejeita conflitos e mantém a validação de horário/duração que ultrapasse meia-noite, compatibilidade do serviço/porte, pacote, status e pagamento.
- [x] Antes de salvar um horário avulso ou criar uma série com ocorrências que de fato se sobreponham a atendimentos ativos, mostrar os horários/pets em conflito e oferecer “Agendar mesmo assim” ou voltar. Horários adjacentes sem sobreposição real (por exemplo, 09:00–10:00 e 10:00–11:00) salvam sem aviso.
- [x] Para eventos Google de agendamento avulso, reagendamento e ocorrências de pacote, usar o título `Nome do tutor - Nome do pet`, por exemplo `Walquíria - Dog Meg`; incluir serviço e observações na descrição, sem alterar os outros fluxos.
- [x] Desconsiderar a importação/leitura de novos eventos criados pela parceira no Google Agenda; manter apenas o envio de eventos do app para o Google Agenda como já existente.


## 14. Separação de pendentes e concluídos na agenda — 23/10/2026
- [x] Na Agenda, separar os cartões em duas abas/botões logo acima da lista de cartões: **Agendamentos pendentes** e **Agendamentos concluídos**. Por padrão exibir pendentes; mostrar contagem em cada botão e manter consulta da data/período escolhido.
- [x] Pendentes incluem somente agendado, confirmado e em atendimento; cancelados e não compareceu continuam fora da lista ativa. Concluídos ficam em sua aba própria para não atrapalhar a visualização dos pendentes.
- [x] Quando o status mudar para **Concluído**, invalidar a consulta e mover imediatamente o cartão para a aba Concluídos; preservar botões de pagamento pendente e identificação de pacote/financeiro.

## 15. Catálogo e organização de serviços — 23/10/2026
- [x] Mover/alinhação do botão **+ Serviço / Criar novo item** para dentro da margem direita, sem corte ou deslocamento que esconda a área direita do botão em tela estreita.
- [x] Permitir reorganizar a lista do catálogo arrastando o item para cima/baixo ao segurá-lo (long press). Persistir a ordem no MySQL para que sobreviva a fechar o app e sincronize entre aparelhos; um serviço recém-criado deve entrar no final, e não pular para o início. Preservar pesquisa, filtros Ativo/Inativo, editar e ativar/inativar.

## 16. Transporte opcional no agendamento — 23/10/2026
- [x] Transporte é uma opção separada do serviço principal ao criar/editar atendimento, com chave liga/desliga ON/OFF; não obrigar a escolher transporte e não tratá-lo como item que substitui banho/tosa/tratamento.
- [x] Quando ON, carregar itens ativos cadastrados na categoria **Transporte** e permitir escolher explicitamente um deles com um seletor igual ao de serviços, exibindo nome e preço. A loja pode cadastrar várias opções de transporte (por exemplo, valores diferentes) sem limitar o formulário a um item único fixo.
- [x] Validar e persistir serviço de transporte selecionado e preço contratado como snapshot. Atendimento avulso considera o preço principal + taxa escolhida; em atendimento por pacote, a franquia continua cobrindo o serviço principal e a taxa de transporte é cobrada/registrada avulsa separadamente.
- [x] Listar tutor, pet, serviço principal, transporte escolhido e preços corretos; manter pagamento, financeiro, pacote, exportação e evento do calendário consistentes com o transporte sem duplicar receita/franquia.

## 17. Edição e exclusão de atendimentos concluídos — 23/10/2026
- [x] Exibir **Editar** e **Excluir** para atendimentos concluídos. Editar preserva etapa Concluído e permite corrigir os campos que a tela de agendamento já edita, sincronizando evento do calendário e valores.
- [x] Excluir exige confirmação explícita e deixa de exibir o atendimento na agenda ativa e nos totais financeiros; preservar rastreabilidade como soft delete. Anular o pagamento associado e, se usou pacote, reverter uma única baixa para devolver a franquia; não processar reembolso bancário automaticamente. O CSV completo pode reter o registro somente como backup, identificado pelo campo `deletedAt`.
- [x] Excluir tenta apagar o evento vinculado no calendário Android/Google. Se falhar, manter uma pendência recuperável com o evento antigo visível para abrir, tentar apagar ou desvincular manualmente; não perder referência silenciosamente.
- [x] Revisões de atendimentos concluídos são transacionais: validar novas datas/serviços/pacotes, preservar histórico de pagamentos, não duplicar nem perder uso de franquia e não ultrapassar limites do pacote.

## 18. Safe area e alinhamentos — 23/10/2026
- [x] Dar recuo superior suficiente para nenhum conteúdo ou cabeçalho invadir a barra de status, respeitando safe area no Android e Preview.
- [x] Manter margens laterais equilibradas. Na tela Clientes, alinhar botão **Adicionar tutor** horizontalmente à caixa de busca (não ao rótulo), com alturas e espaçamento consistentes. Revisar alinhamentos afetados nas telas alteradas sem desconfigurar navegação, conteúdo ou CTA.


## 19. Salvaguardas encontradas na revisão final — 23/10/2026
- [x] Transporte é exclusivamente um complemento: não permitir adicionar serviços da categoria Transporte como benefício ou serviço recorrente em pacotes novos/alterados; preservar os registros legados já existentes sem alteração automática.
- [x] Ao desligar Google Agenda em atendimento editado, persistir a intenção de limpeza no banco, excluir o evento de forma idempotente e só então limpar o vínculo. Se falhar, manter uma linha de retry consultável após reabrir o app e em outros aparelhos; não trocar silenciosamente de calendário enquanto o evento antigo não for removido.
- [x] Após conclusão bem-sucedida, atualizar otimisticamente a chave exata da consulta de período (incluindo `includeCalendarCleanup`) para o cartão aparecer imediatamente em Concluídos sem depender do refetch.
- [x] Aplicar insets superior/inferior ao FormSheet modal para respeitar a área de status e navegação no Android.
- [x] Em atendimento concluído, manter forma de pagamento e pacote somente para leitura no formulário de edição, com explicação explícita; alterações permitidas continuam preservando status, pagamento e saldo de pacote.

### Evidência da revisão final
Migration 0003 aplicada e confirmada no MySQL gerenciado; TypeScript e lint concluídos sem erros (lint emitiu apenas aviso de módulo Node não especificado); Vitest: 38 aprovados, 1 ignorado.




## 20. Valores recebidos e saldo de pacotes — 24/10/2026
- [x] Ao confirmar pagamento de um atendimento concluído, abrir popup com o valor recebido em BRL, inicialmente preenchido com o valor agendado. Se o valor digitado for inferior, exibir a diferença como desconto e oferecer **OK** ou **Cancelar**; cancelar não registra pagamento e OK registra exatamente o valor recebido, que será a receita no Financeiro. Manter a edição de valor apenas positiva e em centavos válidos.
- [x] Ao registrar a venda/recebimento de um pacote, abrir popup de valor realmente recebido e forma de pagamento. Registrar cada recebimento como transação financeira própria. Se o recebimento for parcial, exibir **Saldo em aberto** e a diferença entre preço total e soma recebida; manter **Registrar venda** disponível até quitar o preço completo, inclusive se o pacote estiver encerrado, e marcar pago somente quando o total recebido alcançar o preço do pacote.
- [x] Se, ao criar um pacote, a pessoa marcar que quer registrar a venda inicial, criar o pacote e abrir esse mesmo popup para o valor efetivamente recebido; se cancelar/fechar a ficha, manter o pacote existente com saldo em aberto para recebimento posterior. Não aceitar uma parcela acima do saldo restante nem alterar o preço depois que qualquer valor já foi recebido.
- [x] Preservar recibos antigos e o cálculo mensal por valor efetivamente pago; nenhuma parcela ou reabertura pode duplicar a receita, e pagamentos do transporte continuam separados e registrados pelo valor efetivamente recebido.

### Evidência de conclusão — 24/10/2026
Migration 0004 aplicada e confirmada por metadados; foreign key preservada. `pnpm check` e `pnpm lint` sem erros; `pnpm test`: 39 aprovados, 1 teste preexistente ignorado.

## 21. Edição do histórico no Financeiro — 24/10/2026
- [x] Mostrar ação **Editar** em todos os pagamentos liquidados do mês selecionado (não somente os 12 mais recentes) e abrir a ficha com valor recebido e forma de pagamento atuais.
- [x] Para pagamento de atendimento, permitir alterar o valor lançado sem criar outra receita e manter a data original. Se o novo valor for inferior ao previsto, exibir o desconto exato e pedir confirmação; **Cancelar** não grava mudança e confirmar atualiza a mesma transação e recalcula os totais do mês.
- [x] Para recebimento de pacote, editar a parcela existente, calcular usando todas as parcelas liquidadas do pacote (inclusive outros meses), confirmar o novo total recebido e o saldo em aberto, impedir valor acima do saldo após considerar as demais parcelas e recalcular o status pago somente quando o acumulado atingir o preço.
- [x] Se a edição de uma parcela reabrir saldo, manter **Saldo em aberto** e a ação de recebimento disponível até a quitação, inclusive para pacote/atendimento já concluído ou encerrado; permitir corrigir a forma de pagamento sem mover a data original ou duplicar a receita.

### Evidência de conclusão — 24/10/2026
`pnpm check` e `pnpm lint` sem erros; `pnpm test`: 40 aprovados, 1 teste preexistente ignorado. Nenhuma migration foi necessária: o servidor edita a transação liquidada já existente e preserva `paidAt`.
Os totais do mês e o saldo dos pacotes são invalidados/atualizados após a edição; no Android a confirmação usa Alert nativo e no Preview usa diálogo do navegador.

## 22. Excluir pacote encerrado — 25/10/2026
- [x] Após encerrar/cancelar um pacote, exibir a opção **Excluir**; não oferecer exclusão enquanto o pacote estiver ativo. Confirmar antes de ocultar o pacote da lista principal.
- [x] Excluir sem apagar fisicamente atendimentos, usos, benefícios ou pagamentos vinculados. Os totais financeiros e o histórico permanecem inalterados; o pacote excluído pode ser consultado ao ativar **Mostrar pacotes excluídos**.
- [x] Se um pacote excluído ainda tiver saldo em aberto, manter no filtro de excluídos os valores de recebido/saldo e a opção **Registrar venda** até a quitação.
### Evidência de conclusão — 25/10/2026
Migration 0005 aplicada e registrada; `deletedAt` nullable confirmada por metadados. `pnpm check` e `pnpm lint` sem erros; `pnpm test`: 40 aprovados e 1 teste preexistente ignorado.


## 23. Datas personalizadas para agendamentos de pacotes — 29/10/2026
- [x] Na criação de pacote, oferecer **Programação padrão** e **Selecionar datas de utilização**. A programação padrão deve continuar exatamente como hoje: mensal a cada 7 dias e quinzenal a cada 14 dias, contando a data inicial como primeiro uso.
- [x] Na programação personalizada, permitir escolher cada data: quatro utilizações no mensal e duas no quinzenal conforme as franquias padrão; a primeira utilização é a data inicial selecionada e cada data precisa ser válida, única e cronologicamente posterior à anterior. Se a franquia do serviço recorrente for diferente, os seletores devem acompanhar essa quantidade para manter reserva e consumo consistentes.
- [x] Criar um atendimento real para cada data selecionada, todos no horário escolhido; calcular o término do pacote pela última utilização prevista, manter o aviso permissivo de sobreposição e sincronizar cada ocorrência com o Google Agenda pelo fluxo já existente.

### Evidência de conclusão — 29/10/2026
`pnpm check` e `pnpm lint` concluídos; `pnpm test`: 41 aprovados, 1 teste preexistente ignorado. Preview Metro 8081 respondeu HTTP 200 e API 3000 respondeu HTTP 404 na rota raiz (servidor ativo).


## 24. Repetições restantes e controle de compras — 07/11/2026
- [x] Ao criar pacote mensal, sugerir 4 utilizações futuras; no quinzenal, sugerir 2. Permitir alterar esse número entre 1 e a franquia total do serviço recorrente. A diferença entre franquia total e utilizações futuras selecionadas deve iniciar como uso anterior já consumido, separada dos consumos concluídos no app. Exemplo confirmado: mensal com franquia de 4, 1 banho anterior, registra 1 uso consumido e cria 3 agendamentos futuros.
- [x] A quantidade selecionada controla quantas ocorrências são criadas tanto na programação padrão quanto na seleção de datas. Preservar os intervalos e comportamento do modo padrão; no modo manual mostrar exatamente uma data por utilização futura; manter fim do pacote, baixa de uso, reservas e sincronização Google coerentes. A tela e o histórico mostram a utilização anterior sem inventar um atendimento concluído; cada ocorrência futura conserva seu número contratual (por exemplo, usos 2/4, 3/4 e 4/4).
- [x] Criar a área/tela Fornecedores com cadastro e edição de nome, endereço, telefone e tipo de produto; permitir selecionar fornecedores cadastrados em compras. Fornecedores podem ser desativados sem apagar as compras históricas.
- [x] Criar a área/tela Saídas: selecionar fornecedor, adicionar várias linhas de item com quantidade inteira e valor unitário, calcular subtotal por item e total geral automaticamente, permitir remover linhas antes de finalizar e exibir uma confirmação do valor total. Exibir histórico das compras finalizadas e atalho para cadastrar fornecedores quando ainda não houver fornecedor ativo.
- [x] Ao finalizar a compra, gravar uma saída financeira consolidada, todas as linhas e a data/hora de finalização de forma atômica; impedir finalização sem fornecedor, sem itens ou com quantidade/valor inválidos. Uma repetição da mesma solicitação não duplica a saída. Mostrar as saídas separadas das receitas e incluí-las no resumo financeiro mensal como despesa e resultado líquido, sem duplicar ou reclassificar pagamentos existentes; incluir fornecedores, compras e itens na exportação CSV.

### Evidência de conclusão — 09/11/2026
Migration Drizzle 0006 foi aplicada ao MySQL gerenciado e confirmada por consulta somente leitura: `suppliers`, `purchases`, `purchaseItems` e `packageServices.preConsumed` existem; o journal registra a migração e `drizzle-kit check` passou. `pnpm check` e `pnpm lint` concluídos sem erros; `pnpm test`: 43 aprovados, 1 teste preexistente ignorado. A exportação CSV neutraliza fórmulas em texto sem alterar valores originais no banco; APK e publicação permanecem pendentes, conforme solicitado.


## 25. Voltar e detalhamento de pagamentos — 09/11/2026
- [x] Exibir um botão **Voltar** no topo de todas as páginas operacionais do app. Usar o retorno à tela anterior; se não houver página anterior, levar ao Início. Não alterar os fluxos de login ou outras ações.
- [x] Depois que um pagamento de atendimento for confirmado, exibir no respectivo card da Agenda, abaixo do valor cobrado, o **valor realmente recebido** informado e registrado. Atualizar a informação após recebimento ou edição do pagamento; manter o valor cobrado visível.
- [x] No histórico/resumo de pagamentos do Financeiro, mostrar o serviço, o tutor e o pet, o valor previsto/cobrado, o valor realmente recebido e a diferença identificada como **desconto** ou **acréscimo** (ou ausência de diferença). Em recebimentos parcelados de pacote, identificar a parcela recebida e os totais do pacote sem tratar uma parcela parcial como desconto.


### Evidência de conclusão — 09/11/2026
`pnpm check` e `pnpm lint` concluídos sem erros; `pnpm test`: 44 aprovados e 1 teste preexistente ignorado; `git diff --check` limpo. O cabeçalho compartilhado cobre as telas operacionais; a Agenda consulta o recebimento liquidado; o Financeiro associa tutor e pet, compara cobrança e recebimento em centavos e apresenta parcelas de pacote sem classificá-las como desconto. Nenhuma migração foi necessária; não foi gerado APK nem acionada publicação.


## 26. Busca de tutores e seleção de pets — 10/11/2026
- [x] Remover o botão **Voltar** somente da tela Início; mantê-lo nas demais páginas operacionais.
- [x] Fazer a pesquisa por tutor funcionar enquanto o usuário digita e filtrar a lista de clientes por nome, telefone ou e-mail, sem modificar os dados cadastrados.
- [x] No formulário de novo agendamento, permitir tocar no campo suspenso de pet e digitar para localizar o nome; manter a lista de pets disponível para seleção e preservar o vínculo do tutor e os demais campos do agendamento.

### Evidência de conclusão — 10/11/2026
`pnpm check` e `pnpm lint` concluídos sem erros; `pnpm test`: 44 aprovados e 1 teste preexistente ignorado; `git diff --check` limpo. Alterações limitadas a `AppHeader`, à tela inicial, ao filtro da lista de tutores, à busca opcional do seletor e à Agenda.


## 27. Hospedagem e checkout — 10/11/2026
- [x] Criar uma página própria de hospedagem, acessível sem acrescentar uma aba concorrida na barra inferior. Permitir cadastrar uma hospedagem vinculando tutor e pet, selecionar o porte (preenchido pelo cadastro do pet e editável para esta hospedagem), informar o valor da diária e selecionar check-in/check-out.
- [x] Calcular e mostrar em tempo real o total como valor da diária × número de diárias (noites entre check-in e checkout); impedir datas inválidas ou checkout anterior/igual ao check-in. Persistir datas, porte, diária e total cobrado.
- [x] Permitir registrar check-in de hospedagem reservada e, no checkout, abrir o diálogo de valor efetivamente recebido. Se recebido for menor que o total, pedir confirmação explícita do desconto com opções confirmar/cancelar; cancelar não conclui o checkout nem cria lançamento. Ao confirmar, concluir uma única vez e contabilizar no Financeiro o valor realmente recebido, mantendo o total cobrado para exibir eventual desconto/acréscimo.


## 28. Evento Google Agenda de hospedagem — 10/11/2026
- [x] Ao salvar uma hospedagem, criar um evento de dia inteiro no Google Agenda selecionado, começando no check-in e visível até a data de checkout; o evento deve conter tutor, pet e porte. A contagem financeira de diárias continua sendo a diferença entre as datas, sem cobrar diária adicional pelo evento inclusivo.
- [x] Reutilizar a permissão e a seleção de calendários Google do Android; persistir o ID da agenda e do evento na hospedagem. Se a permissão ou a sincronização falhar, manter a reserva, indicar que está pendente e oferecer nova tentativa sem duplicar evento já vinculado.


### Evidência de conclusão — 10/11/2026 (Hospedagem)
`pnpm check` e `pnpm lint` concluídos; `pnpm test`: 45 aprovados e 1 teste preexistente ignorado; `drizzle-kit check` e `git diff --check` limpos. Migrations 0007 (estadias) e 0008 (vínculo Google) foram aplicadas e verificadas por consulta somente leitura. O evento usa marcador persistente e intervalo all-day inclusivo, permitindo retry sem cópia; não foram inseridos dados de teste nem gerados APK/publicação.


## 29. Atalhos da tela inicial e edição de hospedagens — 10/11/2026
- [x] Trocar de posição os atalhos da Início: o card quadrado que hoje abre **Extrato financeiro** passa a abrir **Hospedagem**; a faixa horizontal que hoje abre **Hospedagem** passa a abrir **Extrato financeiro**. Manter títulos, destinos e acessos corretos, sem alterar os outros atalhos.
- [x] Em cada hospedagem ativa ou concluída, oferecer **Editar** e **Excluir**, como nos agendamentos. A edição permite alterar tutor, pet, porte, datas e diária, recalculando o total e atualizando o evento Google vinculado sem criar duplicatas.
- [x] Excluir com confirmação, retirar o cartão da lista, cancelar a estadia no backend, estornar/invalidar o recebimento financeiro se já houver checkout e remover o evento Google vinculado. Preservar o histórico no banco; apresentar aviso claro caso a remoção do evento externo falhe.

### Evidência de conclusão — 10/11/2026 (atalhos e manutenção)
`pnpm check` e `pnpm lint` concluídos; `pnpm test`: 45 aprovados e 1 teste preexistente ignorado; `drizzle-kit check` e `git diff --check` limpos. A migration 0009 adiciona apenas `hotelStays.deletedAt`; a consulta confirmou a coluna e preservou os 2 registros existentes. Sem inserção de dados de teste, APK ou publicação.


### Evidência de conclusão — 10/11/2026 (atalhos e manutenção)
`pnpm check` e `pnpm lint` concluídos; `pnpm test`: 45 aprovados e 1 teste preexistente ignorado; `drizzle-kit check` e `git diff --check` limpos. A migration 0009 adiciona apenas `hotelStays.deletedAt`; a consulta confirmou a coluna e preservou os 2 registros existentes. Sem inserção de dados de teste, APK ou publicação.

## 30. Pesquisa, serviços compatíveis e primeira ocorrência Google — 10/11/2026
- [x] Na criação de pacotes, manter o seletor suspenso de tutor e permitir digitar para pesquisar e selecionar o tutor, como no formulário de agendamento.
- [x] Depois de selecionar um pet, mostrar no catálogo de serviços/franquias somente os serviços ativos compatíveis com o porte do pet, igual ao agendamento; manter exceções necessárias apenas para serviços de pacotes existentes ao editá-los.
- [x] Ao criar pacote com programação personalizada, sincronizar no Google Agenda todas as utilizações futuras, incluindo a primeira data de início, e preservar o vínculo/retry existente sem duplicar eventos.

### Evidência de conclusão — 10/11/2026
`pnpm check` e `pnpm lint` concluídos sem erros; `pnpm test`: 45 aprovados e 1 teste preexistente ignorado; `git diff --check` limpo. A criação envia `futureOccurrences` escolhido; a API devolve a primeira ocorrência explicitamente e ela é sincronizada antes das demais; os serviços do formulário são filtrados pelo porte do pet e o seletor de tutor aceita busca digitável. Nenhuma migração, gravação de dados, publicação ou geração de APK foi feita.

## 31. Exclusão de pacote com limpeza da agenda — 13/11/2026
- [x] Disponibilizar em cada pacote não excluído a ação explícita **Excluir plano**, sem exigir encerrá-lo antes.
- [x] Após confirmação, excluir o pacote da lista principal, cancelar e ocultar os agendamentos ainda não concluídos gerados para esse pacote e solicitar a remoção de cada evento Google vinculado.
- [x] Preservar no banco os registros de atendimentos concluídos e o histórico financeiro; se a remoção externa de algum evento falhar, manter a pendência identificável e informar que ela pode ser tentada novamente na seção de limpeza do Google Agenda.
- [x] Não permitir excluir enquanto houver atendimento em andamento; informar para finalizar primeiro.

### Evidência de conclusão — 13/11/2026
`pnpm check`, `pnpm lint` e `pnpm test` concluídos sem erros (45 testes aprovados e 1 teste preexistente ignorado); `git diff --check` limpo. Exclusão lógica transacional do pacote e dos atendimentos vinculados, bloqueio quando há atendimento em andamento, fila global de limpeza Google e consulta financeira que preserva pagamentos históricos. Nenhuma migração, gravação de dados, publicação ou geração de APK foi feita.

## 32. Pacotes lançados em horário anterior no mesmo dia — 13/11/2026
- [x] Permitir criar um pacote cujo primeiro atendimento seja hoje mesmo quando o horário escolhido já passou, para organizar a agenda no final do expediente; manter o bloqueio de datas anteriores a hoje.

### Evidência de conclusão — 13/11/2026
`pnpm check`, `pnpm lint` e `pnpm test` concluídos sem erros (45 testes aprovados e 1 teste preexistente ignorado); `git diff --check` limpo. Removida apenas a validação de horário anterior à hora atual; a validação de que a primeira data seja hoje ou futura permanece. Nenhuma migração, gravação de dados ou geração de APK foi feita.

## 33. Seleção de tutor e pet no agendamento — 14/11/2026
- [x] No novo agendamento, permitir pesquisar e selecionar primeiro o tutor e, logo abaixo, escolher o pet somente entre os pets vinculados a esse tutor.
- [x] Manter tutor e pet visíveis no mesmo ordenamento, com valores somente para leitura ao editar um atendimento existente.

### Evidência de conclusão — 14/11/2026
`pnpm check`, `pnpm lint` e `pnpm test` concluídos sem erros (45 testes aprovados e 1 teste preexistente ignorado); `git diff --check` limpo. O formulário de novo agendamento agora filtra pets pelo tutor selecionado e limpa seleções dependentes ao trocar tutor ou pet. Na edição, tutor e pet ficam identificados como somente leitura. Sem migração ou alteração de dados.

## 34. Pagamentos pendentes no Financeiro — 15/11/2026
- [x] Criar no Financeiro uma seção/aba de pagamentos pendentes com um marcador numérico que mostre quantos recebíveis continuam em aberto, para que seja possível localizá-los sem navegar até cada módulo.
- [x] Reunir os atendimentos concluídos ainda sem pagamento, os saldos em aberto de planos/pacotes ainda não excluídos e as hospedagens aguardando checkout/recebimento, usando os valores e vínculos já registrados no app.
- [x] Permitir registrar o recebimento nessa lista e atualizar a mesma transação/status no Financeiro e nas abas correspondentes (Agenda, Pacotes e Hospedagem); pagamentos parciais de pacote devem manter apenas o saldo restante pendente.

### Evidência de conclusão — 15/11/2026
`pnpm check`, `pnpm lint` e `pnpm test` concluídos sem erros; Vitest: 45 aprovados e 1 teste preexistente ignorado; `git diff --check` limpo. A consulta reúne recebíveis de atendimentos concluídos, saldo restante de pacotes e hospedagens em check-in aguardando checkout. A baixa reaproveita as mutações atuais e invalida as consultas dos módulos afetados. Nenhuma gravação manual no banco ou geração de APK foi feita.

## 35. Excluir/ocultar pagamentos pendentes no Financeiro — 15/11/2026
- [x] Não exibir nem contar pagamentos de agendamentos, pacotes ou hospedagens já excluídos da origem.
- [x] Em cada recebível ainda aberto, oferecer a ação “Excluir pendência” com confirmação; removê-lo da lista do Financeiro sem apagar o agendamento, pacote/hospedagem ou histórico de pagamentos já recebidos.
- [x] Manter essas exclusões reversíveis: uma seção de pendências excluídas deve permitir restaurar uma pendência, e a lista e o contador de abertas devem atualizar ao excluir ou restaurar.

### Evidência de conclusão — 15/11/2026
`pnpm check`, `pnpm lint` e `pnpm test` concluídos sem erros; Vitest: 45 aprovados e 1 teste preexistente ignorado; `git diff --check` limpo. A consulta ignora fontes com exclusão lógica; a nova aba Excluídos usa marcadores persistidos por tipo/ID para ocultar/restaurar apenas a pendência financeira. A migração aditiva `0010_numerous_stryfe.sql` foi aplicada e a presença da tabela foi verificada somente por metadado. Nenhum cadastro ou pagamento recebido foi apagado; nenhum APK ou publicação foi gerado.

## 36. Sincronização forçada de agendamentos com Google Agenda — 18/11/2026
- [x] Adicionar na tela inicial um botão chamado “Atualizar agendamentos”, mantendo a sincronização automática existente.
- [x] Ao tocar no botão, comparar os agendamentos ativos e ocorrências de pacotes do app com os eventos Google vinculados: atualizar eventos cuja data/hora ou detalhes estejam diferentes, remover do Google eventos de agendamentos excluídos/cancelados ou com remoção pendente, e criar/vincular eventos faltantes que foram destinados à sincronização Google.
- [x] Tornar a reconciliação segura para repetição: atualizar/vincular eventos existentes sem criar duplicatas; não enviar ao Google agendamentos em que a sincronização foi explicitamente desativada; mostrar progresso e um resumo de sincronizados, adicionados, removidos e falhas.

### Evidência de conclusão — 19/11/2026
`pnpm db:push` gerou/aplicou a migração aditiva `0011_fantastic_tigra.sql`; a existência de `appointments.calendarSyncEnabled` foi confirmada somente via metadados. `pnpm check`, `pnpm lint`, `pnpm test` e `git diff --check` concluídos sem erros; Vitest: 45 aprovados e 1 teste preexistente ignorado. O botão reconcilia apenas compromissos marcados/vinculados pelo app, não importa nem altera eventos pessoais do Google; a flag persistida mantém locais os agendamentos explicitamente não sincronizados. Nenhum APK ou publicação foi feito.

## 37. Reconciliação completa do Google Agenda — 19/11/2026
- [ ] Ao tocar em “Atualizar agendamentos”, conferir todos os atendimentos que permanecem no app, inclusive os concluídos e os registros antigos sem vínculo Google salvo, respeitando escolhas explícitas de deixar um atendimento somente na agenda da Vila; manter a sincronização automática atual. Se faltar um evento, criá-lo; se dia, horário ou detalhes estiverem diferentes, corrigir o evento para corresponder ao app.
- [ ] Remover do Google somente eventos identificados pelo marcador próprio do Vila Caramelo cujo atendimento não exista mais ou esteja excluído/cancelado/não compareceu/com remoção solicitada. Preservar eventos sem o marcador, incluindo eventos manuais ou criados pela parceira.
- [ ] Mostrar no resultado os eventos reconstruídos, corrigidos, removidos e falhas, sem criar duplicatas.
