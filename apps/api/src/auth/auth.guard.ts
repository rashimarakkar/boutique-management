import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthService, AuthUser } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

type AuthenticatedRequest = {
  method: string;
  headers: { cookie?: string; origin?: string };
  user?: AuthUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const origin = request.headers.origin;
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      origin &&
      origin !== this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000')
    ) {
      throw new ForbiddenException('Origin not allowed');
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const token = request.headers.cookie
      ?.split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith('auth_token='))
      ?.slice('auth_token='.length);
    const user = token ? this.auth.verifyToken(token) : null;
    if (!user) throw new UnauthorizedException('Authentication required');

    request.user = user;
    return true;
  }
}
