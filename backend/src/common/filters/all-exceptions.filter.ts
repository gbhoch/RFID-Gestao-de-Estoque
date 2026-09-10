import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // Violação de unicidade do Postgres (código 23505): ex.: sigla duplicada.
    const pgCode = (exception as any)?.code ?? (exception as any)?.driverError?.code;
    const isUniqueViolation = pgCode === '23505';

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : isUniqueViolation
        ? HttpStatus.CONFLICT
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isUniqueViolation
      ? 'Já existe um registro com esse valor (verifique campos únicos, como a sigla).'
      : this.extractMessage(exception);

    if (status >= 500) this.logger.error(exception);

    // Código legível por máquina, quando a exceção traz um. É o que permite ao
    // cliente distinguir causas dentro do mesmo status HTTP — o coletor Android
    // separa "inventário encerrado" (segure a coleta) de outros 409.
    const code = this.extractCode(exception);

    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: req.url,
      message,
      ...(code ? { code } : {}),
    });
  }

  /** Devolve `code` quando a exceção foi lançada com um objeto que o contenha. */
  private extractCode(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const resp = exception.getResponse();
    const code = (resp as any)?.code;
    return typeof code === 'string' ? code : undefined;
  }

  /**
   * Achata a resposta da exceção numa mensagem legível (string). O corpo padrão
   * do Nest para erros de validação traz `message` como um array de strings;
   * juntamos com "; " para o frontend exibir algo intuitivo em vez de um objeto.
   */
  private extractMessage(exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      return 'Erro interno do servidor. Tente novamente.';
    }
    const resp = exception.getResponse();
    if (typeof resp === 'string') return resp;
    const msg = (resp as any)?.message;
    if (Array.isArray(msg)) return msg.join('; ');
    if (typeof msg === 'string') return msg;
    return (resp as any)?.error ?? exception.message ?? 'Erro na requisição.';
  }
}
