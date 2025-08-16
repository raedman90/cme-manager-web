# CME Manager — Frontend

> Aplicação web (React + Vite + TypeScript) para operar materiais, ciclos, metadados de etapa e alertas em tempo real.

---

## 🧰 Stack

- **React** 18 + **TypeScript**
- **Vite**
- **@tanstack/react-query**
- **Tailwind CSS** + **shadcn/ui**
- **Axios** (instância em `src/api/axios.ts` com interceptors)
- **SSE** via `EventSource` (hooks `useAlertsSSE` e `useCycleEventsSSE`)

---

## ⚙️ Variáveis de ambiente

Crie `./.env` na raiz do front:

```ini
VITE_API_BASE_URL=http://localhost:3333
```

> Use a mesma origem configurada no backend (`FRONT_ORIGIN`).

---

## 🚀 Scripts

```bash
# instalar deps
npm i

# rodar em desenvolvimento
npm run dev

# build de produção
npm run build

# preview do build
npm run preview
```

---

## 🔐 Autenticação

- O `AuthProvider` guarda `access_token` (e opcionalmente `refresh_token`) em `localStorage`.
- A instância `axios` (em `src/api/axios.ts`) injeta `Authorization: Bearer <token>` em cada request.
- Em **401**, tenta `POST /auth/refresh` com `{ refreshToken }`. Se falhar, dispara `auth:logout` e limpa sessão.

---

## 🔴 SSE (tempo real)

- **Alertas:** hook `useAlertsSSE()` conecta em:
  ```
  GET /alerts/stream?token=<access_token>
  ```
  e invalida caches (`alerts`, `alerts-counts`, etc.) quando chegam eventos.

- **Ciclos:** hook `useCycleEventsSSE()` conecta em:
  ```
  GET /events/cycles?token=<access_token>
  ```
  e invalida a query de `["cycles"]` quando chegam eventos `cycle:update`.

Ambos usam o `accessToken` do `AuthContext` (ou `localStorage`) e **reconectam** se o token mudar.

---

## 🧩 Componentes relevantes

- **AlertsBell**: ícone no topo com contadores (chama `GET /alerts/counts`) e abre a página de alertas.
- **StageMetaDialog**: formulário de metadados por etapa (`LAVAGEM`, `DESINFECCAO`, `ESTERILIZACAO`, `ARMAZENAMENTO`) com:
  - Prefill via `GET /stage-events/:cycleId/stage-meta/:kind`
  - Bloqueio se já houver meta (com botão **Editar** que destrava)
  - Suporte a `?force=1` no POST para sobrescrever
  - Carregamento de **lotes de solução** e **fita‑teste** conforme `agent` (via `/lots/solutions` e `/lots/test-strips`)
- **Cycles**: lista com filtros, ordenação segura e **paginação** (usa `{ data, total, page, perPage }` do backend).

---

## 🧪 Dicas de teste

1. Faça login e verifique no DevTools que `localStorage.access_token` existe.
2. Abra a página de **Ciclos** e o **AlertsBell** (colocado no Header).
3. Em outro tab, gere um alerta (ex.: via POST no backend). O badge deve atualizar sozinho (SSE).
4. Abra metadados de uma etapa:
   - Se já preenchido, deve vir **prefill** + etiqueta “já preenchido” e botão **Editar**.
   - Em Desinfecção, selecione `Agente` para carregar lotes e exibir validade/observações.
5. Ajuste a **paginação** (5 / 10 / 20 / 50) e confira que o backend retorna paginado.

---

## 🧭 Padrões de API esperados pelo front

- **Lista paginada:**
  ```json
  {
    "data": [ ... ],
    "total": 123,
    "page": 1,
    "perPage": 10
  }
  ```

- **Readiness antes da etapa:**
  ```http
  GET /cycles/:id/readiness?to=DESINFECCAO
  ```

- **Stage meta (prefill):**
  ```http
  GET /stage-events/:cycleId/stage-meta/:kind  # kind ∈ wash|disinfection|sterilization|storage
  ```

- **Stage meta (salvar):**
  ```http
  POST /cycles/:cycleId/stage-meta/:kind[?force=1]
  ```

---

## 🛠 Estrutura (sugestão)

```
src/
  api/
    axios.ts
    cycles.ts
    stageMeta.ts
    alerts.ts
    lots.ts
  components/
    cycles/
      StageMetaDialog.tsx
      CycleForm.tsx
      columns.ts
    alerts/
      AlertsBell.tsx
    materials/
      MaterialForm.tsx
      MedicalNameCombobox.tsx
  hooks/
    useAlertsSSE.ts
    useCycleEventsSSE.ts
  pages/
    Cycles.tsx
    Alerts.tsx
  contexts/
    AuthContext.tsx
```

---

## 🐞 Troubleshooting

- **SSE 401**: verifique se o hook está montando a URL com `?token=<access_token>`. O backend aceita token via query.
- **Paginação não funciona**: assegure que o backend aplica `skip/take` e retorna `total`. O front calcula `totalPages = ceil(total / perPage)`.
- **Zod enum** (mensagem `required_error` em versões antigas): use `.nonempty("mensagem")` ou envolva com `.refine(...)` conforme necessário.

---

## ✅ Boas práticas no front

- Prefira **React Query** para cache/estado de dados remotos.
- Centralize configurações de Axios em `src/api/axios.ts` e re‑use.
- Evite “adivinhar” tokens dentro de hooks; use `AuthContext`.
- Mantenha schemas Zod ao lado dos componentes de formulário para validações claras.
