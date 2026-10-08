import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ERP_SOURCE, ERP_IMPORT_REPOSITORY, ErpSourcePort, ErpImportRepositoryPort,
  EntityPlan, planImport,
} from '../domain/erp-import';

export type ErpImportMode = 'dry-run' | 'commit';

const SAMPLE_SIZE = 5;

/**
 * Importação ERP (Oracle) → sistema RFID (Postgres): grupos → categorias,
 * localizações → setores, patrimônios → ativos.
 *
 * 1. Lê Q1–Q4 do Oracle, uma vez cada (antes de abrir transação no Postgres).
 * 2. Carrega o estado local e planeja tudo em memória (domain/planImport).
 * 3. dry-run: devolve o relatório sem gravar. commit: grava em lotes numa
 *    única transação — erro inesperado de banco faz rollback total.
 *
 * Problemas por registro (conflito, categoria ausente...) não abortam: são
 * coletados no relatório e o registro fica de fora. Reexecutar é seguro: a
 * busca é pela chave de origem e registros com erp_hash igual não são tocados.
 */
@Injectable()
export class ErpImportService {
  private readonly logger = new Logger(ErpImportService.name);
  private running = false;

  constructor(
    @Inject(ERP_SOURCE) private source: ErpSourcePort,
    @Inject(ERP_IMPORT_REPOSITORY) private repo: ErpImportRepositoryPort,
  ) {}

  async import(mode: ErpImportMode = 'dry-run') {
    if (this.running)
      throw new ConflictException('Já existe uma importação do ERP em andamento');
    this.running = true;
    try {
      return await this.execute(mode);
    } finally {
      this.running = false;
    }
  }

  private async execute(mode: ErpImportMode) {
    const startedAt = new Date();
    const erp = await this.source.readSnapshot();
    const commit = mode === 'commit';

    const plan = await this.repo.run(commit, async (uow) => {
      const local = await uow.loadState();
      const p = planImport(erp, local, startedAt, randomUUID);
      if (commit) {
        // Ordem obrigatória: ativos referenciam categorias e setores.
        await uow.upsertCategories([...p.categories.create, ...p.categories.update]);
        await uow.upsertSectors([...p.sectors.create, ...p.sectors.update]);
        await uow.upsertAssets([...p.assets.create, ...p.assets.update]);
      }
      return p;
    });

    const finishedAt = new Date();
    const report = {
      mode,
      committed: commit,
      startedAt,
      finishedAt,
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
      erpRows: {
        grupos: erp.groups.length,
        localizacoes: erp.locations.length,
        patrimonios: erp.assets.length,
        localizacaoAtual: erp.assetLocations.length,
      },
      categories: this.summarize(plan.categories, (r) => r),
      sectors: this.summarize(plan.sectors, (r) => r),
      assets: {
        ...this.summarize(plan.assets, (r) => ({
          ...r,
          _categoria: plan.labels.categories.get(r.category_id) ?? null,
          _setor: r.sector_id ? plan.labels.sectors.get(r.sector_id) ?? null : null,
        })),
        withoutSector: plan.assets.withoutSector,
        withoutSectorBreakdown: {
          semHistoricoNoErp: plan.assets.withoutLocationHistory,   // ausentes de Q4
          localizacaoNulaNoErp: plan.assets.withNullLocation,      // em Q4 com LOCALIZACAO NULL
          setorNaoEncontrado: plan.assets.warnings.length,         // localização sem setor importado
        },
        warnings: plan.assets.warnings,
      },
    };
    this.logger.log(
      `Importação ERP (${mode}) em ${report.elapsedMs} ms — ` +
      (['categories', 'sectors', 'assets'] as const)
        .map((e) => `${e}: +${report[e].created} ~${report[e].updated} =${report[e].unchanged} !${report[e].withProblems}`)
        .join(' | '),
    );
    return report;
  }

  /** Contagens + amostra "como seria gravado" (prioriza criados/atualizados). */
  private summarize<R extends { id: string }>(p: EntityPlan<R>, view: (r: R) => object) {
    const sample = [
      ...p.create.map((r) => ({ _acao: 'criar', ...view(r) })),
      ...p.update.map((r) => ({ _acao: 'atualizar', ...view(r) })),
    ].slice(0, SAMPLE_SIZE);
    return {
      created: p.create.length,
      updated: p.update.length,
      unchanged: p.unchanged,
      withProblems: p.problems.length,
      problems: p.problems,
      sample,
    };
  }
}

export type ErpImportReport = Awaited<ReturnType<ErpImportService['import']>>;
