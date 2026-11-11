import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(7) phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateClientDto {
  @IsString() @MinLength(2) @MaxLength(100) @IsNotEmpty() name!: string;
  @IsString() @MinLength(7) @MaxLength(30) @IsNotEmpty() phone!: string;
}
