import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService, AuthUser } from './auth.service';
import { BootstrapAdminDto, LoginDto } from './auth.dto';
import { Public } from './public.decorator';

type AuthenticatedRequest = { user: AuthUser };
type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  maxAge?: number;
  path: string;
};
type CookieResponse = {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: CookieOptions): void;
};

const COOKIE_NAME = 'auth_token';
const COOKIE_LIFETIME_MS = 8 * 60 * 60 * 1000;
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('status')
  status() {
    return this.auth.isInitialized();
  }

  @Public()
  @Post('bootstrap')
  bootstrap(
    @Body() dto: BootstrapAdminDto,
    @Headers('content-type') contentType: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new BadRequestException('Content-Type must be application/json');
    }
    return this.auth.bootstrapAdmin(dto).then(async (user) => {
      
      const login = await this.auth.login(dto);
      response.cookie(COOKIE_NAME, login.token, {
        ...cookieOptions(),
        maxAge: COOKIE_LIFETIME_MS,
      });
      return { user };
    });
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.auth.login(dto);
    response.cookie(COOKIE_NAME, result.token, {
      ...cookieOptions(),
      maxAge: COOKIE_LIFETIME_MS,
    });
    return { user: result.user };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) response: CookieResponse) {
    response.clearCookie(COOKIE_NAME, cookieOptions());
    return { success: true };
  }

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return { user: { username: request.user.username } };
  }
}
