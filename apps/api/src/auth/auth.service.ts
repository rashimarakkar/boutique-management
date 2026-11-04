import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { Model } from 'mongoose';
import { promisify } from 'util';
import { BootstrapAdminDto, LoginDto } from './auth.dto';
import { User, UserDocument } from './user.schema';

const scrypt = promisify(scryptCallback);
const ADMIN_ID = '000000000000000000000001';
const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;
const TOKEN_ISSUER = 'boutique-manager';
const DUMMY_HASH =
  'scrypt$5f4dcc3b5aa765d61d8327deb882cf99$' + '0'.repeat(128);

export type AuthUser = { sub: string; username: string };
type JwtClaims = AuthUser & { iat: number; exp: number; iss: string };

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    config: ConfigService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be configured with at least 32 characters');
    }
    this.jwtSecret = secret;
  }

  async isInitialized() {
    return { initialized: Boolean(await this.users.exists({})) };
  }

  async bootstrapAdmin(dto: BootstrapAdminDto) {
    if (await this.users.exists({})) {
      throw new ConflictException('The admin account has already been created');
    }

    try {
      const user = await this.users.create({
        _id: ADMIN_ID,
        username: dto.username.trim().toLowerCase(),
        passwordHash: await this.hashPassword(dto.password),
      });
      return { username: user.username };
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('The admin account has already been created');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const username = dto.username.trim().toLowerCase();
    const user = await this.users
      .findOne({ _id: ADMIN_ID, username })
      .select('+passwordHash')
      .exec();
    const passwordMatches = await this.verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return {
      token: this.createToken({ sub: ADMIN_ID, username: user.username }),
      user: { username: user.username },
    };
  }

  verifyToken(token: string): AuthUser | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const expectedHeader = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    if (encodedHeader !== expectedHeader) return null;

    const signature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(signature, expectedSignature)
    ) {
      return null;
    }

    try {
      const claims = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<JwtClaims>;
      if (
        claims.sub !== ADMIN_ID ||
        typeof claims.username !== 'string' ||
        claims.iss !== TOKEN_ISSUER ||
        typeof claims.exp !== 'number' ||
        claims.exp <= Math.floor(Date.now() / 1000)
      ) {
        return null;
      }
      return { sub: claims.sub, username: claims.username };
    } catch {
      return null;
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [algorithm, saltHex, hashHex] = storedHash.split('$');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expectedHash = Buffer.from(hashHex, 'hex');
    if (!salt.length || !expectedHash.length) return false;

    const actualHash = (await scrypt(password, salt, expectedHash.length)) as Buffer;
    return (
      actualHash.length === expectedHash.length &&
      timingSafeEqual(actualHash, expectedHash)
    );
  }

  private createToken(user: AuthUser) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        ...user,
        iss: TOKEN_ISSUER,
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS,
      }),
    ).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${this.sign(content).toString('base64url')}`;
  }

  private sign(content: string) {
    return createHmac('sha256', this.jwtSecret).update(content).digest();
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
