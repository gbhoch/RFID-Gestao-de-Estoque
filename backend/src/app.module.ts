import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './config/data-source';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { SectorsModule } from './modules/sectors/sectors.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AssetsModule } from './modules/assets/assets.module';
import { RfidTagsModule } from './modules/rfid-tags/rfid-tags.module';
import { RfidModule } from './modules/rfid/rfid.module';
import { MovementsModule } from './modules/movements/movements.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AuditModule } from './modules/audit/audit.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    AuthModule,
    UsersModule,
    RolesModule,
    SectorsModule,
    CategoriesModule,
    AssetsModule,
    RfidTagsModule,
    RfidModule,
    MovementsModule,
    InventoryModule,
    AuditModule,
    DashboardModule,
    // Pendentes (mesmo molde): ReportsModule (PDF/Excel via export),
    // IntegrationModule (adapter ERP + integration_logs).
  ],
})
export class AppModule {}
