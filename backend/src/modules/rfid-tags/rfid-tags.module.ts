import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RfidTagController } from './presentation/rfid-tag.controller';
import { RfidTagService } from './application/rfid-tag.service';
import { RfidTagOrmEntity } from './infrastructure/rfid-tag.orm-entity';
import { RFID_READER, StubRfidReaderService } from './infrastructure/rfid-reader.stub';
import { HttpBridgeReaderService } from './infrastructure/http-bridge-reader.service';

@Module({
  imports: [TypeOrmModule.forFeature([RfidTagOrmEntity])],
  controllers: [RfidTagController],
  providers: [
    RfidTagService,
    // Porta do leitor: com READER_BRIDGE_URL definido, encaminha as operações
    // físicas ao reader-bridge (agente no Windows que fala com as CF*Api.dll).
    // Sem a variável, cai no stub (503 "aguardando leitor").
    {
      provide: RFID_READER,
      useFactory: () =>
        process.env.READER_BRIDGE_URL
          ? new HttpBridgeReaderService()
          : new StubRfidReaderService(),
    },
  ],
  exports: [RfidTagService],
})
export class RfidTagsModule {}
