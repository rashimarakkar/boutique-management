import { IsString, Length } from 'class-validator';

export class CreateGarmentTypeDto {
  @IsString()
  @Length(1, 80)
  name!: string;
}
