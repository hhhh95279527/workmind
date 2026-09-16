// server/src/auth/strategies/jwt.strategy.ts
// JWT 策略：校验 Token 并把用户身份注入 req.user
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { config } from '../../config/index.js'

export interface JwtPayload {
  sub: string // userId
  username: string
  role: string
  tenantId: string
  iat?: number
  exp?: number
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
    })
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException('Token 无效')
    }
    // req.user 全应用统一结构
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      tenantId: payload.tenantId,
    }
  }
}
