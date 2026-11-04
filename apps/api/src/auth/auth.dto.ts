import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const USERNAME_OR_EMAIL =
  /^(?:[a-zA-Z0-9._-]{3,32}|[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)$/;

export class BootstrapAdminDto {
  @IsString()
  @Length(3, 254)
  @Matches(USERNAME_OR_EMAIL, {
    message: 'username must be a 3–32 character username or a valid email address',
  })
  username!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @IsString()
  @Length(3, 254)
  @Matches(USERNAME_OR_EMAIL, {
    message: 'username must be a 3–32 character username or a valid email address',
  })
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
