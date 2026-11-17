# Linux Arena: Duo do Milhão

Jogo educativo em tempo real estilo **Kahoot + Show do Milhão** com design inspirado no **Duolingo**, criado a partir da apostila [apostila_completa_de_revis_o_servidores_linux.md](apostila_completa_de_revis_o_servidores_linux.md) para revisão em sala de aula!

---

## Opção 1: Hospedar na Vercel (Acesso Externo via Internet / 4G / Wi-Fi)

O projeto já está pronto para a arquitetura Serverless da **Vercel** (`vercel.json` + `/api/game.js` + `/api/info.js` + camada Redis REST em `lib/redis-store.js`, sem dependências externas).

### Passo a passo para publicar na Vercel

1. **Suba o projeto para um repositório no GitHub** (ou use `npx vercel` na pasta do projeto).
2. **Importe o projeto na Vercel** ([vercel.com/new](https://vercel.com/new)):
   - Framework Preset: **Other** (já configurado pelo `vercel.json`).
   - Clique em **Deploy**.
3. **Conecte um banco Redis gratuito (obrigatório para multi-dispositivos na Vercel):**
   - Como funções Serverless da Vercel são *stateless*, sem um Redis compartilhado cada requisição pode cair em uma instância isolada.
   - No painel do seu projeto na Vercel, vá em **Storage** (ou **Integrations / Marketplace**) $\rightarrow$ adicione **Upstash Redis** (plano gratuito).
   - A Vercel preenche automaticamente as variáveis de ambiente `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (ou `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
   - Faça um **Redeploy** após conectar o Redis. Na TV aparecerá o selo verde `☁️ Nuvem Vercel + Redis Ativo`.
4. **Pronto!** Abra `https://seu-projeto.vercel.app/tv` na TV da sala e os alunos entram pelo QR Code (`https://seu-projeto.vercel.app/play?pin=...`) de qualquer Wi-Fi ou 4G/5G!

---

## Opção 2: Rodar Localmente na Sala (Sem Internet / LAN)

1. Dê um duplo clique em `iniciar_jogo.bat` **ou** execute:
   ```sh
   node server.js
   ```
2. Abra `http://localhost:3000/tv` na TV/projetor da sala.
3. Os alunos apontam a câmera para o **QR Code** (na mesma rede Wi-Fi) ou acessam `/play` com o PIN exibido.

---

## Mecânicas do Jogo

- **32 questões (A até E)** cobrindo os 4 módulos e estudos de caso da apostila.
- **Pontuação Kahoot + Show do Milhão:** base progressiva com **Marcos de Segurança (1.5x)** e **Pergunta do Milhão (2x)** + bônus de velocidade + combo (*streak*).
- **4 Ajudas únicas por aluno:**
  - 🃏 **Cartas:** Elimina 2 ou 3 alternativas erradas.
  - 🦉 **Dica:** Mostra a analogia da apostila para ajudar a lembrar o conceito.
  - ⚡ **2x Pts:** Dobra os pontos da rodada se acertar.
  - ⏭️ **Pular:** Pula com segurança mantendo a sequência (*streak*).
