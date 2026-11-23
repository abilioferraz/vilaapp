# Plano técnico — Vila Caramelo Gestão Pet Shop

## Objetivo e plataforma

Aplicativo móvel Android em Expo Router / React Native / TypeScript / NativeWind, com backend Express+tRPC e Drizzle no MySQL gerenciado pelo WebDev. O runtime permanece nos valores fixos do template mobile: Metro 8081 e API 3000. Expo Go/Preview servem para desenvolvimento e conferência da interface; APK/AAB de release é produzido posteriormente pelo fluxo de build nativo do Dashboard, nunca por um comando de build Android na Sandbox.

## Decisões de produto e dependências

- Usar banco MySQL do projeto para dados duráveis e API tRPC tipada; todas as rotas comerciais passam pelo middleware autenticado existente, com o bearer token nativo já armazenado no SecureStore pelo fluxo OAuth do template.
- Não criar conta ou senha paralela, dados fictícios, seed operacional nem preços não informados. A base inicia sem tutor, pet, catálogo de serviços, pacote ou pagamento reais.
- Armazenar dinheiro em centavos inteiros; moeda e microcopy em pt-BR. Datas do negócio são tratadas como horário local de Águas de Lindóia; datas ISO de agenda têm segundos para comparação consistente.
- Entidades relacionais: usuários OAuth existentes; tutores e pets; serviços por modalidade e porte; pacotes e franquias por serviço; agendamentos; registros de consumo de franquia; transações de pagamento; e tabela de bloqueio de escrita diária para serializar reservas concorrentes.
- Reagendamento bloqueia e relê a linha do agendamento antes de validar o status, rejeita estados terminais e atualiza pagamento junto ao atendimento. A interface alerta conflitos reais pelo intervalo semiaberto `[início, início + duração)` e permite prosseguir após confirmação; o servidor aceita sobreposições, mantendo apenas os locks transacionais do dia para serializar gravações. As reservas de franquia pendentes são conferidas sob lock transacional do pacote/serviço para que atendimentos simultâneos não ultrapassem o saldo; conclusão tem consumo idempotente via chave única do agendamento; reabertura permitida reverte a mesma baixa mantendo histórico. Venda de pacote é uma transação financeira própria e consumo não é receita duplicada; o preço de pacote já recebido não pode ser editado para não reescrever o histórico da venda.
- Manter o app focado em operação interna; OAuth do starter identifica a pessoa mas não acrescentar autorização/roles de equipe que não foram pedidas. Os endpoints permanecem autenticados, sem bypass de preview ou desenvolvimento.
- `expo-calendar` pede permissão do Android apenas quando a pessoa solicita inclusão/sincronização e permite selecionar um calendário existente. Reagendamentos atualizam/criam o evento com compensações best-effort, o vínculo é revalidado no servidor e atendimentos cancelados/ausentes oferecem retry de limpeza ou desvinculação manual; Android e MySQL não suportam transação atômica compartilhada, então falhas externas são avisadas em vez de ocultadas. O app não pressupõe acesso a uma conta Google, calendário empresarial ou sync cloud automática.
- `expo-file-system` e `expo-sharing` habilitam exportação CSV local, depois compartilhável para Drive/Sheets. Exportar não equivale a sincronização contínua; origem Google, spreadsheet ID e autorização ainda precisam ser configuradas. Não carregar credenciais de API Google no APK.
- Reusar o logo oficial existente do projeto Vila Caramelo. Launcher quadrado, adaptive icon, favicon e splash são derivados por crop/resolução do lockup sem redesenhá-lo; manter IDs Expo existentes.

## Organização do projeto

| Caminho | Responsabilidade |
|---|---|
| `app/(tabs)/` | Telas principais `Início`, `Agenda`, `Clientes`, `Pacotes` e `Financeiro`, navegação inferior persistente. |
| `app/(tabs)/servicos.tsx` | Catálogo editável de serviços e durações. |
| `components/vila/` | Cartões, formulário compacto, estado vazio, seletores e componentes da marca reutilizáveis. |
| `shared/vila.ts` | Paleta oficial, enums, nomes em pt-BR, datas locais, formatação BRL e serialização CSV. |
| `drizzle/schema.ts`, `drizzle/*.sql` e `drizzle/meta/` | Modelo MySQL e migrações/versionamento aditivos para operação, pacotes e finanças. |
| `server/vila-router.ts` | Procedures autenticadas para CRUD, agenda, baixa idempotente, relatórios e exportação. |
| `server/routers.ts` | Montagem do router tRPC e autenticador do starter. |
| `lib/` | Clientes tRPC, Auth do starter e helpers de exportação/agenda nativa. |
| `assets/images/` | Logo e arquivos nativos de launcher, adaptive icon e splash. |

## Design

**Movimento:** estética boutique de pet shop em modo escuro acolhedor, inspirada na referência de dashboard nativo enviada: superfícies carvão, áreas de respiro e cartões legíveis em uso com uma mão.

**Princípios:** foco operacional imediato; leitura rápida de status e horário; formulários curtos e contextuais; dados financeiros em BRL com procedência evidente.

**Filosofia de cores:** carvão #111311 e superfícies #1C201D sustentam turnos e números sem fadiga; bege #F5F1E8 dá acolhimento; laranja #E67E22 marca ações e a identidade do nome; verde escuro #1E3D2B e marrom #4B2E1A preservam o DNA da marca; turquesa #80C8BE auxilia estados de agenda sem competir com o logo.

**Paradigma de layout:** topo compacto com identificação da Vila, conteúdo em coluna rolável com um destaque principal por tela e atalhos em cartões, seguido por abas inferiores fixas. Em telas de formulário, listas pesquisáveis e CTA alcançável pelo polegar. Agenda de dia/semana usa listas cronológicas; o modo mês apresenta grade mensal compacta com marcador de compromissos e lista do dia selecionado.

**Elementos de assinatura:** lockup oficial inteiro (não separar “VILA CARAMELO” de “BANHO & TOSA”); pequeno acento/pata ou coração apenas em ornamentos de interface quando não interferir em legibilidade; contadores e estados representados com tags arredondadas em laranja, verde e turquesa.

**Interação:** confirmação visual imediata, estados explícitos de carregando/erro/vazio e consultas com atualização seletiva após mutation. Validações monetárias e de agenda são exibidas junto ao campo; ações irreversíveis são evitadas usando arquivamento e cancelamento em vez de exclusão silenciosa.

**Animação:** transições de abas nativas suaves; feedback de toque/haptic curto em ações primárias; skeleton apenas no carregamento inicial; sem loops decorativos nem movimento que oculte estado de agendamento.

**Tipografia:** famílias do sistema nativo; títulos 24–30sp semibold, valores/contadores 24–32sp bold, nomes de pets 16–18sp semibold, rótulos 12–14sp médios e notas 13–15sp. Contraste mínimo visualmente forte sobre superfícies carvão, suporte a fonte escalável e linhas curtas em celulares estreitos.

**Essência da marca:** a segunda casa dos AUmigos: boutique de cuidado com carinho, precisão e rotina confiável. Personalidade: acolhedora, caprichosa, responsável.

**Voz:** direta, carinhosa e tecnicamente clara. Exemplos: “AUmigos de hoje” e “Ficou tudo certo — o saldo do pacote foi atualizado.”

**Logotipo:** o app não recria lettering ou o coração do “O”; reaproveita inteiro o arquivo oficial real e centra o lockup em espaço quadrado de launcher. Na navegação o nome escrito é acompanhado pelo ativo original, nunca por uma separação artificial das duas linhas do logo.

**Cor de marca distintiva:** laranja Caramelo #E67E22.

## Fluxos principais

- Painel → agendamento: localizar tutor/pet, escolher serviço, dia/hora e forma de pagamento; mostrar preço e duração sugeridos do serviço ativo, manter pacote opcional validado, informar conflitos e oferecer a opção de voltar ou gravar mesmo assim.
- Conclusão do atendimento: atualizar status na API sob transação; se usar pacote validar tutor/pet/vigência/serviço/franquia e baixar uma vez. Se avulso, marcar como pago gera uma única linha financeira. Transição cancelada/ausência não gera pagamento nem baixa.
- Cadastro: tutor agrega vários pets; catálogo e pacotes sem exemplos artificiais. Novo cadastro tem validação local e no servidor, e lista reflete a alteração após o sucesso.
- Financeiro: relatório por intervalo a partir de transações pagas; separar serviço de pacote, listar pagamentos recentes, somar método/categoria e média por transação. Uso de pacote não entra como receita repetida.
- Exportação: produzir CSV UTF-8 delimitado por `;` e com cabeçalho para tutores, pets, serviços, pacotes, agendamentos e pagamentos; abrir compartilhamento do Android. Google Drive/Sheets destino é escolhido pela pessoa via app de compartilhamento e exige app/conta instalado.
- Agenda externa: solicitar permissão após ação explícita, deixar a pessoa escolher calendário autorizado, criar/atualizar/cancelar um evento associado ao ID nativo persistido. Google Calendar Connector já se encontra habilitado, mas a integração empresarial com a Agenda não é presumida nem executada em background.

## Limites conhecidos

- O resumo pede uma conexão AppSheet equivalente com Google Agenda, Drive e Sheets, porém não traz planilha real, ID, propriedade, conta de destino ou credencial Google. Implementar desde já estrutura e exportação segura; não simular sincronização cloud ou real-time.
- O APK instalável não está disponível até a execução bem-sucedida do build Android oficial após checkpoint. A fonte Expo, preview e QR de Expo Go não são o APK.
- Banco de desenvolvimento e publicação compartilham uma instância. O script de migração cria apenas estrutura vazia e está proibido de inserir conteúdo comercial inventado.


## Adendo: seletores e correção de agendamento
O formulário da agenda usa o diálogo oficial `@react-native-community/datetimepicker` no Android: calendário para dia/mês/ano e relógio de 24 horas para hora/minuto. A interface sempre mostra `HH:mm`, sem segundos; o banco pode armazenar `:00` no campo datetime internamente. A validação partilhada entre app e servidor verifica calendário real e intervalo de horas, aceitando o formato de persistência. Erros de criação mantêm o formulário aberto; depois de uma gravação confirmada, uma falha opcional no calendário local gera aviso sem sugerir que o agendamento deixou de existir. A prévia Web usa seletor visual equivalente. A tela Serviços passa a exibir ações compactas e adaptáveis com alvos de toque adequados.


## Adendo: sincronização Google e etapas explícitas
Novos agendamentos passam a sincronizar por padrão com uma agenda **Google** gravável exposta pelo provedor de calendários Android (selecionada de uma conta Google cadastrada e com sincronização ativa). A permissão é solicitada fora do modal, a agenda principal Google é a escolha inicial, e calendários apenas locais não são apresentados como Google. O evento fica vinculado ao ID do atendimento e pode ser aberto posteriormente na agenda do sistema; escrita idempotente não substitui um link de evento existente e limpeza exige o ID esperado para não apagar um vínculo concorrente mais recente. Nenhuma autenticação OAuth/credencial Google é embutida no APK; a disponibilidade da agenda Google depende da conta Android do aparelho. Cancelamentos deixam de ocupar a lista ativa, preservando registro Cancelado e oferecendo limpeza recuperável de eventual evento externo órfão.

As transições de atendimento são validadas na API: Agendado → Confirmado → Em atendimento → Concluído; o pagamento avulso só pode ser confirmado após a conclusão, enquanto pacote consome franquia na conclusão.


## Adendo: vigência calculada de pacotes
A data inicial é a primeira utilização. Plano mensal agenda uma ocorrência por semana (7 dias); a franquia padrão é 4 utilizações e a data final inclusiva é o quarto uso (início + 21 dias). Plano quinzenal agenda uma utilização a cada 14 dias; a franquia padrão é 2 e a data final é o segundo uso (início + 14 dias). O formulário recalcula o término conforme a data inicial, periodicidade e quantidade máxima de utilizações selecionadas, mostra o término em modo somente leitura e não envia uma data-final definida pelo cliente. A API recalcula e persiste a mesma regra e mantém a validação existente de atendimentos reservados.

## Adendo: ocorrências reais de pacotes na agenda
No formulário de novo pacote, solicitar hora via seletor de hora/minuto do Android e selecionar o serviço recorrente; pré-selecionar quando há apenas um benefício e exigir escolha quando há vários. A API exige serviço e horário recorrentes (não aceita criar pacote sem série), valida compatibilidade de porte de todos os benefícios e cria pacote e seus atendimentos futuros na mesma transação: uma ocorrência por unidade da franquia selecionada, primeira na data inicial, intervalos de 7 dias (mensal) ou 14 dias (quinzenal), mesma hora e duração do serviço. Reutilizar locks de dia e validação de pacote para evitar reservas parciais; atendimentos em horários sobrepostos são permitidos. Os atendimentos gerados entram no fluxo normal de estados/consumo e cada linha recebe seu próprio evento vinculado na agenda Google Android; falhas de sincronização externa são sinalizadas e os atendimentos internos permanecem únicos para reparo posterior.

O início do pacote é escolhido em um pop-up de calendário nativo (sem digitação). Pendências de sincronização e eventos órfãos são guardados no armazenamento local do aparelho para que a fila continue visível após fechar e reabrir o app; ela não sincroniza automaticamente entre dispositivos. Cada tentativa relê no MySQL o vínculo dos atendimentos pendentes antes de criar eventos, e a API recusa substituir evento já vinculado; assim, um retry local antigo não cria uma segunda cópia depois que o vínculo foi salvo no servidor. A fila inválida/ilegível bloqueia nova série até a revisão manual confirmada, sem sobrescrever o cache silenciosamente. As ocorrências pendentes exibem pet, serviço, posição, data e hora. Se a criação do evento Google funcionar mas a associação ao atendimento falhar e também não for possível apagar o evento provisório, a tela mantém os dados daquela ocorrência, permite abrir o evento existente e vinculá-lo ao atendimento sem criar outro; também oferece marcar o evento como conferido depois de uma revisão manual e bloqueia o início de outra série até a revisão dos itens pendentes.


## Ajuste de agenda — sobreposições permitidas e título Google
Agendamentos com intervalos coincidentes são permitidos tanto pelo app quanto pelo backend. Antes de criar/reagendar um atendimento, o app consulta os compromissos do dia; antes de gerar uma série de pacote, consulta o intervalo da série. Quando há choque real, mostra horários/pets conflitantes e oferece “Agendar mesmo assim” ou voltar. A validação de duração que ultrapassa meia-noite e todas as validações de negócio/pacote/status permanecem ativas. Eventos Google de atendimentos avulsos, reagendamentos e ocorrências de pacote usam o título `Nome do tutor - Nome do pet` (por exemplo `Walquíria - Dog Meg`); serviço, tutor, pet e observações ficam na descrição.


## Adendo — agenda, transporte, ordenação e alinhamento (23/10/2026)

A agenda terá seletor segmentado **Pendentes / Concluídos** para o período e data atualmente escolhidos; pendentes abrange agendado, confirmado e em atendimento, concluídos mantém o estágio de pagamento. Ao concluir, a mutation invalida os dados, a tela seleciona Concluídos e o cartão migra imediatamente.

Atendimentos concluídos continuam editáveis em data, hora, serviço, transporte e observações, mantendo o status concluído. Forma de pagamento e pacote ficam bloqueados no formulário e protegidos pela API para preservar o histórico contábil; alterações de valor em uma transação já recebida anulam o lançamento local anterior e deixam a cobrança pendente de nova confirmação. A troca de serviço em pacote transfere o consumo com controle de saldo e idempotência. Exclusão usa `deletedAt` (soft delete auditável), remove o atendimento da agenda operacional e dos indicadores, anula a transação local e devolve uso de pacote; a exclusão não processa reembolso bancário. O CSV integral preserva os registros apagados e inclui `deletedAt`. Se houver evento no Android/Google Calendar, o app tenta removê-lo; caso falhe, mantém a referência e o marcador persistente para retry visível, sem tornar o evento inalcançável.

Transporte será um complemento do atendimento, não a modalidade principal selecionada no formulário. O formulário contém controle ON/OFF; ligado, exige seleção de uma modalidade ativa da categoria Transporte. A API valida a categoria e porte/dados, grava referência ao serviço e preço em centavos como snapshot; avulso paga o serviço principal + transporte numa transação, pacote segue usando a franquia para o serviço principal e registra o transporte como cobrança avulsa própria no momento do pagamento. Histórico, financeiro e CSV distinguem o complemento de transporte e preservam o preço original.

Catálogo ganha `sortOrder` persistido no servidor. A lista usa drag-and-drop por toque longo, mantém filtros e páginas em uso e persiste a ordem numa mutation autenticada; serviço novo vai para o final, e não para o início. Reusar Gesture Handler/Reanimated existentes e adicionar somente a biblioteca de lista arrastável se confirmada necessária. Ajustes visuais mantêm tema e navegação existentes: mover CTA de serviço para dentro das margens, alinhar botão Tutor com a caixa de busca (não com o rótulo) e aplicar safe-area superior ao conteúdo de todas as abas, preservando a navegação inferior e o padding lateral de 20dp.

A migração do banco será aditiva: ordem do catálogo, referência/preço/meio de pagamento do transporte, marcador de soft delete e timestamp nullable da fila persistente de limpeza Google. Não apagar dados de atendimento/pagamento nem inserir valores de demonstração. As mudanças do app serão testadas sem build Android release; não publicar nem gerar APK neste escopo.


O reorder usa `react-native-draggable-flatlist@4.0.3` fixada no lockfile. Metadados oficiais do pacote (npm, https://www.npmjs.com/package/react-native-draggable-flatlist) indicam peer dependencies `react-native >=0.64`, `react-native-gesture-handler >=2.0` e `react-native-reanimated >=2.8`; o starter atende com RN 0.86.3, Gesture Handler 2.32 e Reanimated 4.5.1, sem alterar plugins nativos.


Para preservar auditoria, a exportação integral em CSV mantém os registros soft-deleted e inclui a coluna `deletedAt`; a Agenda operacional, financeiro e indicadores continuam excluindo-os. O CSV também inclui IDs e valores de transporte e a posição ordenada do catálogo.


## Salvaguardas adicionais da revisão (23/10/2026)
Pacotes novos/alterados não podem tratar categoria Transporte como benefício ou recorrência; a interface e o servidor devem impedir essa composição, preservando dados legados sem conversão automática. A remoção da integração Google em um atendimento persistirá a solicitação de limpeza, deixará a referência intacta até a exclusão externa e desvinculação confirmadas, e será idempotente; a troca de calendário exige concluir essa limpeza antes. Uma conclusão bem-sucedida altera o cache local do período para apresentar o cartão imediatamente em Concluídos. `FormSheet` usa os insets da área segura nas bordas superior/inferior. Para não reescrever a história contábil, pacote/forma de pagamento de atendimentos concluídos aparecem bloqueados no editor; data, hora, serviço, transporte e observações continuam editáveis, com ajuste ou anulação transacional da cobrança quando o valor mudar.


## Adendo financeiro — recebimento efetivo e saldo de pacotes (24/10/2026)

Para serviço concluído, **Confirmar pagamento** abre um FormSheet com o valor agendado pré-preenchido e editável em BRL. Se o valor informado for menor, exibir confirmação com o desconto exato; Cancelar não altera o lançamento e Confirmar grava somente o valor recebido, que é a receita usada pelo relatório financeiro. Preservar o preço contratado do atendimento; pagamentos de transporte em pacote usam a mesma confirmação de valor efetivamente recebido.

Para pacote, cada entrada é uma transação própria. A venda inicial (quando escolhida ao criar) abre a mesma ficha após a criação; recebimentos seguintes permanecem disponíveis enquanto houver saldo. Acumular pagamentos liquidados, mostrar recebido/saldo em aberto e considerar o pacote quitado somente quando o acumulado atingir o preço contratado. Recebimento parcial gera apenas o lançamento pelo valor recebido e não fecha o saldo. Não aceitar valor acima do saldo restante; bloquear edição do preço após qualquer recebimento. Pacotes encerrados com saldo em aberto permanecem visíveis na lista e com a opção de recebimento até a quitação, inclusive quando o encerramento ocorreu pelo consumo da franquia. Valores continuam em centavos inteiros e BRL; preservar pagamentos e pacotes legados.

A migration aditiva 0004 substitui o índice único de pagamento por pacote por índice não único para permitir parcelas e acrescenta chave idempotente por transação de recebimento. O índice único por atendimento permanece, permitindo retificação segura do mesmo pagamento avulso. O Financeiro continuará calculado exclusivamente a partir de linhas de pagamento liquidadas.

## Adendo financeiro — edição de recebimentos já lançados (24/10/2026)

Na aba Financeiro, tornar editável cada recebimento liquidado visível no mês selecionado (sem limitar a lista aos 12 mais recentes). A ficha reutiliza o componente de valor recebido e inicia com o valor/forma atualmente registrados. Para atendimento, se o novo valor ficar abaixo do valor previsto, exigir confirmação do desconto exato; Cancelar não altera nada e confirmar atualiza o mesmo lançamento, sem duplicar receita. Preservar a data original do recebimento para manter o mês correto.

Para pacote, editar a transação existente; somar todas as parcelas liquidadas do pacote em todos os meses, calcular o novo total e saldo, exibir a confirmação antes de salvar e impedir que o valor ultrapasse o preço contratado restante após considerar as outras parcelas. Ao salvar, recalcular `paid` e saldo; se a edição reduzir o total abaixo do preço, manter saldo em aberto e a ação de recebimento disponível, inclusive após o atendimento/pacote concluído ou encerrado. Permitir ajuste da forma de pagamento, invalidar Financeiro/Pacotes/Painel/Agenda e preservar os demais recebimentos. A API bloqueia o registro não liquidado e atualiza a linha financeira existente em transação; `paidAt` não muda.

## Adendo Pacotes — excluir pacote encerrado sem apagar o histórico (25/10/2026)

Na aba Pacotes, oferecer a ação Excluir somente depois do encerramento/cancelamento existente. A exclusão será suave por `deletedAt`: o pacote desaparece da lista normal e pode ser consultado ao ativar Mostrar pacotes excluídos. Não apagar atendimentos, usos, benefícios nem pagamentos vinculados. Se houver saldo, a ficha de excluídos continua mostrando o pacote e sua ação de recebimento, preservando a quitação já implementada. O servidor só aceita excluir pacote encerrado e a operação não altera receita ou saldo.


## Adendo — datas personalizadas de uso de pacotes (29/10/2026)

Na criação de um pacote, oferecer dois modos: **Programação padrão**, que preserva exatamente a recorrência atual (mensal a cada 7 dias; quinzenal a cada 14 dias, incluindo a data inicial), e **Selecionar datas de utilização**, para escolher o calendário real de cada ocorrência. A primeira data é a data inicial já selecionada; os demais usos aparecem em seletores de data. No padrão de negócio, o pacote mensal apresenta quatro utilizações e o quinzenal duas; a série sempre deve acompanhar a quantidade contratada do serviço recorrente. As datas personalizadas devem ser válidas, únicas e em ordem cronológica. O backend usa exatamente as datas selecionadas para materializar os atendimentos, calcula a vigência até a última data de uso, reaproveita o aviso permissivo de sobreposição, mantém o horário definido e envia as ocorrências criadas ao fluxo Google Agenda existente. Não é necessária uma coluna nova: os atendimentos materializados e o fim calculado já persistem a programação escolhida.


## Adendo — repetições restantes, fornecedores e saídas (07/11/2026)

Na criação do pacote, manter a franquia contratada e solicitar quantas utilizações futuras serão agendadas: padrão mensal 4, quinzenal 2, limitado à franquia do serviço selecionado. A diferença é registrada como uso já consumido (`used`), conforme confirmado: pacote de 4 com 1 banho anterior gera 3 agendamentos e começa com 1 utilização consumida. A programação padrão continua semanal/quinzenal; o modo de datas escolhidas apresenta exatamente a quantidade futura selecionada e conserva as datas reais.

Criar telas dedicadas de Fornecedores (nome, endereço, telefone, tipo de produto; cadastrar e editar) e Saídas, acessíveis pelo módulo Financeiro para manter a barra principal compacta. Cada compra reúne fornecedor e linhas de descrição livre, quantidade inteira, valor unitário em centavos e subtotal calculado; o total é recalculado em tela e novamente no servidor. A finalização, confirmada pelo usuário, grava em uma transação atômica a saída consolidada e suas linhas com data/hora de finalização. As saídas aparecem separadas das receitas e integram o resumo financeiro mensal; não criar controle de estoque nem alterar registros financeiros existentes.


## Adendo — Hospedagem e checkout (10/11/2026)

Adicionar uma página de hospedagem como rota interna oculta da barra inferior, alcançável por atalho no Início para preservar a navegação compacta. A tabela aditiva `hotelStays` armazena tutor, pet, porte como snapshot, check-in/check-out, diária, total calculado e estado reservado/em hospedagem/concluído. O cálculo de diárias é a diferença de datas (noites; checkout não acrescenta diária), validado no cliente e no servidor. No checkout, solicitar o valor realmente recebido e confirmar explicitamente qualquer desconto antes de concluir. Criar uma única transação financeira ligada à hospedagem (`payments.hotelStayId`, idempotente); incluir tutor, pet, valor cobrado e efetivamente recebido no Financeiro, sem alterar agendamentos/pacotes existentes nem sincronizar hospedagem ao Google Agenda.


## Adendo — sincronização de hospedagem com Google Agenda (10/11/2026)
A solicitação posterior substitui a decisão anterior de não sincronizar hospedagem. Ao salvar cada reserva, criar um evento de dia inteiro na agenda Google selecionada do Android, visível da data de check-in até a data de checkout, e persistir `calendarId`/`calendarEventId` no registro da estadia. Salvar a estadia antes da operação externa; se a permissão/sincronização falhar, manter a reserva, informar a pendência e permitir retry sem duplicar evento já vinculado. Preservar inalteradas as integrações dos agendamentos comuns.
