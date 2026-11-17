/**
 * Banco de Questões — Apostila Completa de Revisão: Arquitetura e Administração de Servidores Linux
 * 32 questões de múltipla escolha (A até E) cobrindo os 4 Módulos e Estudos de Caso.
 */
(function (global) {
  'use strict';

  const QUESTIONS = [
    // =========================================================
    // MÓDULO 1: Arquitetura do Sistema, Boot e Processos
    // =========================================================
    {
      id: 'm1-q1',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'easy',
      question: 'Segundo a "Regra de Ouro do Linux" ("tudo é um arquivo"), onde ficam as informações ao vivo da CPU/RAM e onde ficam as configurações estáticas do servidor?',
      options: [
        'Em /dev (ao vivo) e /bin (configurações)',
        'Em /proc (ao vivo) e /etc (configurações)',
        'Em /var (ao vivo) e /usr (configurações)',
        'Em /tmp (ao vivo) e /root (configurações)',
        'Em /home (ao vivo) e /sbin (configurações)'
      ],
      correct: 1,
      hint: 'Analogia: /proc é o painel digital do carro mostrando dados ao vivo; /etc é a Sala de Controle com os contratos e regras.',
      explanation: 'No Linux, /proc expõe dados vivos do Kernel/CPU/RAM na memória, enquanto /etc guarda todos os arquivos de configuração em texto puro.'
    },
    {
      id: 'm1-q2',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'easy',
      question: 'Na analogia do "Banco com Cofre Blindado", por que um programa no User Space não pode tocar diretamente no disco ou na placa de rede, e o que ele precisa usar?',
      options: [
        'Por falta de drivers; ele reinicia o servidor via BIOS',
        'Por segurança/isolamento; ele solicita ao Kernel via System Call (Syscall)',
        'Por limitação do terminal; ele usa o comando chmod 777',
        'Por causa do firewall; ele abre uma porta TCP acima de 1024',
        'Por causa do swap; ele grava direto no /etc/fstab'
      ],
      correct: 1,
      hint: 'Os clientes (User Space) nunca entram direto no cofre: eles preenchem um formulário no guichê de atendimento do gerente (Kernel).',
      explanation: 'Programas no User Space são proibidos de acessar hardware diretamente. Eles fazem uma System Call (Syscall) para que o Kernel valide e execute a operação.'
    },
    {
      id: 'm1-q3',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'easy',
      question: 'O que significa afirmar que o Kernel do Linux tem arquitetura "Monolítica Modular"?',
      options: [
        'Cada driver roda em um processo separado no User Space sem contato entre si',
        'Ele só funciona se todos os drivers existentes estiverem compilados em um bloco imutável',
        'O núcleo central roda junto em um bloco rápido, mas permite acoplar/desacoplar módulos (drivers) com o sistema ligado',
        'Ele divide o sistema em letras de unidade (C:, D:) para separar os drivers de disco',
        'Ele exige reinicialização obrigatória toda vez que um dispositivo USB é conectado'
      ],
      correct: 2,
      hint: 'Pense nas "maletas de ferramentas especiais": o gerente pega a máquina de contar moedas quando precisa, sem fechar a agência.',
      explanation: 'Monolítico = gerenciamento de CPU, memória, rede e disco no mesmo espaço central (alta velocidade). Modular = carrega/descarrega Kernel Modules em tempo real.'
    },
    {
      id: 'm1-q4',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'medium',
      question: 'Durante o boot, o Kernel precisa ler o disco rígido para buscar seus arquivos, mas o driver do disco está dentro do próprio disco. Como o Linux resolve esse paradoxo?',
      options: [
        'A BIOS executa o apt install automaticamente antes do GRUB',
        'O GRUB carrega na RAM o initramfs, um mini-sistema temporário com os drivers básicos',
        'O systemd monta a pasta /tmp primeiro para copiar os drivers da placa de rede',
        'O Kernel ignora o disco principal e roda todo o servidor apenas dentro de /proc',
        'O bootloader formata a partição /boot usando o arquivo /etc/shadow'
      ],
      correct: 1,
      hint: 'Lembre da chave mestra de emergência no bolso do vigia da fábrica para abrir a porta onde está o manual!',
      explanation: 'O GRUB carrega o Kernel junto com o initramfs (Initial RAM File System), que fornece na RAM os drivers necessários para montar a raiz real (/).'
    },
    {
      id: 'm1-q5',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'medium',
      question: 'Qual é o processo número 1 (PID 1) na maioria das distros modernas e qual tipo de Unit mantém uma porta escutando para só ligar o serviço quando alguém conectar?',
      options: [
        'SysVinit e Unit .timer',
        'systemd e Unit .service',
        'systemd e Unit .socket',
        'GRUB e Unit .mount',
        'crond e Unit .daemon'
      ],
      correct: 2,
      hint: 'O Diretor de Operações (PID 1) usa unidades paralelas; uma delas economiza RAM ficando na escuta de rede antes de acordar o programa.',
      explanation: 'O systemd é o PID 1 moderno (com inicialização paralela). Units .socket ficam ouvindo uma porta de rede e só iniciam o serviço sob demanda.'
    },
    {
      id: 'm1-q6',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'medium',
      question: 'Na criação de qualquer novo processo no Linux, como funciona a dança em dois passos chamada Fork-and-Exec?',
      options: [
        'exec() clona o processo pai e fork() apaga a memória RAM do pai',
        'fork() clona o processo pai na memória e exec() substitui a memória do filho pelo novo programa',
        'systemd cria o processo do zero sem pai e depois envia um SIGTERM',
        'fork() grava o programa no disco /var e exec() altera o UID para 0',
        'exec() inicia o Kernel e fork() abre uma nova aba no terminal SSH'
      ],
      correct: 1,
      hint: 'Primeiro uma fotocópia exata do pai (clonagem); depois o filho apaga o que herdou e carrega sua nova identidade (transformação).',
      explanation: 'Nenhum processo nasce do nada: fork() cria uma cópia exata do pai com novo PID, e exec() carrega o código do novo programa nesse processo filho.'
    },
    {
      id: 'm1-q7',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'hard',
      question: 'Um processo aparece no "ps aux" com status Z (Zumbi) e PID 4500. Você executa "sudo kill -9 4500", mas ele não some! Por que falhou e como resolver sem reiniciar?',
      options: [
        'Porque o kill -9 só funciona no Windows; deve-se usar kill -1',
        'Porque o processo está em sono leve (S); basta clicar na janela dele',
        'Porque ele já está morto (só resta a linha na tabela); é preciso sinalizar ou encerrar o processo Pai (PPID)',
        'Porque processos zumbis consomem 100% da RAM e travam o Kernel inteiro',
        'Porque apenas o usuário www-data tem permissão de remover processos do estado Z'
      ],
      correct: 2,
      hint: 'Você não pode matar quem já morreu! O funcionário pediu demissão, mas o gerente (Pai) esqueceu de dar baixa na planilha do RH.',
      explanation: 'Um zumbi não usa RAM nem CPU, mas ocupa um PID até o Pai ler o código de saída. Envie SIGCHLD ao Pai ou encerre o PPID para o PID 1 (systemd) limpar.'
    },
    {
      id: 'm1-q8',
      module: 'Módulo 1: Arquitetura & Boot',
      difficulty: 'million',
      question: 'Sobre sinais IPC com o comando kill: qual sinal é enviado POR PADRÃO em "kill <PID>", qual recarrega configurações sem derrubar clientes e qual é o abate forçado?',
      options: [
        'Padrão: SIGKILL (9) | Recarregar: SIGTERM (15) | Forçado: SIGHUP (1)',
        'Padrão: SIGTERM (15) | Recarregar: SIGHUP (1) | Forçado: SIGKILL (9)',
        'Padrão: SIGHUP (1) | Recarregar: SIGKILL (9) | Forçado: SIGTERM (15)',
        'Padrão: SIGTERM (15) | Recarregar: SIGCHLD (17) | Forçado: SIGHUP (1)',
        'Padrão: SIGKILL (9) | Recarregar: SIGHUP (1) | Forçado: SIGSTOP (19)'
      ],
      correct: 1,
      hint: 'Restaurante: SIGHUP entrega novo cardápio aberto; SIGTERM pede educadamente para fechar; SIGKILL desliga o disjuntor geral do prédio!',
      explanation: 'O comando "kill <PID>" puro envia SIGTERM (15, educado). SIGHUP (1) recarrega configs sem derrubar conexões. SIGKILL (9) mata direto no Kernel.'
    },

    // =========================================================
    // MÓDULO 2: Sistemas de Arquivos, Armazenamento e FHS
    // =========================================================
    {
      id: 'm2-q1',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'easy',
      question: 'Seu servidor tem o banco de dados em /var/lib/mysql ficando sem espaço e você instala um novo SSD de 2 TB. Como o Linux integra esse novo disco?',
      options: [
        'Cria automaticamente uma unidade D:\\ e exige reescrever o código do banco para D:\\mysql',
        'Monta ("pendura") o novo SSD diretamente na pasta /var/lib/mysql dentro da árvore única (/)',
        'Substitui o /etc/passwd para apontar todos os usuários para o novo SSD',
        'Move a pasta /proc inteira para o SSD novo para liberar memória RAM',
        'Exige formatar o disco principal primeiro, pois o Linux só aceita 1 disco por servidor'
      ],
      correct: 1,
      hint: 'Analogia da Mansão (/): você abre uma porta no corredor e acopla um novo salão gigante atrás dela, sem atravessar a rua.',
      explanation: 'No Linux não existem letras de unidade. Tudo parte da raiz (/) e novos discos são montados diretamente em pastas da árvore.'
    },
    {
      id: 'm2-q2',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'easy',
      question: 'No LVM (Logical Volume Manager), qual é a sequência correta de camadas, do hardware físico até as partições elásticas?',
      options: [
        'LV (Logical Volume) -> VG (Volume Group) -> PV (Physical Volume)',
        'VG (Volume Group) -> PV (Physical Volume) -> LV (Logical Volume)',
        'PV (Physical Volume) -> VG (Volume Group) -> LV (Logical Volume)',
        'UUID -> FHS -> Inode',
        'PV (Physical Volume) -> LV (Logical Volume) -> BIOS'
      ],
      correct: 2,
      hint: 'Potes de massinha de modelar (discos reais) -> Bola gigante de massinha (balde) -> Bonecos fatiados da bola.',
      explanation: 'No LVM: 1) PV são os discos físicos; 2) VG junta tudo em um balde único; 3) LV fatia os volumes lógicos redimensionáveis a quente.'
    },
    {
      id: 'm2-q3',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'medium',
      question: 'Ao salvar o arquivo "relatorio.pdf", o Linux separa Data Blocks, Inode e Entrada de Diretório. Qual dado NÃO fica guardado dentro do Inode?',
      options: [
        'O dono do arquivo (UID/GID)',
        'As permissões de acesso (rwx)',
        'O tamanho em bytes e as datas de modificação',
        'O nome do arquivo ("relatorio.pdf")',
        'O mapa apontando para os Blocos de Dados no disco'
      ],
      correct: 3,
      hint: 'Guarda-volumes do supermercado: na porta do armário de ferro #42 não está escrito "Mochila do João", só o número!',
      explanation: 'Pegadinha clássica de prova: o Inode guarda todos os metadados, mas NÃO sabe o nome do arquivo! O nome fica na tabela da pasta (Nome -> Inode).'
    },
    {
      id: 'm2-q4',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'hard',
      question: 'Um servidor de banco de dados trava com erro "No space left on device", mas "df -h" mostra 65 GB livres num disco de 100 GB! Qual comando diagnostica o problema real?',
      options: [
        'df -i, revelando que 100% dos Inodes se esgotaram por milhões de arquivos minúsculos',
        'free -m, revelando que a memória RAM da pasta /proc transbordou para o HD',
        'chmod 777 /, pois faltava permissão de gravação na raiz',
        'kill -9 1, pois o systemd travou o contador de gigabytes',
        'ls -l /etc/shadow, verificando se a senha do disco expirou'
      ],
      correct: 0,
      hint: 'O supermercado ainda tem espaço físico, mas acabaram todas as "fichas de armário" numeradas!',
      explanation: 'Quando milhões de arquivinhos de 1 KB consomem todos os Inodes da partição, o disco acusa cheio mesmo com GBs livres. "df -i" mostra IUse% em 100%.'
    },
    {
      id: 'm2-q5',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'medium',
      question: 'Você cria um Hard Link (atalho1) e um Soft Link (atalho2) para "dados.txt". Se você apagar "dados.txt" com "rm", o que acontece com os dois links?',
      options: [
        'Ambos os links quebram imediatamente e os dados somem do disco',
        'atalho1 (Hard Link) continua intacto com os dados; atalho2 (Soft Link) quebra',
        'atalho2 (Soft Link) mantém os dados vivos; atalho1 (Hard Link) quebra',
        'O Linux proíbe apagar "dados.txt" enquanto existir qualquer Soft Link',
        'O Kernel move "dados.txt" para /tmp automaticamente por 30 dias'
      ],
      correct: 1,
      hint: 'Duas chaves físicas iguais do mesmo armário #42 vs um post-it amarelo dizendo "Peça a chave para o João".',
      explanation: 'O Hard Link aponta direto para o mesmo Inode (dados sobrevivem até zerar todos os hard links). O Soft Link aponta para o nome/caminho e quebra.'
    },
    {
      id: 'm2-q6',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'easy',
      question: 'No padrão FHS, qual pasta guarda arquivos que mudam e crescem continuamente (logs, bancos de dados, filas) e qual guarda apenas a pasta pessoal do administrador root?',
      options: [
        '/etc e /home/root',
        '/var e /root',
        '/usr e /',
        '/tmp e /sbin',
        '/proc e /bin'
      ],
      correct: 1,
      hint: 'Variable Data (estoque em movimento) + Suíte Master privativa do dono (não confundir com a barra / pura!).',
      explanation: '/var armazena dados variáveis (logs em /var/log, bancos em /var/lib) e /root é a pasta pessoal exclusiva do superusuário.'
    },
    {
      id: 'm2-q7',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'medium',
      question: 'Qual afirmação descreve corretamente os diretórios /proc e /sys no Linux?',
      options: [
        'São backups compactados em .gz criados pelo logrotate todas as noites',
        'Armazenam os pacotes .deb e .rpm antes de serem instalados pelo apt',
        'São sistemas de arquivos virtuais na RAM que não ocupam 1 byte sequer no disco',
        'Guardam os scripts de inicialização antigos do SysVinit',
        'São pastas compartilhadas públicas onde se aplica o Sticky Bit (+t)'
      ],
      correct: 2,
      hint: 'Igual ao painel digital do carro: quando você desliga o carro, o painel apaga e some; quando liga, mostra tudo ao vivo.',
      explanation: '/proc e /sys são pastas virtuais geradas ao vivo na memória RAM pelo Kernel para expor processos, CPU, memória e parâmetros do sistema.'
    },
    {
      id: 'm2-q8',
      module: 'Módulo 2: Armazenamento & FHS',
      difficulty: 'hard',
      question: 'Por que a "Regra de Ouro" do /etc/fstab recomenda usar o UUID (visto com blkid) em vez de /dev/sdb1 para montar discos automaticamente no boot?',
      options: [
        'Porque o UUID criptografa o disco usando o algoritmo do /etc/shadow',
        'Porque nomes como /dev/sdb1 dependem da ordem de chegada no boot e podem mudar se trocar cabos ou discos',
        'Porque o /etc/fstab não aceita barras "/" na primeira coluna do arquivo',
        'Porque o UUID transforma qualquer partição comum em um Volume Lógico (LVM)',
        'Porque /dev/sdb1 só funciona em partições montadas dentro de /tmp'
      ],
      correct: 1,
      hint: 'Se ontem era /dev/sdb1 e hoje você plugou outro disco, a ordem da fila muda e o servidor trava no boot!',
      explanation: 'Nomes /dev/sdX são atribuídos por ordem de detecção no boot. O UUID é gravado na formatação da partição e nunca muda, evitando falhas no boot.'
    },

    // =========================================================
    // MÓDULO 3: Identidade, Segurança, Permissões e Pacotes
    // =========================================================
    {
      id: 'm3-q1',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'easy',
      question: 'Para o Kernel Linux, usuários são números (UID). Quais faixas de UID correspondem respectivamente ao root, contas de serviço/sistema e usuários humanos comuns?',
      options: [
        'root: 1000 | Serviços: 0 | Humanos: 1 a 999',
        'root: 0 | Serviços: 1 a 999 | Humanos: a partir de 1000',
        'root: 1 | Serviços: 100 a 500 | Humanos: 0 a 99',
        'root: 777 | Serviços: 750 | Humanos: 644',
        'root: 0 | Serviços: acima de 5000 | Humanos: 1 a 999'
      ],
      correct: 1,
      hint: 'O chefão absoluto começa do zero; abaixo de mil ficam os bastidores invisíveis; de mil pra cima entram os humanos!',
      explanation: 'UID 0 é o superusuário root; UIDs de 1 a 999 são reservados para contas de sistema/daemons; usuários humanos começam em 1000.'
    },
    {
      id: 'm3-q2',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'medium',
      question: 'Por que os hashes de senha ficam em /etc/shadow (e não em /etc/passwd) e por que o usuário do Nginx (www-data) usa o shell /usr/sbin/nologin?',
      options: [
        'Porque /etc/passwd é legível por qualquer usuário; /sbin/nologin barra acesso de terminal caso invadam o site',
        'Porque /etc/shadow é público na internet; /sbin/nologin acelera o download de arquivos CSS',
        'Porque /etc/passwd só guarda grupos; /sbin/nologin dá poder temporário de root via SUID',
        'Porque /etc/shadow armazena apenas chaves SSH; /sbin/nologin ativa o firewall Netfilter',
        'Porque o systemd exige que todo servidor web rode com UID 0 e shell /bin/bash'
      ],
      correct: 0,
      hint: 'Separação entre lista telefônica pública e cofre blindado do root + bater a porta na cara do hacker se tentar abrir terminal.',
      explanation: '/etc/passwd pode ser lido por todos, então os hashes com salt foram isolados no /etc/shadow (só root lê). /sbin/nologin impede login interativo na conta de serviço.'
    },
    {
      id: 'm3-q3',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'easy',
      question: 'Qual comando aplica permissão total ao dono (rwx), leitura e execução ao grupo (r-x) e nenhuma permissão para outros (---) no script backup.sh?',
      options: [
        'chmod 640 backup.sh',
        'chmod 755 backup.sh',
        'chmod 750 backup.sh',
        'chmod 705 backup.sh',
        'chmod 650 backup.sh'
      ],
      correct: 2,
      hint: 'Some os pesos octais: r = 4, w = 2, x = 1. Dono (4+2+1), Grupo (4+0+1), Outros (0).',
      explanation: 'rwx = 4+2+1 = 7; r-x = 4+0+1 = 5; --- = 0. Portanto, chmod 750 backup.sh.'
    },
    {
      id: 'm3-q4',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'hard',
      question: 'Uma pasta tem permissão apenas de leitura (r--) para seu usuário, SEM o bit de execução (x). O que acontece ao rodar "ls pasta" e "cd pasta"?',
      options: [
        'Você entra normalmente com cd, mas não consegue listar os nomes dos arquivos',
        'Você vê os nomes com ls, mas recebe Permission Denied ao tentar entrar (cd) ou abrir arquivos lá dentro',
        'Você consegue apagar arquivos com rm, mas não consegue ler o conteúdo de nenhum',
        'O Linux adiciona o bit x automaticamente assim que você digita cd',
        'Nada funciona: nem ls nem cd respondem sem permissão de escrita (w)'
      ],
      correct: 1,
      hint: 'Olhar pela janela de vidro (r) vs ter a chave da porta da sala (x) para dar um passo lá para dentro!',
      explanation: 'Em diretórios, r permite listar nomes e x permite entrar/atravessar (cd). Sem x, você não atravessa a pasta nem acessa arquivos internos.'
    },
    {
      id: 'm3-q5',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'million',
      question: 'O arquivo /srv/projetos/segredo.conf pertence ao root com permissão 400 (-r--------). Mesmo assim, um estagiário sem sudo roda "rm segredo.conf" e apaga o arquivo! Por quê?',
      options: [
        'Porque o comando rm sempre ignora permissões DAC e roda com SUID ativado',
        'Porque o dono root herdou o grupo do estagiário pelo Sticky Bit',
        'Porque apagar (rm) altera a lista da PASTA /srv/projetos, e ela tinha escrita (w) e execução (x) liberadas para o grupo dele',
        'Porque permissão 400 significa leitura e exclusão para qualquer usuário humano com UID >= 1000',
        'Porque o arquivo estava na RAM dentro de /proc e sumiu sozinho'
      ],
      correct: 2,
      hint: 'O rm não toca dentro do arquivo! Ele apenas apaga uma linha na tabela da PASTA (sala) onde o arquivo está.',
      explanation: 'Criar, renomear ou apagar arquivos depende da permissão w+x da PASTA pai (se não houver Sticky Bit), e não das permissões internas do arquivo!'
    },
    {
      id: 'm3-q6',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'hard',
      question: 'Qual bit especial permite que /usr/bin/passwd grave no /etc/shadow sendo executado por usuário comum, e qual impede em /tmp (drwxrwxrwt) que um usuário apague arquivo de outro?',
      options: [
        'SGID (2000) e SUID (4000), respectivamente',
        'SUID (4000) e Sticky Bit (1000), respectivamente',
        'Sticky Bit (1000) e SGID (2000), respectivamente',
        'AppArmor e SELinux, respectivamente',
        'DAC e MAC, respectivamente'
      ],
      correct: 1,
      hint: 'Procuração assinada pelo diretor (SUID = assume identidade do dono) + Geladeira comunitária (Sticky Bit = não jogue fora a marmita do colega).',
      explanation: 'SUID (4000) executa o binário com privilégios do dono (root no passwd). Sticky Bit (1000 / t) restringe a exclusão em pastas compartilhadas ao dono ou root.'
    },
    {
      id: 'm3-q7',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'medium',
      question: 'Por que servidores corporativos usam MAC (SELinux no Red Hat/AlmaLinux ou AppArmor no Ubuntu/Debian) além das permissões tradicionais (DAC)?',
      options: [
        'Para substituir o sistema de Inodes e permitir letras de unidade no Linux',
        'Para colocar uma "coleira de regras" no Kernel limitando o que cada serviço pode acessar, mesmo que seja invadido',
        'Para compactar automaticamente arquivos de log antigos no diretório /var/log',
        'Para fazer o balanceamento de discos físicos dentro de um Volume Group (VG)',
        'Para converter pacotes .deb em pacotes .rpm sem usar a internet'
      ],
      correct: 1,
      hint: 'Mesmo que o nginx tenha permissão DAC ou seja explorado por um hacker, o Kernel barra se ele tentar ler /etc/passwd!',
      explanation: 'O MAC (SELinux/AppArmor) impõe políticas rígidas por serviço no Kernel: o nginx fica restrito a /var/www/html e portas 80/443, bloqueando invasões laterais.'
    },
    {
      id: 'm3-q8',
      module: 'Módulo 3: Segurança & Pacotes',
      difficulty: 'easy',
      question: 'Qual par representa corretamente os gerenciadores de pacotes de ALTO NÍVEL (que baixam de repositórios e resolvem dependências) no Debian/Ubuntu e no Red Hat/Enterprise?',
      options: [
        'dpkg (Debian/Ubuntu) e rpm (Red Hat)',
        'apt (Debian/Ubuntu) e dnf (Red Hat)',
        'fstab (Debian/Ubuntu) e blkid (Red Hat)',
        'systemd (Debian/Ubuntu) e SysVinit (Red Hat)',
        'ufw (Debian/Ubuntu) e iptables (Red Hat)'
      ],
      correct: 1,
      hint: 'O operário local (dpkg/rpm) monta se tiver tudo na caixa; o empreiteiro completo (alto nível) vai à loja buscar as peças que faltam.',
      explanation: 'apt (Debian/Ubuntu) e dnf (Red Hat/Alma/Rocky/Fedora) são gerenciadores de alto nível que resolvem dependências e acionam dpkg/rpm por baixo.'
    },

    // =========================================================
    // MÓDULO 4: Rede, Serviços, Automação e Observabilidade
    // =========================================================
    {
      id: 'm4-q1',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'medium',
      question: 'Qual arquivo é o "Chefe de Trânsito" que define a ordem de resolução de nomes (ex: "hosts: files dns"), fazendo o Linux consultar /etc/hosts antes do DNS?',
      options: [
        '/etc/resolv.conf',
        '/etc/fstab',
        '/etc/nsswitch.conf',
        '/etc/ssh/sshd_config',
        '/etc/crontab'
      ],
      correct: 2,
      hint: 'Ele fica acima dos outros dois na hierarquia: decide se olha primeiro a agenda de bolso (/etc/hosts) ou a lista telefônica mundial (/etc/resolv.conf).',
      explanation: '/etc/nsswitch.conf dita a ordem de busca. Com "hosts: files dns", o sistema checa /etc/hosts primeiro e só pergunta ao DNS de /etc/resolv.conf se não achar.'
    },
    {
      id: 'm4-q2',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'easy',
      question: 'O que compõe exatamente um Socket de Rede e qual faixa de portas é considerada privilegiada (só root ou CAP_NET_BIND_SERVICE podem abrir)?',
      options: [
        'MAC Address + Senha + Porta | Portas 1024 a 65535',
        'Endereço IP + Protocolo (TCP ou UDP) + Número da Porta | Portas 1 a 1023',
        'Hostname + Inode + UID | Portas 0 a 999',
        'Chave Pública + Chave Privada + IP | Portas 8000 a 9000',
        'PID + PPID + TTY | Portas 22 a 443 apenas'
      ],
      correct: 1,
      hint: 'Por isso usuários comuns não conseguem subir um servidor HTTP direto na porta 80 ou HTTPS na 443!',
      explanation: 'Um Socket une IP + Protocolo (TCP/UDP) + Porta. Portas de 1 a 1023 (Well-Known Ports) são privilegiadas pelo Kernel.'
    },
    {
      id: 'm4-q3',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'medium',
      question: 'No OpenSSH com chaves assimétricas, qual chave você coloca em ~/.ssh/authorized_keys no servidor e o que faz um Túnel SSH Local (ssh -L)?',
      options: [
        'Coloca a chave privada no servidor; ssh -L apaga as senhas do /etc/shadow',
        'Coloca a chave pública (.pub) no servidor; ssh -L cria um cano seguro pela porta 22 até um serviço interno (ex: MySQL 3306)',
        'Coloca ambas as chaves no servidor; ssh -L abre a porta 3306 para toda a internet',
        'Coloca a senha em texto puro no /etc/hosts; ssh -L reinicia o daemon sshd',
        'Coloca o certificado SSL do Nginx no servidor; ssh -L converte TCP em UDP'
      ],
      correct: 1,
      hint: 'A chave pública é um cadeado aberto que fica no servidor; a privada nunca sai do seu notebook!',
      explanation: 'A chave pública (.pub) vai no authorized_keys do servidor, enquanto a privada fica protegida no cliente. "ssh -L" encapsula acessos locais seguros pela porta 22.'
    },
    {
      id: 'm4-q4',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'hard',
      question: 'Se um firewall bloqueia todas as conexões vindas da internet, como ele deixa entrar a resposta de uma atualização que o próprio servidor pediu?',
      options: [
        'Porque o comando apt desliga o Netfilter temporariamente durante downloads',
        'Porque o Netfilter é Stateful e libera pacotes cujo estado é ESTABLISHED / RELATED a uma conexão iniciada por dentro',
        'Porque atualizações de pacotes chegam sempre pela porta 22 do SSH',
        'Porque o firewall só inspeciona conexões UDP e ignora o protocolo TCP',
        'Porque arquivos .deb possuem o bit SUID que atravessa qualquer regra de rede'
      ],
      correct: 1,
      hint: 'iptables, nftables, ufw e firewalld são controles remotos para um motor com memória de estado dentro do Kernel!',
      explanation: 'O firewall Netfilter é Stateful: ele bloqueia tentativas externas NEW, mas lembra das conexões abertas pelo servidor e permite o retorno ESTABLISHED/RELATED.'
    },
    {
      id: 'm4-q5',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'easy',
      question: 'Na analogia do "Recepcionista de Hotel de Luxo", por que colocamos o Nginx como Proxy Reverso na frente de uma API Node.js (porta 3000) ou Python (8000)?',
      options: [
        'Para que a API Node.js possa gravar senhas diretamente no /etc/passwd',
        'Para o Nginx cuidar da borda (portas 80/443, SSL/HTTPS, estáticos) e repassar pedidos internamente via 127.0.0.1',
        'Porque Node.js e Python só conseguem usar o protocolo UDP na internet',
        'Para transformar processos filhos em processos zumbis de forma controlada',
        'Para substituir o Kernel do Linux quando o servidor estiver sem espaço em disco'
      ],
      correct: 1,
      hint: 'Os cozinheiros (Node.js/Python) ficam nos fundos focados em cozinhar; o recepcionista de terno atende a porta da rua.',
      explanation: 'O Proxy Reverso (Nginx/HAProxy) centraliza SSL/TLS, portas 80/443 e arquivos estáticos na borda, protegendo os backends internos.'
    },
    {
      id: 'm4-q6',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'medium',
      question: 'Quando roda o comando "30 02 * * 1-5 /scripts/backup.sh" no cron, e qual vantagem o systemd timer oferece com a opção Persistent=true?',
      options: [
        'Roda dia 30 às 02h; Persistent=true evita que o backup rode se o servidor desligar',
        'Roda às 02h30 de segunda a sexta; Persistent=true dispara a tarefa atrasada no próximo boot se o PC estava desligado na hora',
        'Roda a cada 30 segundos em janeiro e maio; Persistent=true compacta o backup em .gz',
        'Roda às 02h30 todo dia 15; Persistent=true impede que o backup use memória RAM',
        'Roda apenas no dia 1 e 5 de fevereiro às 30h; Persistent=true envia um SIGHUP ao GRUB'
      ],
      correct: 1,
      hint: 'Os 5 campos do cron são: Minuto, Hora, Dia do Mês, Mês, Dia da Semana (1-5 = Seg a Sex). O cron comum "esquece" se o servidor estava desligado!',
      explanation: '30 02 * * 1-5 = 02h30 de segunda a sexta. Diferente do cron, um systemd timer com Persistent=true recupera tarefas perdidas quando o servidor liga.'
    },
    {
      id: 'm4-q7',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'easy',
      question: 'Para evitar que um site muito acessado encha o disco com arquivos gigantes em /var/log, qual ferramenta faz rodízio, compactação (.gz) e limpeza periódica?',
      options: [
        'blkid',
        'logrotate',
        'initramfs',
        'nsswitch',
        'fork'
      ],
      correct: 1,
      hint: 'Ele pega o log grande de ontem, compacta em .gz, abre um novo hoje e apaga os mais antigos.',
      explanation: 'O logrotate automatiza a rotação, compressão (.gz) e remoção de logs antigos em /var/log, evitando esgotamento de disco.'
    },
    {
      id: 'm4-q8',
      module: 'Módulo 4: Rede & Observabilidade',
      difficulty: 'million',
      question: 'Um servidor de 4 vCPUs está lentíssimo. O "top" mostra Load Average 16.50, uso de CPU (us) em 2%, mas "wa" em 94% e vários processos no estado D. Qual é o diagnóstico?',
      options: [
        'Falta de núcleos de CPU; basta dobrar para 8 vCPUs que o Load Average zera',
        'Ataque de processos Zumbis (Z) consumindo toda a memória RAM do servidor',
        'Gargalo de Disco/Rede (I/O Wait): a CPU está ociosa, mas processos travaram no estado D esperando o disco responder',
        'O daemon crond entrou em loop infinito rodando backups a cada segundo',
        'O arquivo /etc/resolv.conf está sem DNS e travou o sistema de arquivos /proc'
      ],
      correct: 2,
      hint: 'Supermercado com 4 caixas livres, mas fila gigante porque a maquininha de cartão (disco/I/O) travou!',
      explanation: 'No Linux, Load Average soma fila de CPU (R) + espera ininterrupta de I/O (D). "wa" (I/O Wait) em 94% com CPU livre indica saturação de disco ou rede NFS/iSCSI.'
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QUESTIONS };
  } else {
    global.LINUX_QUIZ_QUESTIONS = QUESTIONS;
  }
})(typeof window !== 'undefined' ? window : globalThis);
