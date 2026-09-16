// server/src/auth/auth.service.ts
// 认证服务：注册（自动开通租户）、登录、Token 刷新、密码管理
import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { DatabaseService } from '../database/database.service'
import { config } from '../config/index.js'
import type { UserRole } from '@prisma/client'

interface RegisterDto {
  username: string
  email: string
  password: string
  displayName?: string
  orgName?: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  // ── 注册：同时开通一个租户（工作空间），注册者为租户管理员 ──────
  async register(dto: RegisterDto) {
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

    const tokens = await this.generateTokens(user)
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

    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: undefined },
    })

    const { passwordHash, ...result } = user
    return result
  }

  // ── 登录并返回 Token ─────────────────────────────────────────
  async login(user: any) {
    const tokens = await this.generateTokens(user)
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

  // ── 刷新 Token（轮换）─────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: config.jwt.refreshSecret,
      })

      const user = await this.db.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, email: true, displayName: true, role: true, status: true, tenantId: true },
      })

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('用户不存在或已被禁用')
      }

      const tokens = await this.generateTokens(user)
      return tokens
    } catch {
      throw new UnauthorizedException('Refresh Token 无效或已过期')
    }
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

    return { success: true }
  }

  // ── 内部方法 ─────────────────────────────────────────────────

  private async generateTokens(user: { id: string; username: string; role: string; tenantId: string }) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
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
