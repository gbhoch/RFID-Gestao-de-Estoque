import { Injectable, Logger } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { ErpConnectionService } from './erp-connection.service';
import {
  ErpSourcePort, ErpSnapshot, ErpGroupRow, ErpLocationRow, ErpAssetRow, ErpAssetLocationRow,
} from '../domain/erp-import';

/*
 * ATENÇÃO — o Oracle é o banco de PRODUÇÃO do ERP.
 * Estas são as ÚNICAS consultas autorizadas na importação. Não alterar
 * tabelas, colunas ou filtros, e não acrescentar outras (nem COUNT, nem
 * consulta ao dicionário). Nenhuma escrita.
 */

/** Q1 — Grupos */
const Q1_GRUPOS = `
SELECT EMPRESA, CODIGO, DESCRICAO
FROM MEGAADM.PATGRPBEM`;

/** Q2 — Localizações */
const Q2_LOCALIZACOES = `
SELECT EMPRESA, CODIGO, DESCRICAO, SITUACAO
FROM MEGAADM.PATLOCALBEM`;

/** Q3 — Patrimônios COM código patrimonial */
const Q3_PATRIMONIOS = `
SELECT EMPRESA, SEQUENCIAL, DESCRICAO, GRUPO_BEM, SITUACAO,
       CODIGO_PATRIMONIAL, DATA_AQUISICAO, OBSERVACAO
FROM MEGAADM.PATBEM
WHERE CODIGO_PATRIMONIAL IS NOT NULL`;

/** Q4 — Localização atual de cada patrimônio com código (uma linha por bem) */
const Q4_LOCALIZACAO_ATUAL = `
SELECT h.EMPRESA, h.BEM, h.LOCALIZACAO, h.DATA_MOVTO
FROM (
    SELECT EMPRESA, BEM, LOCALIZACAO, DATA_MOVTO,
           ROW_NUMBER() OVER (PARTITION BY EMPRESA, BEM
                              ORDER BY DATA_MOVTO DESC) AS RN
    FROM MEGAADM.PATBEMHISTLOC
) h
JOIN MEGAADM.PATBEM b
  ON b.EMPRESA = h.EMPRESA AND b.SEQUENCIAL = h.BEM
WHERE h.RN = 1
  AND b.CODIGO_PATRIMONIAL IS NOT NULL`;

/** Coluna DATE do Oracle → 'YYYY-MM-DD'. O driver entrega DATE no fuso local do processo. */
function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

@Injectable()
export class ErpSourceReader implements ErpSourcePort {
  private readonly logger = new Logger(ErpSourceReader.name);

  constructor(private connection: ErpConnectionService) {}

  readSnapshot(): Promise<ErpSnapshot> {
    // Q3/Q4 varrem tabelas grandes: timeout por round-trip mais folgado.
    return this.connection.withConnection('import', async (conn) => {
      const run = async <T>(label: string, sql: string, fetchInfo?: oracledb.ExecuteOptions['fetchInfo']) => {
        const started = Date.now();
        const r = await conn.execute<T>(sql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchArraySize: 1000,
          fetchInfo,
        });
        const rows = r.rows ?? [];
        this.logger.log(`${label}: ${rows.length} linhas em ${Date.now() - started} ms`);
        return rows;
      };
      // Identificadores longos/textuais chegam como string para não perder precisão.
      const asString = { type: oracledb.STRING };

      const q1 = await run<any>('Q1 PATGRPBEM', Q1_GRUPOS);
      const q2 = await run<any>('Q2 PATLOCALBEM', Q2_LOCALIZACOES);
      const q3 = await run<any>('Q3 PATBEM', Q3_PATRIMONIOS, {
        SEQUENCIAL: asString, CODIGO_PATRIMONIAL: asString,
        OBSERVACAO: asString, // cobre VARCHAR2 e CLOB (sem isso CLOB viria como Lob)
      });
      const q4 = await run<any>('Q4 PATBEMHISTLOC', Q4_LOCALIZACAO_ATUAL, { BEM: asString });

      const groups: ErpGroupRow[] = q1.map((r) => ({
        empresa: Number(r.EMPRESA), codigo: Number(r.CODIGO), descricao: r.DESCRICAO,
      }));
      const locations: ErpLocationRow[] = q2.map((r) => ({
        empresa: Number(r.EMPRESA), codigo: Number(r.CODIGO),
        descricao: r.DESCRICAO, situacao: r.SITUACAO,
      }));
      const assets: ErpAssetRow[] = q3.map((r) => ({
        empresa: Number(r.EMPRESA),
        sequencial: String(r.SEQUENCIAL).trim(),
        descricao: r.DESCRICAO,
        grupoBem: Number(r.GRUPO_BEM),
        situacao: r.SITUACAO,
        codigoPatrimonial: r.CODIGO_PATRIMONIAL,
        dataAquisicao: toIsoDate(r.DATA_AQUISICAO),
        observacao: r.OBSERVACAO,
      }));
      // Todas as linhas da Q4 seguem adiante, inclusive as com LOCALIZACAO NULL
      // (Number(null) daria 0, uma localização inexistente): o domínio as conta à parte.
      const assetLocations: ErpAssetLocationRow[] = q4.map((r) => ({
        empresa: Number(r.EMPRESA), bem: String(r.BEM).trim(),
        localizacao: r.LOCALIZACAO === null ? null : Number(r.LOCALIZACAO),
      }));

      return { groups, locations, assets, assetLocations };
    }, 300_000);
  }
}
