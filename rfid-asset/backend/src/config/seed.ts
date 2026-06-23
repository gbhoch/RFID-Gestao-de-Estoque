import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import dataSource from './data-source';
import {
  UserEntity, RoleEntity, PermissionEntity,
} from '../modules/auth/infrastructure/auth.orm-entity';

const MODULES = [
  'users','roles','sectors','categories','assets','rfid',
  'movements','inventory','reports','audit','dashboard',
];
const ACTIONS = ['read','write','delete'];

async function run() {
  await dataSource.initialize();
  const permRepo = dataSource.getRepository(PermissionEntity);
  const roleRepo = dataSource.getRepository(RoleEntity);
  const userRepo = dataSource.getRepository(UserEntity);

  // Permissions
  const perms: PermissionEntity[] = [];
  for (const m of MODULES)
    for (const a of ACTIONS)
      perms.push(permRepo.create({ code: `${m}:${a}`, module: m, description: `${a} ${m}` }));
  await permRepo.save(perms);

  // Roles
  const admin = roleRepo.create({ name: 'admin', description: 'Acesso total', isSystem: true, permissions: perms });
  const manager = roleRepo.create({
    name: 'manager', description: 'Gestor',
    permissions: perms.filter((p) => ['assets','inventory','reports','movements','dashboard'].includes(p.module)),
  });
  const operator = roleRepo.create({
    name: 'operator', description: 'Operador',
    permissions: perms.filter(
      (p) =>
        (['inventory', 'movements'].includes(p.module) &&
          (p.code.endsWith(':write') || p.code.endsWith(':read'))) ||
        (['assets', 'rfid'].includes(p.module) && p.code.endsWith(':read')),
    ),
  });
  const auditor = roleRepo.create({
    name: 'auditor', description: 'Somente leitura',
    permissions: perms.filter((p) => p.code.endsWith(':read')),
  });
  await roleRepo.save([admin, manager, operator, auditor]);

  // Admin user
  const exists = await userRepo.findOne({ where: { login: 'admin' } });
  if (!exists) {
    await userRepo.save(userRepo.create({
      name: 'Administrador',
      email: 'admin@empresa.com',
      login: 'admin',
      passwordHash: await bcrypt.hash('Admin@123', 12),
      roleId: admin.id,
      status: 'active',
    }));
  }

  console.log('Seed concluído. Login: admin / Admin@123');
  await dataSource.destroy();
}
run().catch((e) => { console.error(e); process.exit(1); });
