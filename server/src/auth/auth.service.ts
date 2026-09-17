// server/src/auth/auth.service.ts
// 认证服务：注册（自动开通租户）、登录、Token 刷新、密码管理
import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import type { UserRole } from '@prisma/client'

interface RegisterDto {
  username: string
  email: string
  password: string
  displayName?: string
  orgName?: string
}

/** 签发 refresh token 时记录的客户端信息（用于审计与异常排查） */
export interface TokenMeta {
  ip?: string
  userAgent?: string
}

/** jsonwebtoken 风格 TTL（如 30d/12h/30m）→ 秒 */
function ttlSeconds(v: string | number): number {
  if (typeof v === 'number') return v
  const m = /^(\d+)\s*([smhd])$/.exec(String(v).trim())
  if (!m) return 30 * 24 * 3600
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd']
  return Number(m[1]) * mult
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  // ── 注册：同时开通一个租户（工作空间），注册者为租户管理员 ──────
  async register(dto: RegisterDto, meta: TokenMeta = {}) {
    const existing = await this.db.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    })
    if (existing) {
      throw new ConflictException('用户名或邮箱已存在')
    }

    const passwordHash = await bcrypt.hash(dto.password, 12)
    const displayName = dto.displayName || dto.username

    // 租户 + 用户 + 画像在一个事务里创建
    const user = await this.db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.orgName || `${displayName} 的工作空间` },
      })

      const created = await tx.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          passwordHash,
          displayName,
          role: 'ADMIN' as UserRole, // 租户管理员
          tenantId: tenant.id,
        },
        select: { id: true, username: true, email: true, displayName: true, role: true, tenantId: true },
      })

      await tx.userProfile.create({ data: { userId: created.id } })
      return created
    })

    const tokens = await this.issueTokens(user, meta)
    return { user, ...tokens }
  }

  // ── 登录（validateUser 被 LocalStrategy 调用）────────────────
  async validateUser(username: string, password: string) {
    const user = await this.db.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
    })
    if (!user) throw new UnauthorizedException('用户不存在')
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('账号已被禁用')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('密码错误')

    const { passwordHash, ...result } = user
    return result
  }

  // ── 登录并返回 Token ─────────────────────────────────────────
  async login(user: any, meta: TokenMeta = {}) {
    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(meta.ip ? { lastLoginIp: meta.ip.slice(0, 45) } : {}) },
    })
    const tokens = await this.issueTokens(
      { id: user.id, username: user.username, role: user.role, tenantId: user.tenantId },
      meta,
    )
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        tenantId: user.tenantId,
      },
      ...tokens,
    }
  }

  // ── 刷新 Token：一次性轮转 + 重用检测 ─────────────────────────
  async refreshToken(rawRefreshToken: string, meta: TokenMeta = {}) {
    let payload: any
    try {
      payload = this.jwtService.verify(rawRefreshToken, { secret: config.jwt.refreshSecret })
    } catch {
      throw new UnauthorizedException('Refresh Token 无效或已过期')
    }

    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha256(rawRefreshToken) },
    })

    // DB 无记录：旧版无状态 token / 已被清理 / 伪造，一律拒绝并强制重新登录
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh Token 无效或已过期')
    }

    // 收到已撤销的 refresh token = 重放或泄漏：吊销该用户全部会话
    if (stored.revokedAt) {
      await this.revokeAllUserTokens(stored.userId)
      logger.warn('auth: refresh token reuse detected, all sessions revoked', {
        userId: stored.userId, tokenId: stored.id, ip: meta.ip,
      })
      throw new UnauthorizedException('检测到异常登录，请重新登录')
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh Token 无效或已过期')
    }

    const user = await this.db.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, username: true, email: true, displayName: true, role: true, status: true, tenantId: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户不存在或已被禁用')
    }

    // 轮转：签发新对，旧 refresh token 标记撤销并指向继任者（同一事务 + 条件抢占，杜绝并发双花）
    return this.db.$transaction(async (tx) => {
      const tokens = await this.buildTokens(
        { id: user.id, username: user.username, role: user.role, tenantId: user.tenantId },
      )
      const newRow = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(tokens.refreshToken),
          expiresAt: new Date(Date.now() + ttlSeconds(config.jwt.refreshExpiresIn) * 1000),
          ip: meta.ip?.slice(0, 45) || null,
          userAgent: meta.userAgent?.slice(0, 500) || null,
        },
      })
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: newRow.id },
      })
      if (claimed.count === 0) throw new UnauthorizedException('Refresh Token 已被使用，请重新登录')
      return tokens
    })
  }

  /** 吊销用户全部有效 refresh token（改密/检测到重放时调用） */
  private async revokeAllUserTokens(userId: string) {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  // ── 获取当前用户信息 ─────────────────────────────────────────
  async getProfile(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, displayName: true,
        avatar: true, role: true, tenantId: true, createdAt: true,
      },
    })
    if (!user) throw new UnauthorizedException('用户不存在')
    return user
  }

  // ── 修改密码 ─────────────────────────────────────────────────
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('用户不存在')

    const valid = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!valid) throw new UnauthorizedException('原密码错误')

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash },
    })
    // 改密后吊销全部既有会话，强制其他设备用新密码重新登录
    await this.revokeAllUserTokens(userId)

    return { success: true }
  }

  // ── 内部方法 ─────────────────────────────────────────────────

  /** 签发 token 对并把 refresh token（哈希）持久化 */
  private async issueTokens(
    user: { id: string; username: string; role: string; tenantId: string },
    meta: TokenMeta = {},
  ) {
    const tokens = await this.buildTokens(user)
    await this.db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(tokens.refreshToken),
        expiresAt: new Date(Date.now() + ttlSeconds(config.jwt.refreshExpiresIn) * 1000),
        ip: meta.ip?.slice(0, 45) || null,
        userAgent: meta.userAgent?.slice(0, 500) || null,
      },
    })
    return tokens
  }

  /** 只做签名（refresh payload 带 jti；DB 行由调用方持久化/轮转） */
  private async buildTokens(user: { id: string; username: string; role: string; tenantId: string }) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      jti: randomUUID(),
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: config.jwt.refreshSecret,
        expiresIn: config.jwt.refreshExpiresIn as any,
      }),
    ])

    return { accessToken, refreshToken }
  }
}
