import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementController } from './presentation/movement.controller';
import { MovementService } from './application/movement.service';
import {
  AssetMovementOrmEntity, AssetLocationHistoryOrmEntity,
} from './infrastructure/movement.orm-entity';
import { AssetOrmEntity } from '../assets/infrastructure/asset.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssetMovementOrmEntity, AssetLocationHistoryOrmEntity, AssetOrmEntity,
    ]),
  ],
  controllers: [MovementController],
  providers: [MovementService],
  exports: [MovementService],
})
export class MovementsModule {}
