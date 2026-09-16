// server/src/auth/decorators/roles.decorator.ts
// 角色装饰器：配合 RolesGuard 使用，标注接口所需角色
import { SetMetadata } from '@nestjs/common'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
