// server/src/auth/auth.controller.ts
// 认证接口：注册、登录、刷新 Token（公开）；资料/改密（需登录）
import { Controller, Post, Body, UseGuards, Request, Get, HttpCode } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LocalAuthGuard } from './guards/local-auth.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { Public } from './decorators/public.decorator'

/** 提取客户端元信息（trust proxy 开启后 req.ip 取 X-Forwarded-For 对端） */
function clientMeta(req: any) {
  return {
    ip: req.ip ?? req.socket?.remoteAddress,
    userAgent: req.headers?.['user-agent'] as string | undefined,
  }
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Request() req: any, @Body() body: {
    username: string
    email: string
    password: string
    displayName?: string
    orgName?: string
  }) {
    return this.authService.register(body, clientMeta(req))
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @HttpCode(200)
  @Post('login')
  async login(@Request() req: any) {
    return this.authService.login(req.user, clientMeta(req))
  }

  @Public()
  @Post('refresh')
  async refresh(@Request() req: any, @Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken, clientMeta(req))
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Request() req: any, @Body() body: { oldPassword: string; newPassword: string }) {
    return this.authService.changePassword(req.user.userId, body.oldPassword, body.newPassword)
  }
}
