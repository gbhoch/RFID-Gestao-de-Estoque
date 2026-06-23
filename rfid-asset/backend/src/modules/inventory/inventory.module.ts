import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryService } from './application/inventory.service';
import {
  InventorySessionOrmEntity, InventoryReadOrmEntity,
} from './infrastructure/inventory.orm-entity';
import { AssetOrmEntity } from '../assets/infrastructure/asset.orm-entity';
import { RfidTagOrmEntity } from '../rfid-tags/infrastructure/rfid-tag.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventorySessionOrmEntity, InventoryReadOrmEntity,
      AssetOrmEntity, RfidTagOrmEntity,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
