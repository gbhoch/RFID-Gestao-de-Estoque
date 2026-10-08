import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as oracledb from 'oracledb';

/**
 * Conexão com o Oracle do ERP — SOMENTE LEITURA.
 *
 * Usa o oracledb em modo Thin (padrão no 6.x): JavaScript puro, sem Oracle
 * Instant Client, por isso roda na imagem node:alpine. Exige Oracle 12.1+.
 * Abre uma conexão avulsa por chamada (sem pool) e só executa SELECT.
 * Usado pelo diagnóstico (test-connection) e pela importação (ErpSourceReader).
 */
@Injectable()
export class ErpConnectionService {
  private readonly logger = new Logger(ErpConnectionService.name);

  /** Lê e valida as credenciais ERP_ORACLE_* do ambiente. */
  private config() {
    const cfg = {
      host: process.env.ERP_ORACLE_HOST,
      port: process.env.ERP_ORACLE_PORT || '1521',
      service: process.env.ERP_ORACLE_SERVICE,
      user: process.env.ERP_ORACLE_USER,
      password: process.env.ERP_ORACLE_PASSWORD,
    };
    const missing = Object.entries({
      ERP_ORACLE_HOST: cfg.host,
      ERP_ORACLE_SERVICE: cfg.service,
      ERP_ORACLE_USER: cfg.user,
      ERP_ORACLE_PASSWORD: cfg.password,
    }).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      throw new ServiceUnavailableException({
        message: `Configuração do ERP incompleta: defina ${missing.join(', ')}`,
        code: 'ERP_CONFIG',
      });
    }
    return { ...cfg, connectString: `${cfg.host}:${cfg.port}/${cfg.service}` };
  }

  private open(cfg: ReturnType<ErpConnectionService['config']>) {
    return oracledb.getConnection({
      user: cfg.user,
      password: cfg.password,
      connectString: cfg.connectString,
      connectTimeout: 15,          // s — rede/rota: falha rápido em vez de travar
      transportConnectTimeout: 10, // s
    });
  }

  /**
   * Abre uma conexão avulsa, entrega a `fn` e fecha ao final. Quem chama é
   * responsável por executar somente SELECT. Falhas de driver/servidor viram
   * 503 com o código NJS-/ORA- original.
   */
  async withConnection<T>(
    stage: string,
    fn: (conn: oracledb.Connection) => Promise<T>,
    callTimeoutMs = 30_000,
  ): Promise<T> {
    const cfg = this.config();
    const mode = oracledb.thin ? 'thin' : 'thick';
    let conn: oracledb.Connection | undefined;
    try {
      conn = await this.open(cfg);
      conn.callTimeout = callTimeoutMs; // ms por round-trip
      return await fn(conn);
    } catch (err: any) {
      const code = err?.code ?? 'ERP_ERROR';
      this.logger.error(`ERP ${stage} falhou (${mode}, ${cfg.connectString}): ${err?.message}`);
      throw new ServiceUnavailableException({
        message: `Falha na etapa '${stage}' (modo ${mode}, ${cfg.connectString}): ${err?.message}`,
        code,
      });
    } finally {
      await conn?.close().catch(() => undefined);
    }
  }

  async testConnection() {
    const cfg = this.config();
    const mode = oracledb.thin ? 'thin' : 'thick';
    const { connectString } = cfg;
    const started = Date.now();
    let stage = 'connect';
    let conn: oracledb.Connection | undefined;
    try {
      conn = await this.open(cfg);
      conn.callTimeout = 30_000;     // ms por round-trip

      stage = 'dual';
      await conn.execute('SELECT 1 FROM DUAL');

      stage = 'patbem';
      const r = await conn.execute<{ TOTAL: number }>(
        'SELECT COUNT(*) AS TOTAL FROM MEGAADM.PATBEM',
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return {
        ok: true,
        mode,
        connectString,
        serverVersion: conn.oracleServerVersionString,
        patbemCount: r.rows?.[0]?.TOTAL ?? null,
        elapsedMs: Date.now() - started,
      };
    } catch (err: any) {
      // err.code: NJS-xxx (driver/rede) ou ORA-xxxxx (servidor/credencial/objeto)
      const code = err?.code ?? 'ERP_ERROR';
      this.logger.error(`ERP ${stage} falhou (${mode}, ${connectString}): ${err?.message}`);
      throw new ServiceUnavailableException({
        message: `Falha na etapa '${stage}' (modo ${mode}, ${connectString}): ${err?.message}`,
        code,
      });
    } finally {
      await conn?.close().catch(() => undefined);
    }
  }
}
