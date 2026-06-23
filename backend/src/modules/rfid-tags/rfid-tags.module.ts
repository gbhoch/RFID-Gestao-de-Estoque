import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RfidTagController } from './presentation/rfid-tag.controller';
import { RfidTagService } from './application/rfid-tag.service';
import { RfidTagOrmEntity } from './infrastructure/rfid-tag.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([RfidTagOrmEntity])],
  controllers: [RfidTagController],
  providers: [RfidTagService],
  exports: [RfidTagService],
})
export class RfidTagsModule {}
