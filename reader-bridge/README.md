# reader-bridge

Agente que roda **na máquina Windows do leitor** e liga o leitor RFID Chafon
(**CFUHFReader V4.0**, DLLs `CFNetApi/CFComApi/CFHidApi`) ao backend do sistema
via HTTP. O backend continua portátil (Docker/Linux) e só conversa com este
agente pela rede — arquitetura de "bridge".

```
[Etiqueta] ⇄ Leitor CF ⇄ (USB/Serial/TCP) ⇄ reader-bridge (Windows) ⇄ HTTP ⇄ Backend (Docker/Linux)
```

## Por que existe

As DLLs do leitor são **nativas do Windows** e não carregam num container Linux.
O agente as carrega (via FFI/koffi) e expõe um contrato HTTP simples que o backend
consome através do `HttpBridgeReaderService` (ativado por `READER_BRIDGE_URL`).

## Contrato HTTP

| Método | Rota | Corpo | Resposta |
|--------|------|-------|----------|
| GET  | `/health`     | — | `{ status, simulate, transport, allowWrite, connected }` |
| POST | `/inventory`  | `{}` | `{ tags: [{ epc, tid?, rssi? }] }` |
| POST | `/read-bank`  | `{ epc, bank, wordPtr?, wordCount?, accessPassword? }` | `{ dataHex }` |
| POST | `/write-bank` | `{ epc, bank, wordPtr?, dataHex, accessPassword? }` | `{ ok: true }` |
| POST | `/lock`       | `{ epc, bank, lock, permanent?, accessPassword? }` | `{ ok: true }` |

`bank`: `0`=Reservado, `1`=EPC, `2`=TID, `3`=User (igual ao backend). Erros voltam
como `{ message }` com status `400` (dado inválido) ou `503` (leitor indisponível).

## Rodando (modo simulação — sem hardware)

```bash
cd reader-bridge
npm install
copy .env.example .env      # (no Git Bash: cp .env.example .env)
npm start                   # sobe em http://localhost:8720, SIMULATE=true
```

No backend, aponte para o bridge e reinicie:

```
READER_BRIDGE_URL=http://localhost:8720
```

Pronto — a tela de etiquetas passa a "ler/gravar" com dados de exemplo, validando
todo o fluxo (frontend → backend → bridge) **sem risco e sem hardware**.

## Ativando o hardware real

> ⚠️ **Leia antes.** As DLLs vieram **sem documentação de desenvolvimento**, então as
> assinaturas nativas em `src/native.js` são a **melhor reconstrução** a partir dos
> nomes exportados. Precisam ser validadas contra o leitor. Gravação e **lock/kill
> são irreversíveis** — podem inutilizar etiquetas se a assinatura estiver errada.

1. **Copie as DLLs** para esta máquina e ajuste `DLL_DIR` no `.env` (pasta com
   `CFNetApi.dll` etc.).
2. **Cheque a arquitetura das DLLs** e use um Node de mesma arquitetura:
   ```powershell
   # Machine 0x14c = 32-bit (x86) | 0x8664 = 64-bit (x64)
   $b=[IO.File]::ReadAllBytes("$env:DLL_DIR\CFNetApi.dll"); $o=[BitConverter]::ToInt32($b,0x3C)
   '0x{0:X}' -f [BitConverter]::ToUInt16($b,$o+4)
   ```
   Se as DLLs forem **32-bit**, instale/rode o **Node 32-bit** (koffi carrega só DLLs
   de mesma arquitetura).
3. Configure o transporte no `.env` (`TRANSPORT=net|com|hid` + IP/porta ou COM/baud).
4. **Valide a LEITURA primeiro** (inócua), com `ALLOW_WRITE=false`:
   ```
   SIMULATE=false
   ALLOW_WRITE=false
   ```
   Teste `/read-bank` (EPC/TID/User). Se o `dataHex` bater com a etiqueta, as
   assinaturas de leitura estão corretas. Se der erro, ajuste as declarações em
   `src/native.js` (ordem/tipos dos parâmetros, `CALL_CONV`).
5. Só então habilite escrita/lock: `ALLOW_WRITE=true`. Teste `/write-bank` em uma
   etiqueta descartável antes de usar em produção. **Evite `/lock` permanente** até
   ter certeza.

## Instalar como serviço do Windows (opcional)

Use [nssm](https://nssm.cc/) para rodar `node src/server.js` como serviço, de modo que
o bridge suba junto com a máquina do leitor.
