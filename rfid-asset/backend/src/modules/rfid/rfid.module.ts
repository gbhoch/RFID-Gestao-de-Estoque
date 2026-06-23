import { Module, Injectable, Inject, Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  WebSocketGateway, SubscribeMessage, MessageBody, WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ASSET_REPOSITORY, AssetRepositoryPort } from '../assets/domain/asset';

// ---------- DTO ----------
export class RfidReadDto {
  @ApiProperty() @IsString() @IsNotEmpty() epc: string;
  @ApiProperty() @IsString() @IsNotEmpty() deviceId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() rssi?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() operatorId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() timestamp?: string;
}
export class RfidBatchDto {
  @ApiProperty({ type: [RfidReadDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => RfidReadDto)
  reads: RfidReadDto[];
}

// ---------- Service ----------
@Injectable()
export class RfidIngestionService {
  private readonly logger = new Logger(RfidIngestionService.name);

  constructor(
    @Inject(ASSET_REPOSITORY) private assets: AssetRepositoryPort,
  ) {}

  async register(read: RfidReadDto) {
    const asset = await this.assets.findByEpc(read.epc);
    // Persistência em inventory_reads / audit fica a cargo do módulo de
    // inventário ativo; aqui resolvemos e logamos toda leitura.
    this.logger.log(
      `RFID read epc=${read.epc} device=${read.deviceId} rssi=${read.rssi ?? '-'} ` +
      `asset=${asset?.assetCode ?? 'UNKNOWN'}`,
    );
    return {
      epc: read.epc,
      resolved: !!asset,
      assetId: asset?.id ?? null,
      assetCode: asset?.assetCode ?? null,
      timestamp: read.timestamp ?? new Date().toISOString(),
    };
  }

  async registerBatch(reads: RfidReadDto[]) {
    return Promise.all(reads.map((r) => this.register(r)));
  }
}

// ---------- REST controller ----------
@ApiTags('rfid')
@Controller({ path: 'rfid', version: '1' })
export class RfidController {
  constructor(private service: RfidIngestionService) {}

  @Post('reads')
  reads(@Body() dto: RfidBatchDto) {
    return this.service.registerBatch(dto.reads);
  }
}

// ---------- WebSocket gateway (tempo real) ----------
@WebSocketGateway({ namespace: '/ws/rfid', cors: { origin: '*' } })
export class RfidGateway {
  @WebSocketServer() server: Server;
  constructor(private service: RfidIngestionService) {}

  @SubscribeMessage('rfid:read')
  async onRead(@MessageBody() data: RfidReadDto) {
    const result = await this.service.register(data);
    this.server.emit('rfid:resolved', result); // broadcast para a tela de inventário
    return result;
  }
}

@Module({
  controllers: [RfidController],
  providers: [RfidIngestionService, RfidGateway],
})
export class RfidModule {}
