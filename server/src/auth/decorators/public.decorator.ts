// server/src/auth/decorators/public.decorator.ts
// 公开接口装饰器：标记不需要 JWT 认证的接口
import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
