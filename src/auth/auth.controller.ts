import { Controller, Post, Body, HttpCode, HttpStatus, Res, Req, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '@/auth/auth.service';
import { RegisterDto } from '@/auth/dto/register.dto';
import { LoginDto } from '@/auth/dto/login.dto';
import { RegisterResponseDto, LoginResponseDto } from '@/auth/dto/auth-response.dto';
import { COOKIE_NAME_REFRESH_TOKEN, NODE_ENV_PRODUCTION, COOKIE_SAME_SITE } from '@/common/constants/auth.constants';
import { ENV_NODE_ENV } from '@/common/constants/env.constants';

const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  private getCookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<string>(ENV_NODE_ENV) === NODE_ENV_PRODUCTION,
      sameSite: COOKIE_SAME_SITE,
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    } as const;
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully', type: RegisterResponseDto })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginResponseDto> {
    const { refreshToken, ...response } = await this.authService.login(dto);
    
    res.cookie(COOKIE_NAME_REFRESH_TOKEN, refreshToken, this.getCookieOptions());

    return response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or missing refresh token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const oldRefreshToken = req.cookies?.[COOKIE_NAME_REFRESH_TOKEN];
    if (!oldRefreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const { accessToken, refreshToken } = await this.authService.refreshAccessToken(oldRefreshToken);

    res.cookie(COOKIE_NAME_REFRESH_TOKEN, refreshToken, this.getCookieOptions());

    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[COOKIE_NAME_REFRESH_TOKEN];
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie(COOKIE_NAME_REFRESH_TOKEN);
    return { success: true };
  }
}
