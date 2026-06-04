# ufocode-runner

Imagem Docker do runner do **UFOCode** — uma Fly Machine por projeto.

Contém:
- Template inicial Vite + React + TS + Tailwind + shadcn em `/app`
- Mini servidor de controle em Node em `/runner-server` que expõe `/_runner/*` na mesma porta 8080 (vite dev é proxied no resto)
- Entrypoint que monta `/data` (volume Fly), restaura snapshot mais recente do bucket Supabase se houver, e sobe os 2 servidores

## Build local
```bash
docker build -t ufocode-runner .
docker run -p 8080:8080 -e UFOCODE_RUNNER_KEY=dev ufocode-runner
```

## Publicar no GHCR (automático via GH Action)
1. Crie um repositório no GitHub: `ufocode-runner`
2. Copie esta pasta inteira pra raiz dele
3. Push pra branch `main`
4. A action `.github/workflows/release.yml` builda e publica em `ghcr.io/<owner>/ufocode-runner:latest`
5. Torne o package público (Settings → Packages → ufocode-runner → Change visibility)
6. No Lovable, ajuste o secret `UFOCODE_RUNNER_IMAGE` para `ghcr.io/<owner>/ufocode-runner:latest`

## Variáveis de ambiente esperadas
| Var | Origem | Função |
|---|---|---|
| `UFOCODE_RUNNER_KEY` | secret na Fly Machine | autentica chamadas `/_runner/*` |
| `UFOCODE_APP` | injetado pelo provisioner | app name (igual a `<app>.fly.dev`) |
| `PORT` | Fly | 8080 |

## Endpoints internos (`/_runner/*`)
| Método | Rota | Body | Resposta |
|---|---|---|---|
| GET | `/_runner/health` | — | `{ ok, uptime_s }` |
| GET | `/_runner/files` | — | `{ files: string[] }` |
| GET | `/_runner/file?path=...` | — | `{ content }` |
| POST | `/_runner/apply-patch` | `{ files: [{path, content}] }` | `{ ok, applied }` |
| POST | `/_runner/delete-file` | `{ path }` | `{ ok }` |
| POST | `/_runner/restart` | — | `{ ok }` |

Todos exigem header `x-runner-key: <UFOCODE_RUNNER_KEY>`.